"""API dependencies: builds a ConversationEngine with wired providers."""

from typing import AsyncGenerator

from app.alerts.caregiver import get_alert_sender
from app.audio.asr import get_asr_provider
from app.audio.tts import get_tts_provider
from app.database import AsyncSessionLocal
from app.engine.state_machine import ConversationEngine


async def get_engine() -> AsyncGenerator[ConversationEngine, None]:
    async with AsyncSessionLocal() as db:
        asr = get_asr_provider()
        tts = get_tts_provider()
        alerts = get_alert_sender()
        yield ConversationEngine(db, asr, tts, alerts)