"""SQLAlchemy models for SwarExSethu."""

import enum
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class LanguageCode(str, enum.Enum):
    EN = "en"
    HI = "hi"
    TE = "te"
    KN = "kn"
    TA = "ta"


class SessionState(str, enum.Enum):
    GREETING = "greeting"
    LISTENING = "listening"
    NLU = "nlu"
    CLARIFYING = "clarifying"
    GUIDANCE = "guidance"
    SUMMARY = "summary"
    ESCALATED = "escalated"
    NOISE_FALLBACK = "noise_fallback"


class AlertSeverity(str, enum.Enum):
    ROUTINE_DIGEST = "routine_digest"
    ELEVATED_WATCH = "elevated_watch"
    URGENT_RED_FLAG = "urgent_red_flag"


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    elder_name: Mapped[str] = mapped_column(String(200), nullable=False)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    preferred_language: Mapped[str] = mapped_column(
        String(20), default=LanguageCode.EN.value, nullable=False
    )
    baseline_conditions: Mapped[str] = mapped_column(Text, default="", nullable=False)
    emergency_contact: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    caregiver_webhook: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    caregiver_email: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    caregiver_telegram: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    sessions: Mapped[List["CheckInSession"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    medications: Mapped[List["MedicationSchedule"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    alerts: Mapped[List["CaregiverAlert"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<UserProfile id={self.id} name={self.elder_name!r}>"


class MedicationSchedule(Base):
    __tablename__ = "medication_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    dosage: Mapped[str] = mapped_column(String(200), nullable=False)
    time_slot: Mapped[str] = mapped_column(String(50), nullable=False)  # morning/afternoon/night
    spoken_alias: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    profile: Mapped["UserProfile"] = relationship(back_populates="medications")
    adherence_logs: Mapped[List["MedicationAdherenceLog"]] = relationship(
        back_populates="medication", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<MedicationSchedule id={self.id} name={self.name!r}>"


class MedicationAdherenceLog(Base):
    __tablename__ = "medication_adherence_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    medication_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("medication_schedules.id", ondelete="CASCADE"), nullable=False
    )
    taken_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    taken: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(50), default="voice", nullable=False)

    medication: Mapped["MedicationSchedule"] = relationship(back_populates="adherence_logs")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<MedicationAdherenceLog id={self.id} taken={self.taken}>"


class CheckInSession(Base):
    __tablename__ = "checkin_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    state: Mapped[str] = mapped_column(
        String(30), default=SessionState.GREETING.value, nullable=False
    )
    clarifying_questions_asked: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    snr_db: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    asr_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vocal_fatigue_index: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    severity_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    resolution_summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    red_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    input_source: Mapped[str] = mapped_column(
        String(30), default="mic_whisper", nullable=False
    ),

    profile: Mapped["UserProfile"] = relationship(back_populates="sessions")
    turns: Mapped[List["ConversationTurn"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<CheckInSession id={self.id} state={self.state}>"


class ConversationTurn(Base):
    __tablename__ = "conversation_turns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("checkin_sessions.id", ondelete="CASCADE"), nullable=False
    )
    turn_index: Mapped[int] = mapped_column(Integer, nullable=False)
    speaker: Mapped[str] = mapped_column(String(20), nullable=False)  # elder | assistant
    text: Mapped[str] = mapped_column(Text, nullable=False)
    language_detected: Mapped[str] = mapped_column(String(20), default="en", nullable=False)
    asr_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    symptoms_extracted: Mapped[str] = mapped_column(Text, default="", nullable=False)  # JSON list
    severity_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    clarifying_question: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    input_source: Mapped[str] = mapped_column(
        String(30), default="mic_whisper", nullable=False
    ),
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session: Mapped["CheckInSession"] = relationship(back_populates="turns")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ConversationTurn id={self.id} speaker={self.speaker!r}>"


class CaregiverAlert(Base):
    __tablename__ = "caregiver_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("checkin_sessions.id", ondelete="SET NULL"), nullable=True
    )
    severity: Mapped[str] = mapped_column(
        String(30), default=AlertSeverity.ROUTINE_DIGEST.value, nullable=False
    )
    trigger_reason: Mapped[str] = mapped_column(Text, nullable=False)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_log: Mapped[str] = mapped_column(Text, default="", nullable=False)  # JSON list
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    profile: Mapped["UserProfile"] = relationship(back_populates="alerts")
    session: Mapped[Optional["CheckInSession"]] = relationship()

    def __repr__(self) -> str:  # pragma: no cover
        return f"<CaregiverAlert id={self.id} severity={self.severity}>"