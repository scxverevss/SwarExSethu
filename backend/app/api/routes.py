"""SwarExSethu HTTP API routes."""

import io
import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.caregiver import AlertSeverity, fire_alert
from app.audio.asr import ASRResult, get_asr_provider
from app.audio.tts import TTSResult, get_tts_provider
from app.config import settings
from app.api.deps import get_engine
from app.database import AsyncSessionLocal
from app.engine.state_machine import ConversationEngine
from app.models import (
    CaregiverAlert,
    CheckInSession,
    ConversationTurn,
    MedicationAdherenceLog,
    MedicationSchedule,
    SessionState,
    UserProfile,
)
from app.schemas import (
    CheckInSessionOut,
    ConversationTurnOut,
    DigestOut,
    MessageIn,
    MessageOut,
    MedicationAdherenceLogOut,
    MedicationScheduleCreate,
    MedicationScheduleOut,
    MedicationScheduleUpdate,
    MedicationCheckIn,
    TurnIn,  # noqa: F401  new
    TranscribeOut,
    UserProfileCreate,
    UserProfileOut,
    UserProfileUpdate,
)

router = APIRouter()


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


# ---------------------------------------------------------------------------
# Profiles
# ---------------------------------------------------------------------------

@router.get("/profiles", response_model=List[UserProfileOut])
async def list_profiles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserProfile).order_by(UserProfile.id.desc()))
    return result.scalars().all()


@router.post("/profiles", response_model=UserProfileOut)
async def create_profile(payload: UserProfileCreate, db: AsyncSession = Depends(get_db)):
    profile = UserProfile(**payload.model_dump())
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return profile


