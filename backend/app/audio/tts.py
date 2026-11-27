"""Text-to-Speech pipeline.

edge-tts is the default: free, no API key, Indian-accented Neural voices for
Hindi, Telugu, Kannada, Tamil and Indian English. Browser speechSynthesis is
the client-side fallback.
"""

import asyncio
import io
from dataclasses import dataclass
from typing import Optional

from app.config import settings


@dataclass
class TTSResult:
    audio_bytes: bytes
    format: str  # "mp3" | "wav"
    language: str
    voice: str
    provider: str


class TTSProvider:
    """Interface for TTS backends."""

    async def synthesize(self, text: str, language: str = "en") -> TTSResult:
        raise NotImplementedError


class EdgeTTS(TTSProvider):
    """edge-tts: Microsoft Edge Neural TTS, zero API key."""

    async def synthesize(self, text: str, language: str = "en") -> TTSResult:
        import edge_tts  # type: ignore

        voice = settings.TTS_VOICES.get(language, "en-IN-PrabhatNeural")
        communicate = edge_tts.Communicate(text, voice)
        chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        audio_bytes = b"".join(chunks)
        return TTSResult(
            audio_bytes=audio_bytes,
            format="mp3",
            language=language,
            voice=voice,
            provider="edge-tts",
        )


class CloudTTS(TTSProvider):
    """Optional cloud TTS placeholder."""

    async def synthesize(self, text: str, language: str = "en") -> TTSResult:
        raise NotImplementedError("cloud TTS not configured")


class DeterministicLocalTTS(TTSProvider):
    """Terminal fallback: returns silent WAV so the pipeline never fails.
    Client-side browser speechSynthesis is the real fallback for audio."""

    async def synthesize(self, text: str, language: str = "en") -> TTSResult:
        # 1 second of silence (WAV 16-bit mono 16 kHz)
        sample_rate = 16000
        import math

        frames = bytearray()
        for i in range(sample_rate):
            val = 0
            frames += int(val).to_bytes(2, "little", signed=True)
        header = self._wav_header(sample_rate, len(frames))
        return TTSResult(
            audio_bytes=bytes(header) + bytes(frames),
            format="wav",
            language=language,
            voice="deterministic-local-silence",
            provider="deterministic-local",
        )

    @staticmethod
    def _wav_header(sample_rate: int, data_size: int) -> bytes:
        byte_rate = sample_rate * 2
        header = bytearray()
        header += b"RIFF"
        header += (36 + data_size).to_bytes(4, "little")
        header += b"WAVE"
        header += b"fmt "
        header += (16).to_bytes(4, "little")
        header += (1).to_bytes(2, "little")  # PCM
        header += (1).to_bytes(2, "little")  # channels
        header += sample_rate.to_bytes(4, "little")
        header += byte_rate.to_bytes(4, "little")
        header += (2).to_bytes(2, "little")  # block align
        header += (16).to_bytes(2, "little")  # bits per sample
        header += b"data"
        header += data_size.to_bytes(4, "little")
        return bytes(header)


def get_tts_provider() -> TTSProvider:
    provider = settings.TTS_PROVIDER.lower()
    if provider in ("edge-tts", "auto"):
        return EdgeTTS()
    if provider == "cloud":
        return CloudTTS()
    return DeterministicLocalTTS()