"""SwarExSethu end-to-end integration tests.

Covers: (a) multi-turn code-switched symptom check-in,
        (b) low-confidence noise fallback,
        (c) red-flag escalation trigger,
        (d) caregiver digest generation.

Run inside the Docker container (deps installed):
    docker compose exec backend pytest -q
"""

import asyncio
import os

# Point SQLAlchemy at a throwaway SQLite file BEFORE importing the app, so the
# engine created at import time uses the test DB.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:////tmp/swarex_test_e2e.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.api.deps import get_engine  # noqa: E402
from app.database import AsyncSessionLocal, init_db  # noqa: E402
from app.engine.state_machine import ConversationEngine  # noqa: E402
from app.alerts.caregiver import AlertSender, AlertDelivery  # noqa: E402


# ---------------------------------------------------------------------------
# Mock providers (zero network, zero keys)
# ---------------------------------------------------------------------------

class MockAlertSender(AlertSender):
    """Captures alerts instead of hitting real webhooks/email/Telegram."""

    def __init__(self) -> None:
        self.sent = []

    async def send(self, profile, alert, message: str) -> AlertDelivery:
        self.sent.append(
            {
                "alert_id": alert.id,
                "severity": alert.severity,
                "reason": alert.trigger_reason,
                "message": message,
            }
        )
        return AlertDelivery("mock", True, "mock-delivered")


mock_alerts = MockAlertSender()


async def engine_override():
    """Yield a ConversationEngine backed by the test SQLite file."""
    async with AsyncSessionLocal() as db:
        yield ConversationEngine(db, None, None, mock_alerts)


app.dependency_overrides[get_engine] = engine_override

client = TestClient(app)