@router.get("/profiles/{profile_id}", response_model=UserProfileOut)
async def get_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(UserProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.put("/profiles/{profile_id}", response_model=UserProfileOut)
async def update_profile(profile_id: int, payload: UserProfileUpdate,
                         db: AsyncSession = Depends(get_db)):
    profile = await db.get(UserProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    await db.flush()
    await db.refresh(profile)
    return profile


# ---------------------------------------------------------------------------
# Medications
# ---------------------------------------------------------------------------

@router.get("/medications", response_model=List[MedicationScheduleOut])
async def list_medications(profile_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MedicationSchedule).where(
            MedicationSchedule.profile_id == profile_id,
            MedicationSchedule.is_active == True,  # noqa: E712
        ).order_by(MedicationSchedule.time_slot, MedicationSchedule.name)
    )
    return result.scalars().all()


@router.post("/medications", response_model=MedicationScheduleOut)
async def create_medication(payload: MedicationScheduleCreate,
                            db: AsyncSession = Depends(get_db)):
    med = MedicationSchedule(**payload.model_dump())
    db.add(med)
    await db.flush()
    await db.refresh(med)
    return med


@router.put("/medications/{med_id}", response_model=MedicationScheduleOut)
async def update_medication(med_id: int, payload: MedicationScheduleUpdate,
                            db: AsyncSession = Depends(get_db)):
    med = await db.get(MedicationSchedule, med_id)
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(med, field, value)
    await db.flush()
    await db.refresh(med)
    return med


@router.post("/medications/checkin")
async def medication_checkin(payload: MedicationCheckIn,
                             db: AsyncSession = Depends(get_db)):
    log = MedicationAdherenceLog(
        medication_id=payload.medication_id,
        taken=payload.taken,
        source="voice",
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)
    return {"ok": True, "log_id": log.id, "taken": payload.taken}



# ---------------------------------------------------------------------------
# Check-in sessions
# ---------------------------------------------------------------------------

class SessionStartIn(BaseModel):
    profile_id: int


@router.post("/sessions/start", response_model=MessageOut)
async def start_session(payload: SessionStartIn,
                        engine: ConversationEngine = Depends(get_engine)):
    profile = await engine.db.get(UserProfile, payload.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return await engine.start_session(profile)


class TurnIn(BaseModel):
    text: str
    asr_confidence: Optional[float] = None
    snr_db: Optional[float] = None
    language: Optional[str] = "en"


@router.post("/sessions/{session_id}/message", response_model=MessageOut)
async def session_message(
    session_id: int,
    payload: TurnIn,
    engine: ConversationEngine = Depends(get_engine),
):
    session = await engine.db.get(CheckInSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    profile = await engine.db.get(UserProfile, session.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return await engine.process_turn(
        session, profile, payload.text,
        asr_confidence=payload.asr_confidence,
        snr_db=payload.snr_db,
        input_source=payload.input_source,
    )


@router.get("/sessions/{session_id}", response_model=CheckInSessionOut)
async def get_session(session_id: int, db: AsyncSession = Depends(get_db)):
    session = await db.get(CheckInSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/sessions/{session_id}/turns", response_model=List[ConversationTurnOut])
async def list_turns(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ConversationTurn).where(ConversationTurn.session_id == session_id)
        .order_by(ConversationTurn.turn_index)
    )
    return result.scalars().all()



# ---------------------------------------------------------------------------
# Audio: transcribe & synthesize
# ---------------------------------------------------------------------------

@router.post("/audio/transcribe", response_model=TranscribeOut)
async def transcribe_audio(file: UploadFile = File(...)):
    asr = get_asr_provider()
    audio_bytes = await file.read()
    try:
        result: ASRResult = await asr.transcribe(audio_bytes)
    except NotImplementedError:
        # Cloud not configured -> deterministic fallback already handles it
        result = await get_asr_provider().transcribe(audio_bytes)
    return TranscribeOut(
        transcript=result.transcript,
        language=result.language,
        confidence=result.confidence,
        words=result.words,
        telemetry=result.telemetry,
    )


@router.post("/audio/synthesize")
async def synthesize_speech(text: str, language: str = "en"):
    tts = get_tts_provider()
    result: TTSResult = await tts.synthesize(text, language)
    return StreamingResponse(
        io.BytesIO(result.audio_bytes),
        media_type="audio/mpeg" if result.format == "mp3" else "audio/wav",
        headers={"X-TTS-Provider": result.provider, "X-TTS-Voice": result.voice},
    )


@router.get("/audio/wind-down/ragas")
async def list_ragas():
    from app.audio.wind_down import list_ragas as _list
    return _list()



# ---------------------------------------------------------------------------
# Caregiver alerts
# ---------------------------------------------------------------------------

@router.get("/alerts", response_model=List[dict])
async def list_alerts(profile_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CaregiverAlert).where(CaregiverAlert.profile_id == profile_id)
        .order_by(CaregiverAlert.created_at.desc())
    )
    return [
        {
            "id": a.id,
            "severity": a.severity,
            "trigger_reason": a.trigger_reason,
            "acknowledged": a.acknowledged,
            "acknowledged_at": a.acknowledged_at,
            "delivery_log": a.delivery_log,
            "created_at": a.created_at,
            "session_id": a.session_id,
        }
        for a in result.scalars().all()
    ]


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: int, db: AsyncSession = Depends(get_db)):
    alert = await db.get(CaregiverAlert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.acknowledged = True
    alert.acknowledged_at = datetime.now(timezone.utc)
    await db.flush()
    return {"ok": True, "alert_id": alert.id, "acknowledged": True}


# ---------------------------------------------------------------------------
# Digest
# ---------------------------------------------------------------------------

@router.get("/digest", response_model=DigestOut)
async def get_digest(profile_id: int, days: int = 7, db: AsyncSession = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    sessions_result = await db.execute(
        select(CheckInSession).where(
            CheckInSession.profile_id == profile_id,
            CheckInSession.started_at >= since,
        )
    )
    sessions = sessions_result.scalars().all()
    red_flags = sum(1 for s in sessions if s.red_flag)

    # adherence percent in window
    meds_result = await db.execute(
        select(MedicationSchedule).where(
            MedicationSchedule.profile_id == profile_id,
            MedicationSchedule.is_active == True,  # noqa: E712
        )
    )
    meds = meds_result.scalars().all()
    total_due = 0
    taken_count = 0
    for m in meds:
        logs_result = await db.execute(
            select(MedicationAdherenceLog).where(
                MedicationAdherenceLog.medication_id == m.id,
                MedicationAdherenceLog.taken_at >= since,
            )
        )
        logs = logs_result.scalars().all()
        total_due += len(logs)
        taken_count += sum(1 for l in logs if l.taken)
    adherence = (taken_count / total_due * 100) if total_due else 100.0

    # recent alerts
    alerts_result = await db.execute(
        select(CaregiverAlert).where(
            CaregiverAlert.profile_id == profile_id,
            CaregiverAlert.created_at >= since,
        ).order_by(CaregiverAlert.created_at.desc()).limit(5)
    )
    recent_alerts = alerts_result.scalars().all()

    summary = (
        f"{len(sessions)} check-in session(s) in the last {days} days. "
        f"Medication adherence: {adherence:.0f}%. "
        f"{red_flags} red-flag alert(s)."
    )

    return DigestOut(
        profile_id=profile_id,
        period_days=days,
        sessions_count=len(sessions),
        adherence_percent=round(adherence, 1),
        red_flags=red_flags,
        summary=summary,
        recent_alerts=recent_alerts,
    )


# ---------------------------------------------------------------------------
# WebSocket streaming (low-latency)
# ---------------------------------------------------------------------------

@router.websocket("/ws/stream/{session_id}")
async def websocket_stream(websocket: WebSocket, session_id: int):
    await websocket.accept()
    async with AsyncSessionLocal() as db:
        engine = ConversationEngine(db, get_asr_provider(), get_tts_provider(), get_alert_sender())
        session = await db.get(CheckInSession, session_id)
        if not session:
            await websocket.close(code=4004)
            return
        profile = await db.get(UserProfile, session.profile_id)
        try:
            while True:
                data = await websocket.receive_text()
                msg = json.loads(data)
                text = msg.get("text", "")
                out = await engine.process_turn(
                    session, profile, text,
                    asr_confidence=msg.get("asr_confidence"),
                    snr_db=msg.get("snr_db"),
                )
                await websocket.send_json(out.model_dump())
        except WebSocketDisconnect:
            pass

