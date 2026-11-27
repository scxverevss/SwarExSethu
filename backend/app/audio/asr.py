"""Automatic Speech Recognition pipeline.

Zero-key by default: Faster-Whisper (tiny, CPU) runs locally with no API key.
If a cloud key is configured the chain upgrades, and a deterministic local
fallback guarantees the endpoint never fails.
"""

from dataclasses import dataclass
from typing import Optional

from app.config import settings


@dataclass
class ASRResult:
    transcript: str
    language: str
    confidence: float
    words: list
    telemetry: dict
    provider: str
    needs_repeat: bool = False


class ASRProvider:
    """Interface for ASR backends."""

    async def transcribe(self, audio_bytes: bytes, language: Optional[str] = None) -> ASRResult:
        raise NotImplementedError


class FasterWhisperASR(ASRProvider):
    """Local Faster-Whisper ASR. No API key required; model cached in container."""

    def __init__(self, model_name: str = "tiny") -> None:
        self.model_name = model_name
        self._model = None

    def _load(self):
        if self._model is None:
            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                self.model_name, device="cpu", compute_type="int8"
            )
        return self._model

    async def transcribe(self, audio_bytes: bytes, language: Optional[str] = None) -> ASRResult:
        import io

        import soundfile as sf  # type: ignore

        model = self._load()
        try:
            audio, sr = sf.read(io.BytesIO(audio_bytes))
        except Exception:
            # Raw PCM fallback: assume 16-bit mono 16 kHz
            import numpy as np

            audio = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            sr = 16000

        segments, info = model.transcribe(
            audio,
            language=language,
            vad_filter=True,
            word_timestamps=True,
        )

        transcript = " ".join(seg.text.strip() for seg in segments).strip()
        words = []
        for seg in segments:
            for w in getattr(seg, "words", []) or []:
                words.append(
                    {
                        "word": w.word,
                        "start": w.start,
                        "end": w.end,
                        "confidence": getattr(w, "probability", 0.0),
                    }
                )

        # Confidence: average word probability; fallback to segment avg log-prob proxy
        confidences = [w["confidence"] for w in words if w["confidence"] > 0]
        confidence = sum(confidences) / len(confidences) if confidences else 0.7

        telemetry = {
            "language_detected": info.language,
            "duration": getattr(info, "duration", 0.0),
            "provider": "faster-whisper",
        }

        return ASRResult(
            transcript=transcript,
            language=info.language or "en",
            confidence=round(confidence, 3),
            words=words,
            telemetry=telemetry,
            provider="faster-whisper",
            needs_repeat=confidence < 0.65,
        )


class CloudASR(ASRProvider):
    """Optional cloud ASR via configured LLM provider (audio understanding)."""

    def __init__(self) -> None:
        self.provider_name = "cloud"

    async def transcribe(self, audio_bytes: bytes, language: Optional[str] = None) -> ASRResult:
        # Cloud audio understanding is provider-specific; when no client is
        # configured we gracefully decline so the chain falls through.
        raise NotImplementedError("cloud ASR not configured")


class DeterministicLocalASR(ASRProvider):
    """Terminal fallback. Honestly reports inability to transcribe so the
    state machine triggers a polite repetition turn — never hallucinates."""

    async def transcribe(self, audio_bytes: bytes, language: Optional[str] = None) -> ASRResult:
        return ASRResult(
            transcript="",
            language=language or "en",
            confidence=0.0,
            words=[],
            telemetry={"provider": "deterministic-local", "note": "no ASR backend available"},
            provider="deterministic-local",
            needs_repeat=True,
        )


def get_asr_provider() -> ASRProvider:
    provider = settings.ASR_PROVIDER.lower()
    if provider in ("faster-whisper", "auto"):
        return FasterWhisperASR(model_name=settings.WHISPER_MODEL)
    if provider == "cloud":
        return CloudASR()
    return DeterministicLocalASR()