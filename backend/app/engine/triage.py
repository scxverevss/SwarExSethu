"""Clinical triage helpers: red-flag detection and severity scoring."""

from typing import List

from app.engine.nlu import NLUResult, is_red_flag


def detect_red_flag(nlu: NLUResult) -> bool:
    """Return True if any high-risk symptom cluster is present."""
    return is_red_flag(nlu.symptoms) or nlu.red_flag


def severity_score(nlu: NLUResult, clarifying_count: int = 0) -> int:
    """Return a 0-10 clinical severity score (not a diagnosis)."""
    score = 0
    if detect_red_flag(nlu):
        score = 9
    elif nlu.severity == "severe":
        score = 6
    elif nlu.severity == "moderate":
        score = 4
    elif nlu.severity == "mild":
        score = 2

    # duration raises concern
    if nlu.duration:
        score = min(10, score + 1)

    # poor sleep / hydration adds minor concern
    if nlu.sleep_quality == "poor":
        score = min(10, score + 1)
    if nlu.hydration == "low":
        score = min(10, score + 1)

    return score


def severity_band(score: int) -> str:
    if score >= 7:
        return "urgent"
    if score >= 4:
        return "elevated"
    return "routine"