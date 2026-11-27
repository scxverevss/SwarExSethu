from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration. All AI keys optional for zero-key boot."""

    DATABASE_URL: str = "sqlite+aiosqlite:////data/app.db"
    DATA_DIR: str = "/data"

    # Local ASR / TTS
    WHISPER_MODEL: str = "tiny"
    ASR_PROVIDER: str = "auto"       # faster-whisper | cloud | auto
    TTS_PROVIDER: str = "edge-tts"   # edge-tts | cloud | auto

    # Live AI provider keys (optional)
    GEMINI_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    OLLAMA_BASE_URL: Optional[str] = None

    # App
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

# Ordered LLM provider failover chain. Deterministic local engine is the
# terminal fallback so no request ever fails.
LLM_PROVIDER_CHAIN: List[str] = ["gemini", "openai", "claude", "ollama", "deterministic"]

# Indian-accented edge-tts voices per language (fallback to generic if missing)
TTS_VOICES = {
    "en": "en-IN-PrabhatNeural",
    "hi": "hi-IN-MadhurNeural",
    "te": "te-IN-MohanNeural",
    "kn": "kn-IN-GaganNeural",
    "ta": "ta-IN-PallaviNeural",
}

# Code-switched language display names
LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi / Hinglish",
    "te": "Telugu / Tenglish",
    "kn": "Kannada / Kanglish",
    "ta": "Tamil / Tanglish",
}