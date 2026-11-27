"""Stateful conversational triage state machine for SwarExSethu.

Deterministic by default (zero-key). Fully covers:
  1. Context-aware greeting
  2. Code-switched NLU & entity extraction
  3. Bounded clarifying loop (strict max 2 questions)
  4. Noise / low-confidence guardrail
  5. Immediate red-flag escalation
"""

import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.caregiver import fire_alert, get_alert_sender
from app.config import settings, LANGUAGE_NAMES
from app.database import AsyncSessionLocal
from app.engine.nlu import NLUResult, extract_entities
from app.engine.triage import detect_red_flag, severity_band, severity_score
from app.models import (
    AlertSeverity,
    CheckInSession,
    ConversationTurn,
    MedicationAdherenceLog,
    MedicationSchedule,
    SessionState,
    UserProfile,
)
from app.schemas import MessageOut


# ---------------------------------------------------------------------------
# Language-specific templates (culturally warm, jargon-free)
# ---------------------------------------------------------------------------

GREETINGS = {
    "en": "Namaste {name}. I'm SwarExSethu, your health check-in companion. "
          "It's {time_of_day}. Let's do your daily health check-in.",
    "hi": "Namaste {name}. Main SwarExSethu, aapka health check-in saathi. "
          "Ab {time_of_day} hai. Aapka daily check-in shuru karte hain.",
    "te": "Namaskaram {name}. Nenu SwarExSethu, mee health check-in snehudu. "
          "Ippudu {time_of_day}. Mee rojuvaru check-in prarambhamiddam.",
    "kn": "Namaskara {name}. Naanu SwarExSethu, nimma health check-in snehitha. "
          "Eega {time_ofday}. Nimma rojuvaari check-in arambisona.",
    "ta": "Vanakkam {name}. En SwarExSethu, ungal health check-in nanban. "
          "Ippozh {time_ofday}. Ungal naalathirkana check-in thodanguvom.",
}

REPEAT_PROMPTS = {
    "en": "I didn't quite catch that, {name}. Could you please say that again? "
          "Speak slowly and clearly.",
    "hi": "{name}, main theek se samajh nahi paya. Kya aap phir se keh sakte hain? "
          "Dheere dheere aur saaf seedha boliye.",
    "te": "{name}, naku artham kaledu. Dayachesi maro sari cheppagalara. "
          "Nemmadiga mariyu spashtanga matladandi.",
    "kn": "{name}, nanage arthavagilla. Dayavittu maru sari helabahuda? "
          "Nemmadagi mariyu spashtavagi matnadi.",
    "ta": "{name}, ungalai theriyavillai. Dayavusei marupadi sonnunga. "
          "Nemmadham mariyu thelivaga pesunga.",
}

URGENT_INSTRUCTIONS = {
    "en": "URGENT: {name}, please stay calm. Based on what you shared, this sounds "
          "like it needs urgent medical attention. Please call emergency services "
          "({emergency}) or your doctor right now. I've alerted your caregiver. "
          "Stay where you are and do not take any new medicine unless a clinician "
          "tells you to.",
    "hi": "URGENT: {name}, kripya shant rahein. Aapne jita bataya, uske liye turant "
          "dawaayi madad ki zaroorat ho sakti hai. Kripya turant emergency services "
          "({emergency}) ya apne doctor ko call karein. Mainne aapke caregiver ko "
          "alert kar diya hai. Wahan rahein jahan hain, koi nayi dawa na lein jab tak "
          "doctor na kahe.",
    "te": "URGENT: {name}, dayachesi shantuga undandi. Mee panchukovadam valla, "
          "turant vaidhya sahayam avasaram ani telustondi. Dayachesi turant emergency "
          "services ({emergency}) leda mee doctor nu call cheyandi. Nenu mee caregiver ku "
          "alert chesaru. Meeru unnay samayam undandi, doctor cheppe varaku kottadam ledu.",
    "kn": "URGENT: {name}, dayavittu shantagiriri. Neenu hanchidare, idakke turant "
          "vaidhya sahaya avashyakavide. Dayavittu turant emergency services ({emergency}) "
          "leada nimma doctor kare keli. Nage nimma caregiver nige alert madide. Nimma iruva "
          "sthaladalli iri, doctor heluva vare hosa dawa tegedukona.",
    "ta": "URGENT: {name}, dayavusei santhoshama irunga. Neengal panivathu valla, "
          "turant maruthuva thevai irukkum. Dayavusei turant emergency services ({emergency}) "
          "allathu ungal doctor kudangi. Naan ungal caregiver ku alert seithen. Ungal irukkum "
          "idathil irunga, doctor sonna varaku puthiya marundhu edukkateenga.",
}
SUMMARY_LINES = {
    "en": "Here is your check-in summary: {summary}. "
          "Take care, {name}. I'll check in again {next_check}.",
    "hi": "Yahan aapka check-in summary hai: {summary}. "
          "Dhyan rakhiye, {name}. Main phir {next_check} check-in karenge.",
    "te": "Mee check-in summary ikkada undi: {summary}. "
          "Jagratha vahinchandi, {name}. Nenu {next_check} maro sari check-in chestanu.",
    "kn": "Nimma check-in summary ide: {summary}. "
          "Aralisikolli, {name}. Nenu {next_check} maru sari check-in maduttene.",
    "ta": "Ungal check-in summary idho: {summary}. "
          "Kavalai vaangiunga, {name}. Naan {next_check} marupadi check-in pesuvom.",
}


