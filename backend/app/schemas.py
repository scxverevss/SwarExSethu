"""Pydantic v2 schemas for SwarExSethu API."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# User Profile
# ---------------------------------------------------------------------------
class UserProfileBase(BaseModel):
    elder_name: str = Field(..., min_length=1, max_length=200)
    age: int = Field(..., ge=60, le=120)
    preferred_language: str = Field(default="en")
    baseline_conditions: str = Field(default="")
    emergency_contact: str = Field(default="")
    caregiver_webhook: Optional[str] = Field(default="")
    caregiver_email: Optional[str] = Field(default="")
    caregiver_telegram: Optional[str] = Field(default="")


class UserProfileCreate(UserProfileBase):
    pass


class UserProfileUpdate(BaseModel):
    elder_name: Optional[str] = None
    age: Optional[int] = Field(None, ge=60, le=120)
    preferred_language: Optional[str] = None
    baseline_conditions: Optional[str] = None
    emergency_contact: Optional[str] = None
    caregiver_webhook: Optional[str] = None
    caregiver_email: Optional[str] = None
    caregiver_telegram: Optional[str] = None


class UserProfileOut(UserProfileBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Medication
# ---------------------------------------------------------------------------
class MedicationScheduleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    dosage: str = Field(..., min_length=1, max_length=200)
    time_slot: str = Field(..., pattern="^(morning|afternoon|night)$")
    spoken_alias: str = Field(default="")
    is_active: bool = Field(default=True)


class MedicationScheduleCreate(MedicationScheduleBase):
    pass


class MedicationScheduleUpdate(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    time_slot: Optional[str] = Field(None, pattern="^(morning|afternoon|night)$")
    spoken_alias: Optional[str] = None
    is_active: Optional[bool] = None


class MedicationScheduleOut(MedicationScheduleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int
    created_at: datetime


class MedicationAdherenceLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    medication_id: int
    taken_at: datetime
    taken: bool
    source: str


class MedicationCheckIn(BaseModel):
    medication_id: int
    taken: bool


# ---------------------------------------------------------------------------
# Check-in session
# ---------------------------------------------------------------------------
class CheckInSessionStart(BaseModel):
    profile_id: int


class CheckInSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int
    started_at: datetime
    ended_at: Optional[datetime]
    state: str
    clarifying_questions_asked: int
    snr_db: Optional[float]
    asr_confidence: Optional[float]
    vocal_fatigue_index: Optional[float]
    severity_score: Optional[int]
    resolution_summary: str
    red_flag: bool
    input_source: str = "mic_whisper"  # wispr_flow | mic_whisper | sample_fallback


class ConversationTurnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    turn_index: int
    speaker: str
    text: str
    language_detected: str
    asr_confidence: Optional[float]
    symptoms_extracted: str
    severity_score: Optional[int]
    clarifying_question: bool
    input_source: str = "mic_whisper"  # wispr_flow | mic_whisper | sample_fallback
    created_at: datetime


class TurnIn(BaseModel):
    text: str
    asr_confidence: Optional[float] = None
    snr_db: Optional[float] = None
    language: Optional[str] = "en"
    input_source: str = "mic_whisper"  # wispr_flow | mic_whisper | sample_fallback


class MessageIn(BaseModel):
    session_id: int
    text: str
    asr_confidence: Optional[float] = None
    snr_db: Optional[float] = None
    language: Optional[str] = "en"
    input_source: str = "mic_whisper"  # wispr_flow | mic_whisper | sample_fallback


class MessageOut(BaseModel):
    session_id: int
    reply_text: str
    language: str
    state: str
    clarifying_question: bool = False
    escalation: Optional[dict] = None
    audio_url: Optional[str] = None
    medications_to_confirm: List[dict] = []
    summary: Optional[str] = None
    input_source: str = "mic_whisper"  # wispr_flow | mic_whisper | sample_fallback


# ---------------------------------------------------------------------------
# Audio
# ---------------------------------------------------------------------------
class TranscribeOut(BaseModel):
    transcript: str
    language: str
    confidence: float
    words: List[dict] = []
    telemetry: dict = {}


class SynthesizeIn(BaseModel):
    text: str
    language: str = "en"


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------
class CaregiverAlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int
    session_id: Optional[int]
    severity: str
    trigger_reason: str
    acknowledged: bool
    acknowledged_at: Optional[datetime]
    delivery_log: str
    created_at: datetime


class AlertAcknowledge(BaseModel):
    alert_id: int


# ---------------------------------------------------------------------------
# Digest
# ---------------------------------------------------------------------------
class DigestOut(BaseModel):
    profile_id: int
    period_days: int
    sessions_count: int
    adherence_percent: float
    red_flags: int
    summary: str
    recent_alerts: List[CaregiverAlertOut] = []