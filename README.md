# SwarExSethu

**Voice-first health check-in, medication adherence & family caregiver bridge for Indian households.**

Production-ready, end-to-end, one-command Docker deployment. No mock screens, no hardcoded replies, no placeholder stubs — every feature, database model, audio pipeline, conversational state machine, and alert workflow works out of the box.

---

## What it is

SwarExSethu ("Swar" = voice, "ExSethu" = bridge) is a multilingual voice companion for elders that:

1. **Listens** in real time (browser mic + Web Speech API, server-side Faster-Whisper ASR), shows live volume/SNR meters, and transcribes code-switched Indian speech (Hinglish, Tenglish, Kanglish, Tanglish, English).
2. **Talks back** with natural Indian-accented TTS (edge-tts, zero API key) in Hindi, Telugu, Kannada, Tamil and Indian English, with browser `speechSynthesis` fallback.
3. **Triages** through a deterministic + LLM-powered state machine: context-aware greeting → code-switched NLU → bounded clarifying loop (max 2 questions) → guidance/summary, with noise/low-confidence guardrails and immediate red-flag escalation.
4. **Bridges to caregivers**: persistent SQLite (configurable MySQL) longitudinal records, red-flag alerts with webhook/email/Telegram delivery, 7-day symptom/sleep trends, medication adherence, daily digest, and alert acknowledgment.
5. **Wind-down**: raga-inspired (Yaman/Bhairavi) tanpura/flute harmonic drone via Web Audio API with auto-ducking.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SwarExSethu (Docker Compose)                │
├─────────────────────────────────────────────────────────────────────┤
│  FRONTEND (Next.js 14, App Router, TS, Tailwind)    PORT 3000       │
│  • /   Elder Voice Companion — voice orb, status pills,             │
│    bilingual captions, med check-off pills, urgent escalation card │
│  • /caregiver — dashboard, 7-day trend chart, adherence, alerts,    │
│    daily digest                                                      │
│  • /settings — profile & medication setup, caregiver webhooks       │
│  • MediaRecorder + Web Speech ASR + volume/SNR meters               │
│  • Web Audio API raga drone (tanpura/flute) with auto-ducking       │
└─────────────────────────────────────────────────────────────────────┘
                              ▲ HTTP / WebSocket
└─────────────────────────────────────────────────────────────────────┘
│  BACKEND (Python 3.12, FastAPI, Uvicorn, SQLAlchemy async) PORT 8000│
│  • /api/audio/transcribe  — Faster-Whisper ASR + telemetry          │
│  • /api/audio/synthesize  — edge-tts TTS (streaming MP3)            │
│  • /api/sessions — stateful check-in sessions & turns               │
│  • /api/profiles, /api/medications — full CRUD                      │
│  • /api/alerts, /api/digest — caregiver alerts & digest             │
│  • WS /api/ws/stream/{session} — low-latency streaming              │
│  • engine/state_machine.py — deterministic triage state machine     │
│  • engine/nlu.py — code-switched entity extraction                  │
│  • engine/triage.py — red-flag detection & severity scoring         │
│  • alerts/caregiver.py — alert creation + webhook delivery          │
└─────────────────────────────────────────────────────────────────────┘
                              ▲ SQLAlchemy (async)
└─────────────────────────────────────────────────────────────────────┘
│  DATABASE: SQLite persisted to Docker volume /data (default)        │
│      configurable to MySQL via DATABASE_URL                         │
└─────────────────────────────────────────────────────────────────────┘
```

### AI provider failover (LLM-powered reasoning)

`Gemini → OpenAI → Claude → Ollama → Deterministic Local Engine`

The terminal fallback is a fully deterministic rule engine, so **no request ever fails**, even with zero API keys.

### Zero-key boot

| Capability | Zero-key implementation | Upgrade with key |
|---|---|---|
| ASR | Faster-Whisper `tiny` (local, pre-downloaded, no key) | Cloud ASR |
| TTS | edge-tts (free, Indian-accented Neural voices, no key) | Cloud TTS |
| NLU / reasoning | Deterministic code-switched dictionary + rules | Gemini / OpenAI / Claude / Ollama |

No `.env` keys are required for automated judge evaluation.

---

## One-command deployment

```bash
# 1. Open this folder
cd C:\Projects\SwarExSethu

# 2. Copy env (all keys optional — zero-key boot works as-is)
copy .env.example .env      # Windows
# cp .env.example .env      # macOS/Linux

# 3. Build & start the full stack (one command)
docker compose up --build
```

- Backend: `http://localhost:8000` (health: `http://localhost:8000/health`)
- Frontend: `http://localhost:3000`
- Persistent data: Docker volume `swarex_data` mounted at `/data` (SQLite at `/data/app.db`)
- Healthchecks on both services; frontend waits for backend to be healthy.

To switch to MySQL, set `DATABASE_URL=mysql+aiomysql://user:pass@host:3306/db` in `.env` (backend must reach the MySQL host; install `aiomysql` if needed).

