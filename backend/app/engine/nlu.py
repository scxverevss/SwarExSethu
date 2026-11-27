"""Deterministic code-switched NLU for SwarExSethu.

Extracts symptoms, duration, severity, sleep, hydration, medication adherence
from mixed Hindi/Telugu/Kannada/Tamil + English utterances. Fully offline —
no API keys required. Upgradable to an LLM-backed extractor later.
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class NLUResult:
    symptoms: List[str] = field(default_factory=list)
    duration: Optional[str] = None
    severity: Optional[str] = None  # mild | moderate | severe
    sleep_quality: Optional[str] = None  # good | poor | disturbed
    hydration: Optional[str] = None  # ok | low
    adherence: Optional[str] = None  # taken | missed | unsure
    medicine_mentioned: List[str] = field(default_factory=list)
    red_flag: bool = False
    raw_text: str = ""
    language: str = "en"
    confidence: float = 1.0


# ---- symptom lexicons (code-switched) ----
SYMPTOM_KEYWORDS = {
    # chest / heart
    "chest pain": [
        "chest pain", "chest tightness", "seene mein dard", "seene mein jakd",
        "chati mein dard", "chati mein bandh", "nedi noppi", "nedi vali",
        "melle noppi", "edeu noppi", "vayathu noppi", "chestil novu", "vayathu nokku",
    ],
    # breathlessness
    "breathlessness": [
        "breathless", "shortness of breath", "saans", "saans chadhna",
        "sans lena mushkil", "ghabaraht", "shwasa", "shwasa tinnadi",
        "mogava teerudadam", "nosu nodu", "mosu nage", "moochu pidipp",
        "noshu kuraidu", "swasathil kuraivu",
    ],
    # dizziness
    "dizziness": [
        "chakkar", "chakkar aana", "dizzy", "head spinning", "sir ghuma",
        "talatu tirugadam", "tala tirugadam", "tale suthu", "tale suru",
        "thala thirudhu", "thalathil suruku", "chakkar lagna",
    ],
    # fainting / syncope
    "syncope": [
        "fainting", "faint", "best hona", "behoshi", "besh ho jana",
        "murcha", "marchi gaya", "nidra povadam", "tala vedana",
        "thandri kudikiradam", "munne pidipp", "nomu pidipp",
    ],
    # slurred speech / weakness (stroke signs)
    "slurred_speech": [
        "slurred", "unclear speech", "bolne mein dikat", "jibh",
        "matladi ledu", "matladadam kashtam", "mattu matladuvudu",
        "pesadhu kadinama", "pesudhu kashtam", "naaku matladali",
    ],
    "unilateral_weakness": [
        "weakness", "one side", "half body", "ek taraf", "ek haath",
        "haath kamzor", "pair kamzor", "eka paksham", "pakshavadham",
        "ondu ede balina", "ondu kai balina", "iru pakkam",
        "oru pakkam balavu", "vaal pakkam", "idathu kai",
    ],
    # confusion
    "confusion": [
        "confusion", "confused", "samajh nahi", "samajh nahi aaya",
        "bhullana", "bhulna", "yaad nahi", "buddhi", "matladukudadam",
        "alpam buddhi", "gottilla", "naane yaaru", "enakkuriya",
        "manama thangudhu", "ninaivil illa",
    ],
    # pain general
    "pain": [
        "pain", "dard", "noppi", "novu", "vedana", "dukhna", "dukhai",
        "dukhadam", "noppi untundi", "novu undi", "noppi pidi",
    ],
    # fatigue / weakness
    "fatigue": [
        "fatigue", "tired", "thak", "thakan", "kamzori", "weakness",
        "thaklagadam", "kallu tiragadam", "kallu tharadam", "alasya",
        "thakuvudu", "thakada", "thakkam", "thakavu", "neenda alasyam",
    ],
    # sleep
    "sleep": [
        "sleep", "neend", "nindra", "nidra", "ghuma", "sutti",
        "nenu", "moogu", "idare", "kallu mooduvudu",
    ],
}

# severity cues
SEVERITY_CUES = {
    "severe": ["severe", "bhut", "teevra", "kadina", "periya", "mukhya",
               "intense", "bad", "worst", "unbearable", "sahna mushkil"],
    "moderate": ["moderate", "thoda", "kuch", "madhya", "sadharana", "medium"],
    "mild": ["mild", "kam", "halka", "chhota", "samanya", "little", "slight"],
}

# duration cues
DURATION_CUES = [
    r"(\d+)\s*(day|days|din|roju|dina|divasam|nalam|rojelu)",
    r"(\d+)\s*(week|weeks|hafta|varam|varalu)",
    r"(\d+)\s*(hour|hours|ghanta|ghante|manik)",
    r"(\d+)\s*(minute|minutes|minute|nimisham)",
    r"since\s+(morning|evening|night|yesterday|kal|parasne|ninnale|indi)",
    r"(since|from)\s+(today|aaj|innu|ninnu)",
]

# medication adherence cues
ADHERENCE_TAKEN = ["taken", "liya", "khad", "adi", "taken", "vachindi", "iddare",
                   "kontham", "eedukundam", "unda", "tine", "khaya", "goli kha li",
                   "tablet kha li", "dawa li", "medicine li"]
ADHERENCE_MISSED = ["missed", "forgot", "nahi liya", "le nahi", "bhul gaya",
                    "ledu", "unda ledu", "iddene", "kudadu", "forgot to take",
                    "did not take", "nahi khaya", "goli nahi", "tablet nahi"]

# Red-flag symptom clusters (immediate escalation)
RED_FLAG_SYMPTOMS = {
    "chest pain", "breathlessness", "syncope", "slurred_speech",
    "unilateral_weakness", "confusion",
}

# Medicine spoken aliases commonly used by Indian elders
MEDICINE_ALIASES = {
    "bp ki goli": "bp",
    "sugar tablet": "sugar",
    "blood pressure ki golī": "bp",
    "pressure tablet": "bp",
    "sugar ki golī": "sugar",
    "madhumeh ki golī": "sugar",
    "bp tablet": "bp",
    "sugar ki dawa": "sugar",
    "bp ki dawa": "bp",
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def extract_entities(text: str, language: str = "en") -> NLUResult:
    normalized = _normalize(text)
    result = NLUResult(raw_text=text, language=language, confidence=1.0)

    # --- symptoms ---
    found_symptoms = []
    for symptom, keywords in SYMPTOM_KEYWORDS.items():
        for kw in keywords:
            if kw in normalized:
                found_symptoms.append(symptom)
                break
    result.symptoms = sorted(set(found_symptoms))

    # --- red flag ---
    if set(result.symptoms) & RED_FLAG_SYMPTOMS:
        result.red_flag = True
        result.severity = "severe"

    # --- severity ---
    if not result.severity:
        for level in ("severe", "moderate", "mild"):
            for cue in SEVERITY_CUES[level]:
                if cue in normalized:
                    result.severity = level
                    break
            if result.severity:
                break

    # --- duration ---
    for pattern in DURATION_CUES:
        m = re.search(pattern, normalized)
        if m:
            result.duration = m.group(0)
            break

    # --- sleep ---
    if any(w in normalized for w in ["neend nahi", "nidra ledu", "sleep nahi",
                                      "sutti ledu", "idhe ledu", "not sleeping",
                                      "sleep disturbed", "sleep poor"]):
        result.sleep_quality = "poor"
    elif any(w in normalized for w in ["neend aayi", "nidra vachindi", "good sleep",
                                       "slept well", "sleep good"]):
        result.sleep_quality = "good"

    # --- hydration ---
    if any(w in normalized for w in ["thirsty", "pyas", "thirst", "neeru",
                                      "pani", "water", "dehydrat"]):
        result.hydration = "low"
    elif any(w in normalized for w in ["water pi li", "neeru kuda", "pani khulli",
                                       "hydrated"]):
        result.hydration = "ok"

    # --- adherence & medicine ---
    for alias in MEDICINE_ALIASES:
        if alias in normalized:
            result.medicine_mentioned.append(MEDICINE_ALIASES[alias])
    if any(w in normalized for w in ADHERENCE_TAKEN):
        result.adherence = "taken"
    elif any(w in normalized for w in ADHERENCE_MISSED):
        result.adherence = "missed"

    # confidence heuristic
    if result.symptoms:
        result.confidence = 0.9
    elif not result.raw_text.strip():
        result.confidence = 0.0

    return result


def is_red_flag(symptoms: List[str]) -> bool:
    return bool(set(symptoms) & RED_FLAG_SYMPTOMS)