def setup_module() -> None:
    asyncio.run(init_db())


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def create_profile(language: str = "hi", with_webhook: bool = False) -> dict:
    payload = {
        "elder_name": "Test Amma",
        "age": 72,
        "preferred_language": language,
        "baseline_conditions": "Hypertension",
        "emergency_contact": "112",
        "caregiver_webhook": "https://mock.example/webhook" if with_webhook else "",
        "caregiver_email": "",
        "caregiver_telegram": "",
    }
    r = client.post("/api/profiles", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def start_session(profile_id: int) -> dict:
    r = client.post("/api/sessions/start", json={"profile_id": profile_id})
    assert r.status_code == 200, r.text
    return r.json()


def send_message(session_id: int, text: str, confidence=None, language="hi") -> dict:
    body = {"text": text, "language": language}
    if confidence is not None:
        body["asr_confidence"] = confidence
    r = client.post(f"/api/sessions/{session_id}/message", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def alerts_for(profile_id: int) -> list:
    r = client.get(f"/api/alerts?profile_id={profile_id}")
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# (a) multi-turn code-switched symptom check-in
# ---------------------------------------------------------------------------

def test_multiturn_code_switched_checkin():
    profile = create_profile("hi")
    out = start_session(profile["id"])
    assert out["state"] == "listening"
    assert out["reply_text"]
    assert out["language"] == "hi"

    # Turn 1: Hinglish dizziness, no duration -> clarifying question #1
    r = send_message(out["session_id"], "chakkar a raha hai", confidence=0.9)
    assert r["state"] == "clarifying"
    assert r["clarifying_question"] is True
    assert r["reply_text"]

    # Turn 2: provide duration -> guidance + summary
    r = send_message(out["session_id"], "2 din se", confidence=0.9)
    assert r["state"] in ("guidance", "summary")
    assert r["summary"]

    # Clarifying counter respected
    r2 = client.get(f"/api/sessions/{out['session_id']}")
    assert r2.json()["clarifying_questions_asked"] == 1


def test_clarifying_loop_capped_at_two():
    profile = create_profile("en")
    out = start_session(profile["id"])

    # generic pain, no duration -> q1 (onset/duration)
    r = send_message(out["session_id"], "I have pain", confidence=0.9)
    assert r["state"] == "clarifying"
    assert r["clarifying_question"] is True

    # duration given, but hydration still missing -> q2 (hydration)
    r = send_message(out["session_id"], "since yesterday", confidence=0.9)
    assert r["state"] == "clarifying"
    assert r["clarifying_question"] is True

    # hydration given -> now guidance (no third clarifying question)
    r = send_message(out["session_id"], "I drank water", confidence=0.9)
    assert r["state"] in ("guidance", "summary")
    r2 = client.get(f"/api/sessions/{out['session_id']}")
    assert r2.json()["clarifying_questions_asked"] == 2


# ---------------------------------------------------------------------------
# (b) low-confidence noise fallback
# ---------------------------------------------------------------------------

def test_low_confidence_noise_fallback():
    profile = create_profile("hi")
    out = start_session(profile["id"])

    r = send_message(out["session_id"], "something", confidence=0.4)
    assert r["state"] == "noise_fallback"
    assert r["clarifying_question"] is False
    # repeat prompt in Hindi
    assert any(w in r["reply_text"] for w in ["samajh", "artham", "arthavagilla", "theriyavillai", "catch"])


# ---------------------------------------------------------------------------
# (c) red-flag escalation trigger
# ---------------------------------------------------------------------------

def test_red_flag_escalation():
    profile = create_profile("hi", with_webhook=True)
    out = start_session(profile["id"])

    before = len(alerts_for(profile["id"]))

    r = send_message(out["session_id"], "seene mein dard hai", confidence=0.95)
    assert r["state"] == "escalated"
    assert r["escalation"] is not None
    assert r["escalation"]["level"] == "urgent_red_flag"
    assert r["escalation"]["call_emergency"] == "112"
    assert "calm" in r["reply_text"].lower() or "shant" in r["reply_text"].lower()

    # urgent_red_flag alert persisted
    after = alerts_for(profile["id"])
    assert len(after) == before + 1
    alert = after[0]
    assert alert["severity"] == "urgent_red_flag"
    assert alert["acknowledged"] is False

    # UI locked into escalation card on subsequent messages
    r2 = send_message(out["session_id"], "still hurting", confidence=0.9)
    assert r2["state"] == "escalated"
    assert r2["escalation"] is not None

    # mock webhook was fired
    assert any(s["severity"] == "urgent_red_flag" for s in mock_alerts.sent), mock_alerts.sent


# ---------------------------------------------------------------------------
# (d) caregiver digest generation
# ---------------------------------------------------------------------------

def test_caregiver_digest():
    profile = create_profile("en")
    out = start_session(profile["id"])
    # generate a routine session so digest has data
    send_message(out["session_id"], "I am fine, slept well", confidence=0.9)

    r = client.get(f"/api/digest?profile_id={profile['id']}&days=7")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["profile_id"] == profile["id"]
    assert d["period_days"] == 7
    assert isinstance(d["summary"], str) and d["summary"]
    assert d["sessions_count"] >= 1
    assert "adherence_percent" in d

    # alerts list endpoint works
    r2 = client.get(f"/api/alerts?profile_id={profile['id']}")
    assert r2.status_code == 200


# ---------------------------------------------------------------------------
# (e) Wispr Flow integration
# ---------------------------------------------------------------------------

def test_wispr_flow_checkin():
    """A code-switched check-in submitted via Wispr Flow should flow through
    NLU, clarifying questions (if needed), and caregiver digest generation."""

    profile = create_profile("hi", with_webhook=True)
    out = start_session(profile["id"])

    # Wispr Flow dictation: Hinglish chest pain (could be red flag)
    r = send_message(
        out["session_id"],
        "seene mein dard",
        confidence=0.95,
        language="hi",
        input_source="wispr_flow",
    )
    # Wispr Flow bypasses SNR rejection, so even with moderate confidence
    # the message is accepted and runs full triage.
    assert r["state"] in ("clarifying", "escalated", "guidance", "summary")

    # If clarifying questions were needed, they should be within the max 2 limit.
    if r["state"] == "clarifying":
        # Second turn: provide duration
        r2 = send_message(
            out["session_id"],
            "2 din se",
            confidence=0.9,
            language="hi",
            input_source="wispr_flow",
        )
        assert r2["state"] in ("guidance", "summary")

    # Caregiver alerts should have been created (Wispr Flow still runs red-flag guardrails)
    after = alerts_for(profile["id"])
    assert len(after) >= 1
    # Summary/dashboard should reflect the check-in
    r3 = client.get(f"/api/digest?profile_id={profile['id']}&days=7")
    assert r3.status_code == 200, r3.text
    d = r3.json()
    assert d["sessions_count"] >= 1