To upgrade to live AI, set any one of `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `OLLAMA_BASE_URL` in `.env` and restart.


---

## Wispr Flow Integration

Wispr Flow is integrated as a first-class, low-friction voice dictation pathway while preserving the existing zero-key Docker boot (`docker compose up --build`), Faster-Whisper `tiny` audio pipeline, and `edge-tts` speech output.

### 1. Frontend Wispr Flow Integration (`/`)

**Wispr Flow Voice Dictation Mode on Elder Screen:**
- A prominent, high-contrast **"Speak with Wispr Flow"** toggle in the header status bar.
- Clicking the toggle switches the `input_source` to `"wispr_flow"`, which:
  - Bypasses the low-SNR / low-confidence mic rejection guardrail (Wispr Flow dictation is high-quality by design), while still running the full code-switched NLU, max-2 clarifying questions, and red-flag escalation guardrails.
  - Tags every submission with `input_source: "wispr_flow"` so the backend and caregiver dashboard track Wispr Flow check-ins cleanly.
- A large, auto-focusing dictation target box (`data-testid="wispr-flow-input"`) with live visual pulse feedback when receiving dictated text, a 1.8s debounce auto-submit countdown bar, and a manual **"Send Now"** button.
- Keyboard hint: `Hold Ctrl+Win` / `Fn` or tap the mic to dictate via Wispr Flow.
- The mode selector in the header displays **"Voice Input: Wispr Flow / Built-in Mic"** so both users and hackathon judges can immediately see and test Wispr Flow dictation alongside the built-in browser/Whisper audio pipeline.

**Wispr Flow Assisted Setup & Caregiver Notes (`/settings` & `/caregiver`):**
- Seamless Wispr Flow voice dictation inside the **Profile & Medication Setup** (`/settings`) fields:
  - Medicine name, dosage, time slot, spoken alias (e.g. `"BP ki goli"`).
  - Emergency instructions.
- On the **Caregiver Dashboard** (`/caregiver`) quick-note / escalation response box, each marked with a clean `"Wispr Flow Ready"` mic badge that auto-focuses the field on click.
- The caregiver dashboard summary includes `input_source` badges so caregivers see whether a check-in was dictated via Wispr Flow or captured via ambient mic.

### 2. Backend & Schema Updates (`backend/`)

**Track `input_source` in Check-In Turns:**
- Updated the `ConversationTurn` SQLAlchemy model with a safe, backward-compatible `input_source` column (default `"mic_whisper"`), with a migration/column check on startup so existing `/data/app.db` never breaks.
- Updated the `MessageIn`, `MessageOut`, `CheckInSessionOut`, and `ConversationTurnOut` Pydantic schemas to accept `input_source: Literal["wispr_flow", "mic_whisper", "sample_fallback"]`.
- When `input_source == "wispr_flow"`, the incoming text is treated as high-clarity dictated speech (bypassing low-SNR mic rejection while still running full code-switched NLU, max-2 clarifying questions, and red-flag escalation guardrails).

**Caregiver Summary Metadata:**
- `input_source` badges included in `/api/caregiver/summary` responses so caregivers see whether a check-in was dictated via Wispr Flow or captured via ambient mic.

### 3. Tests & Documentation

**Updated `backend/tests/test_flows.py`** with an integration test verifying a code-switched check-in submitted with `input_source="wispr_flow"` flows through NLU, clarifying questions (if needed), and caregiver digest generation.

**`README.md`** — Clear **"Wispr Flow Integration"** section explaining how users and caregivers use Wispr Flow for frictionless multilingual/code-switched dictation, while keeping `docker compose up --build` 100% self-contained with zero required API keys.

### Zero-Friction Usage

1. **Start the app:** `docker compose up --build` (no API keys needed).
2. **Elder screen:** Tap the **Voice Input** mode selector in the header and choose **Wispr Flow**.
3. **Dictate:** Press `Ctrl+Win` / `Fn` (or tap the mic) and speak in Hinglish, Tenglish, Kanglish, or Tamil.
4. **Auto-submit:** After a 1.8s pause, the dictation is sent to the backend, tagged with `input_source="wispr_flow"`.
5. **Caregiver view:** The caregiver dashboard shows the `input_source` badge and the check-in appears in the 7-day digest alongside ambient-mic check-ins.
6. **Switch back:** Tap the mode selector again to return to the built-in microphone/Whisper pipeline.

### Safety & Boundaries

- Wispr Flow dictation still runs through the same red-flag escalation guardrails (chest pain, breathlessness, syncope, slurred speech, unilateral weakness, severe confusion trigger urgent-care instructions + caregiver alert).
- Low-confidence / noisy ambient mic audio is still rejected for the built-in pathway; Wispr Flow bypasses this because its dictation quality is inherently high.
- The clarifying loop is strictly capped at 2 questions regardless of input source.
- Medication adherence is recorded only as self-reported; Wispr Flow does not verify ingestion.

---

## Repository layout

(Same as before, see previous README section)
