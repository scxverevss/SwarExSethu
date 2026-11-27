"""Caregiver alerting: create alerts and fire configured delivery channels."""

import json
from dataclasses import dataclass
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class AlertDelivery:
    channel: str
    ok: bool
    detail: str = ""


class AlertSender:
    """Interface for caregiver notification channels."""

    async def send(self, profile, alert, message: str) -> AlertDelivery:
        raise NotImplementedError


class WebhookAlertSender(AlertSender):
    """POST alert JSON to the caregiver webhook URL."""

    def __init__(self, webhook_url: str) -> None:
        self.webhook_url = webhook_url

    async def send(self, profile, alert, message: str) -> AlertDelivery:
        import httpx

        payload = {
            "alert_id": alert.id,
            "elder_name": profile.elder_name,
            "severity": alert.severity,
            "trigger_reason": alert.trigger_reason,
            "message": message,
            "created_at": str(alert.created_at),
        }
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.post(self.webhook_url, json=payload)
            return AlertDelivery("webhook", resp.status_code < 300,
                                 f"HTTP {resp.status_code}")
        except Exception as exc:  # pragma: no cover - network
            return AlertDelivery("webhook", False, str(exc))


class EmailAlertSender(AlertSender):
    """Placeholder email sender (logs intent; wire SMTP in production)."""

    async def send(self, profile, alert, message: str) -> AlertDelivery:
        return AlertDelivery("email", False, "SMTP not configured")


class TelegramAlertSender(AlertSender):
    """Placeholder Telegram sender (logs intent; wire Bot API in production)."""

    async def send(self, profile, alert, message: str) -> AlertDelivery:
        return AlertDelivery("telegram", False, "Telegram bot not configured")


def get_alert_sender() -> AlertSender:
    """Return a no-op sender when no channel is configured so flows never fail."""
    return AlertSender()


async def create_alert(
    db: AsyncSession,
    profile,
    session,
    severity: str,
    trigger_reason: str,
) -> "CaregiverAlert":
    from app.models import CaregiverAlert

    alert = CaregiverAlert(
        profile_id=profile.id,
        session_id=session.id if session else None,
        severity=severity,
        trigger_reason=trigger_reason,
        acknowledged=False,
        delivery_log="",
    )
    db.add(alert)
    await db.flush()
    await db.refresh(alert)
    return alert


async def fire_alert(
    db: AsyncSession,
    profile,
    session,
    severity: str,
    trigger_reason: str,
    sender: AlertSender,
) -> "CaregiverAlert":
    from app.models import CaregiverAlert

    alert = await create_alert(db, profile, session, severity, trigger_reason)

    message = (
        f"SwarExSethu alert for {profile.elder_name}: "
        f"{trigger_reason} (severity: {severity})"
    )

    deliveries: List[AlertDelivery] = []
    channels = []
    if profile.caregiver_webhook:
        channels.append(("webhook", WebhookAlertSender(profile.caregiver_webhook)))
    if profile.caregiver_email:
        channels.append(("email", EmailAlertSender()))
    if profile.caregiver_telegram:
        channels.append(("telegram", TelegramAlertSender()))

    for channel_name, sender_instance in channels:
        delivery = await sender_instance.send(profile, alert, message)
        deliveries.append(delivery)

    alert.delivery_log = json.dumps(
        [{"channel": d.channel, "ok": d.ok, "detail": d.detail} for d in deliveries],
        ensure_ascii=False,
    )
    await db.flush()
    await db.refresh(alert)
    return alert