def _time_of_day() -> str:
    hour = datetime.now().hour
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 21:
        return "evening"
    return "night"


def _t(language: str, key_dict: dict, name: str = "", **kwargs) -> str:
    text = key_dict.get(language, key_dict["en"])
    return text.format(name=name, **kwargs)


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class ConversationEngine:
    def __init__(
        self,
        db: AsyncSession,
        asr_provider=None,
        tts_provider=None,
        alert_sender=None,
    ) -> None:
        self.db = db
        self.asr = asr_provider
        self.tts = tts_provider
        self.alerts = alert_sender or get_alert_sender()

    # -- session lifecycle ---------------------------------------------------

    async def start_session(self, profile: UserProfile) -> MessageOut:
        session = CheckInSession(
            profile_id=profile.id,
            state=SessionState.GREETING.value,
        )
        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)

        pending = await self._pending_medications(profile)
        unresolved = await self._unresolved_symptoms(profile)

        greeting = _t(profile.preferred_language, GREETINGS,
                      name=profile.elder_name, time_of_day=_time_of_day())
        if unresolved:
            greeting += " " + _t(
                profile.preferred_language, {
                    "en": "You mentioned {symptoms} recently — how are they now?",
                    "hi": "Aapne haal mein {symptoms} ki baat kahi thi — ab kaisa hai?",
                    "te": "Meeru thaggedu {symptoms} anukunnaru — ippudu ela undi?",
                    "kn": "Neenu hosa {symptoms} heliddiri — ega hegide?",
                    "ta": "Neengal innum {symptoms} sonnareengal — ippudu eppadi irukku?",
                }.get(profile.preferred_language, "en"),
                symptoms=unresolved,
            )
        if pending:
            med_list = ", ".join(m["name"] for m in pending)
            greeting += " " + _t(
                profile.preferred_language, {
                    "en": "Your medicines due now: {meds}.",
                    "hi": "Aapki dawaayi abhi baki hai: {meds}.",
                    "te": "Mee mandulu ippudu pendulu: {meds}.",
                    "kn": "Nimma oushadhi ippudu baki: {meds}.",
                    "ta": "Ungal marundhugal ippudu baki: {meds}.",
                }.get(profile.preferred_language, "en"),
                meds=med_list,
            )

        await self._save_turn(session, "assistant", greeting, profile.preferred_language)
        session.state = SessionState.LISTENING.value
        await self.db.flush()

        return MessageOut(
            session_id=session.id,
            reply_text=greeting,
            language=profile.preferred_language,
            state=session.state,
            medications_to_confirm=pending,
        )

    # -- main turn processor -------------------------------------------------

    async def process_turn(
        self,
        session: CheckInSession,
        profile: UserProfile,
        text: str,
        asr_confidence: Optional[float] = None,
        snr_db: Optional[float] = None,
        input_source: str = "mic_whisper",
    ) -> MessageOut:
        # Persist elder turn
        await self._save_turn(session, "elder", text, profile.preferred_language,
                              asr_confidence=asr_confidence)

        # ---- 5. Immediate red-flag escalation (halts all normal flow) ----
        if session.red_flag or session.state == SessionState.ESCALATED.value:
            return await self._escalated_reply(session, profile)

        # ---- 4. Noise / low-confidence guardrail ----
        # If input comes from Wispr Flow, treat as high-clarity dictation:
        # skip SNR/confidence rejection but still run full NLU/clarification/escalation.
        is_wispr = (input_source or "mic_whisper") == "wispr_flow"
        needs_repeat = False
        if not is_wispr:
            if asr_confidence is not None and asr_confidence < 0.65:
                needs_repeat = True
            if snr_db is not None and snr_db < 10.0:
                needs_repeat = True

        if needs_repeat and session.state != SessionState.NOISE_FALLBACK.value:
            session.state = SessionState.NOISE_FALLBACK.value
            session.snr_db = snr_db
            session.asr_confidence = asr_confidence
            await self.db.flush()
            prompt = _t(profile.preferred_language, REPEAT_PROMPTS,
                        name=profile.elder_name)
            await self._save_turn(session, "assistant", prompt, profile.preferred_language,
                                  clarifying_question=False)
            return MessageOut(
                session_id=session.id,
                reply_text=prompt,
                language=profile.preferred_language,
                state=session.state,
                clarifying_question=False,
            )

        # If already in noise fallback, proceed anyway so we never get stuck.
        if session.state == SessionState.NOISE_FALLBACK.value:
            session.state = SessionState.LISTENING.value

        # ---- 2. Code-switched NLU & entity extraction ----
        nlu = extract_entities(text, language=profile.preferred_language)
        session.asr_confidence = asr_confidence
        session.snr_db = snr_db
        session.input_source = input_source  # Track: wispr_flow | mic_whisper | sample_fallback
        await self.db.flush()

        # Red flag check on extracted entities
        if detect_red_flag(nlu):
            session.state = SessionState.ESCALATED.value
            session.red_flag = True
            session.severity_score = severity_score(nlu, session.clarifying_questions_asked)
            await self.db.flush()
            await fire_alert(
                self.db, profile, session,
                AlertSeverity.URGENT_RED_FLAG.value,
                f"Red-flag symptoms detected: {', '.join(nlu.symptoms)}. "
                f"Elder said: {text}",
                sender=self.alerts,
            )
            return await self._escalated_reply(session, profile)

        missing = self._missing_context(nlu, text)
        if missing and session.clarifying_questions_asked < 2:
            session.clarifying_questions_asked += 1
            session.state = SessionState.CLARIFYING.value
            await self.db.flush()
            question = self._clarifying_question(missing[0], profile)
            await self._save_turn(session, "assistant", question, profile.preferred_language,
                                  clarifying_question=True)
            return MessageOut(
                session_id=session.id,
                reply_text=question,
                language=profile.preferred_language,
                state=session.state,
                clarifying_question=True,
            )

        # ---- guidance + summary ----
        session.state = SessionState.GUIDANCE.value
        score = severity_score(nlu, session.clarifying_questions_asked)
        session.severity_score = score
        session.vocal_fatigue_index = self._fatigue_index(text)
        await self.db.flush()

        guidance = self._build_guidance(nlu, profile, score, missing)

        # Log medication adherence if mentioned
        if nlu.medicine_mentioned and nlu.adherence:
            await self._log_adherence(profile, nlu.medicine_mentioned[0],
                                      nlu.adherence == "taken")

        session.state = SessionState.SUMMARY.value
        session.ended_at = datetime.now(timezone.utc)
        session.resolution_summary = guidance
        await self.db.flush()

        return MessageOut(
            session_id=session.id,
            reply_text=guidance,
            language=profile.preferred_language,
            state=session.state,
            summary=guidance,
        )

    # -- escalation ----------------------------------------------------------

    async def _escalated_reply(self, session: CheckInSession, profile: UserProfile) -> MessageOut:
        instructions = _t(profile.preferred_language, URGENT_INSTRUCTIONS,
                          name=profile.elder_name, emergency=profile.emergency_contact or "112")
        await self._save_turn(session, "assistant", instructions, profile.preferred_language)
        return MessageOut(
            session_id=session.id,
            reply_text=instructions,
            language=profile.preferred_language,
            state=SessionState.ESCALATED.value,
            escalation={
                "level": "urgent_red_flag",
                "title": "Urgent Escalation",
                "instruction": instructions,
                "call_emergency": profile.emergency_contact or "112",
            },
        )

    # -- helpers -------------------------------------------------------------

    async def _save_turn(
        self,
        session: CheckInSession,
        speaker: str,
        text: str,
        language: str = "en",
        asr_confidence: Optional[float] = None,
        clarifying_question: bool = False,
    ) -> None:
        turn = ConversationTurn(
            session_id=session.id,
            turn_index=(await self._next_turn_index(session.id)) + 1,
            speaker=speaker,
            text=text,
            language_detected=language,
            asr_confidence=asr_confidence,
            clarifying_question=clarifying_question,
        )
        self.db.add(turn)
        await self.db.flush()

    async def _next_turn_index(self, session_id: int) -> int:
        result = await self.db.execute(
            select(func.coalesce(func.max(ConversationTurn.turn_index), 0))
            .where(ConversationTurn.session_id == session_id)
        )
        return int(result.scalar_one())

    async def _pending_medications(self, profile: UserProfile) -> List[dict]:
        today = datetime.now(timezone.utc).date()
        result = await self.db.execute(
            select(MedicationSchedule).where(
                MedicationSchedule.profile_id == profile.id,
                MedicationSchedule.is_active == True,  # noqa: E712
            )
        )
        meds = result.scalars().all()
        taken_today = await self.db.execute(
            select(MedicationAdherenceLog.medication_id).where(
                MedicationAdherenceLog.taken_at >= today,
                MedicationAdherenceLog.medication_id.in_([m.id for m in meds]) if meds else False,
            )
        )
        taken_ids = {row[0] for row in taken_today.all()} if meds else set()
        return [
            {"id": m.id, "name": m.name, "dosage": m.dosage,
             "time_slot": m.time_slot, "spoken_alias": m.spoken_alias}
            for m in meds if m.id not in taken_ids
        ]

    async def _unresolved_symptoms(self, profile: UserProfile) -> str:
        since = datetime.now(timezone.utc) - timedelta(hours=72)
        result = await self.db.execute(
            select(ConversationTurn.text).join(CheckInSession).where(
                CheckInSession.profile_id == profile.id,
                CheckInSession.started_at >= since,
                ConversationTurn.speaker == "elder",
            )
        )
        texts = [row[0] for row in result.all()]
        if not texts:
            return ""
        combined = " ".join(texts)
        nlu = extract_entities(combined, language=profile.preferred_language)
        return ", ".join(nlu.symptoms) if nlu.symptoms else ""

    def _missing_context(self, nlu: NLUResult, text: str) -> List[str]:
        missing = []
        if nlu.symptoms and not nlu.duration:
            missing.append("onset_duration")
        if nlu.symptoms and nlu.hydration is None:
            missing.append("hydration")
        if nlu.medicine_mentioned and nlu.adherence is None:
            missing.append("dose_taken")
        return missing

    def _clarifying_question(self, missing_key: str, profile: UserProfile) -> str:
        questions = {
            "onset_duration": {
                "en": "When did this start, and how long has it lasted?",
                "hi": "Yeh kab shuru hua, aur kitne dinon se hai?",
                "te": "Idi eppudu prarambhamayyindi, enta kalam undi?",
                "kn": "Idu yavaga prarambhavayitu, eshtu dinagide?",
                "ta": "Idhu eppozhudhu thodangi, ethanai naalaga irukku?",
            },
            "hydration": {
                "en": "Have you been drinking enough water today?",
                "hi": "Kya aaj aapne paryapt paani piya hai?",
                "te": "Ippudu meeru saripada neeru chushara?",
                "kn": "Ippudu neenu sarigga neeru kudiddiya?",
                "ta": "Ippozh ungalukku sarivagu neeru kudithirukka?",
            },
            "dose_taken": {
                "en": "Did you take your medicine dose today?",
                "hi": "Kya aaj aapne apni dawa li hai?",
                "te": "Ippudu meeru mandu teesara?",
                "kn": "Ippudu neenu oushadhi teedukiddiya?",
                "ta": "Ippozh ungal marundhu edukkirunga?",
            },
        }
        return questions[missing_key].get(profile.preferred_language,
                                          questions[missing_key]["en"])

    def _build_guidance(self, nlu: NLUResult, profile: UserProfile,
                        score: int, missing: List[str]) -> str:
        lang = profile.preferred_language
        band = severity_band(score)
        if band == "urgent":
            base = {
                "en": "Please contact your doctor or emergency services ({emergency}) today.",
                "hi": "Kripya aaj apne doctor ya emergency services ({emergency}) se sampark karein.",
                "te": "Dayachesi ippudu mee doctor leda emergency services ({emergency}) nu samparkam cheyandi.",
                "kn": "Dayavittu ega nimma doctor leda emergency services ({emergency}) nige samparka madiri.",
                "ta": "Dayavusei ippo ungal doctor allathu emergency services ({emergency}) kudangi.",
            }.get(lang, "en").format(emergency=profile.emergency_contact or "112")
        elif band == "elevated":
            base = {
                "en": "Keep monitoring your symptoms and contact your doctor if they worsen.",
                "hi": "Apne lakshanon par nazar rakhein aur badhne par doctor se sampark karein.",
                "te": "Mee lakshanalanu gamaninchandi, hecharite doctor nu samparkinchandi.",
                "kn": "Nimma lakshanagalu gamanisi, heesaridare doctor kare keli.",
                "ta": "Ungal arigurigalai paraamarikkavum, mosamadaiyinaal doctor kudangavum.",
            }.get(lang, "en")
        else:
            base = {
                "en": "You seem to be doing fine. Keep resting and stay hydrated.",
                "hi": "Aap theek lag rahe hain. Aaram karein aur paani peete rahein.",
                "te": "Meeru sarigga untunnaru. Vishramam teesukondi, neeru chorukondi.",
                "kn": "Neenu saragi iddeera. Aagisi neeru kudiki.",
                "ta": "Neengal nalladhu irukku. Odhukkavum, neeru kudikkavum.",
            }.get(lang, "en")

        parts = [base]
        if nlu.adherence == "missed":
            parts.append({
                "en": "Remember to take your missed medicine as advised by your doctor.",
                "hi": "Doctor ki salah ke anusar chooti hui dawa le lena yaad rakhein.",
                "te": "Doctor council prakaram miss ayina mandu teesukondi.",
                "kn": "Doctor sala prakaranante bittida oushadhi tegedukolli.",
                "ta": "Doctor vazhikattudhal muraiku etra maruthu eduthu kollunga.",
            }.get(lang, "en"))
        if nlu.sleep_quality == "poor":
            parts.append({
                "en": "Try to get a good night's sleep — it helps your recovery.",
                "hi": "Raat ko acchi neend lein — isse recovery mein madad milti hai.",
                "te": "Ratriku nannu nidra ponalani prayatnichandi.",
                "kn": "Ratriye nannu nidi — idu araikage sahaya maduttade.",
                "ta": "Iravu nallamal narukka muyarchi seyvunga.",
            }.get(lang, "en"))

        return " ".join(parts)

    def _fatigue_index(self, text: str) -> Optional[float]:
        # Simple proxy: longer, lower-confidence utterances suggest fatigue.
        if not text:
            return None
        return round(min(1.0, len(text) / 200.0), 3)

    async def _log_adherence(self, profile: UserProfile, medicine_key: str, taken: bool) -> None:
        result = await self.db.execute(
            select(MedicationSchedule).where(
                MedicationSchedule.profile_id == profile.id,
                MedicationSchedule.is_active == True,  # noqa: E712
            )
        )
        meds = result.scalars().all()
        target = None
        for m in meds:
            if (medicine_key in (m.name.lower(), m.spoken_alias.lower())
                    or m.spoken_alias.lower() in medicine_key):
                target = m
                break
        if target:
            log = MedicationAdherenceLog(
                medication_id=target.id,
                taken=taken,
                source="voice",
            )
            self.db.add(log)
            await self.db.flush()