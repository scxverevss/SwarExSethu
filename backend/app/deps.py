"""Dependency injection points for swappable audio/alert providers."""

from typing import Optional

from fastapi import Depends

from app.audio.asr import ASRProvider, get_asr_provider
from app.audio.tts import TTSProvider, get_tts_provider
from app.alerts.caregiver import AlertSender, get_alert_sender
from app.database import AsyncSessionLocal, get_session
from sqlalchemy.ext.asyncio import AsyncSession


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


def get_asr() -> ASRProvider:
    return get_asr_provider()


def get_tts() -> TTSProvider:
    return get_tts_provider()


def get_alerts() -> AlertSender:
    return get_alert_sender()