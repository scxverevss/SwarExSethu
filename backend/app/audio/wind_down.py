"""Raga-inspired evening wind-down scale definitions.

The frontend Web Audio API synthesizes these as polyphonic tanpura/flute-style
harmonic drones. Data only — the actual sound is generated client-side so the
server stays lightweight.
"""

from typing import Dict, List

# Note frequencies (equal temperament, A4 = 440 Hz)
BASE_FREQS = {
    "C": 261.63,
    "C#": 277.18,
    "D": 293.66,
    "D#": 311.13,
    "E": 329.63,
    "F": 349.23,
    "F#": 369.99,
    "G": 392.00,
    "G#": 415.30,
    "A": 440.00,
    "A#": 466.16,
    "B": 493.88,
}

# Raga -> scale degrees (Sa, Re, Ga, Ma, Pa, Dha, Ni) mapped to semitone offsets
# from the tonic (Sa). Yaman and Bhairavi are evening/night ragas suited to
# a gentle wind-down.
RAGA_SCALES: Dict[str, Dict] = {
    "yaman": {
        "name": "Raga Yaman (evening)",
        "tonic": "C",
        "intervals": [0, 2, 4, 6, 7, 9, 11, 12],  # shuddha Re/Ga, tivra Ma
        "drone_notes": ["C", "G"],
        "bpm": 50,
    },
    "bhairavi": {
        "name": "Raga Bhairavi (night)",
        "tonic": "C",
        "intervals": [0, 1, 3, 5, 7, 8, 10, 12],  # komal Re/Ga/Dha/Ni
        "drone_notes": ["C", "G"],
        "bpm": 45,
    },
    "bihag": {
        "name": "Raga Bihag (night)",
        "tonic": "C",
        "intervals": [0, 2, 4, 6, 7, 9, 11, 12],
        "drone_notes": ["C", "G"],
        "bpm": 55,
    },
}

DEFAULT_RAGA = "yaman"


def get_raga(raga: str) -> Dict:
    return RAGA_SCALES.get(raga.lower(), RAGA_SCALES[DEFAULT_RAGA])


def list_ragas() -> List[Dict]:
    return [
        {"key": key, "name": val["name"], "bpm": val["bpm"]}
        for key, val in RAGA_SCALES.items()
    ]