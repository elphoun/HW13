"""
Krillion API — a small local service that serves prompts and judges answers.

Prompt packs are JSON files in ./packs (build real ones with build_packs.py).
Each answer has a "popularity" number (for Wikidata packs: how many language
Wikipedias have an article about it). Rarer = fewer = more points.

Run:   uvicorn krillion_api:app --port 8000
Docs:  http://localhost:8000/docs

Endpoints
  GET  /packs                       list packs
  GET  /prompts/random?exclude=a,b  pick a prompt (not in exclude)
  POST /judge                       {"pack_id", "answer", "used": [answer_id, ...]}
  GET  /packs/{id}/deep_cuts?n=3    a few of the rarest answers (for reveals)
"""

from __future__ import annotations

import json
import random
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from rapidfuzz import fuzz, process

PACK_DIR = Path(__file__).parent / "packs"

# Rarity tiers, by popularity percentile inside the pack (0 = most popular).
# (upper percentile bound, name, points, sound the Arduino plays, short LCD label)
TIERS = [
    (0.10, "Shallows",          1,  "ok",    "Shallows"),
    (0.30, "Reef",              2,  "good",  "Reef"),
    (0.60, "Twilight Zone",     3,  "good",  "Twilight"),
    (0.90, "Abyss",             5,  "great", "Abyss"),
    (1.01, "One in a Krillion", 10, "krill", "KRILLION!"),
]

FUZZY_MIN_SCORE = 88       # 0..100, how close a misheard word may be
FUZZY_MIN_LEN = 4          # don't fuzzy-match very short strings
FILLER = {"um", "uh", "er", "like", "i", "think", "its", "it's", "is", "say", "ill",
          "i'll", "my", "answer", "maybe", "okay", "ok", "so", "um,", "hmm"}


# ------------------------------------------------------------------ text ----
def normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"^(the|a|an) ", "", s.strip())
    return re.sub(r"\s+", " ", s).strip()


def variants(s: str) -> set[str]:
    """Normalized form plus a naive singular/plural twin ("sharks" ~ "shark")."""
    n = normalize(s)
    out = {n}
    if n.endswith("es") and len(n) > 4:
        out.add(n[:-2])
    if n.endswith("s") and len(n) > 3:
        out.add(n[:-1])
    else:
        out.add(n + "s")
    out |= {v.replace(" ", "") for v in out}           # "blob fish" == "blobfish"
    return {v for v in out if v}


def candidate_phrases(transcript: str, max_words: int = 6) -> list[str]:
    """Whole transcript, then every word n-gram, longest first.
    "um I think it's a hammerhead shark" -> ..., "hammerhead shark", ...
    """
    words = [w for w in normalize(transcript).split()]
    core = [w for w in words if w not in FILLER] or words
    phrases = [" ".join(words), " ".join(core)]
    for n in range(min(max_words, len(core)), 0, -1):
        for i in range(len(core) - n + 1):
            phrases.append(" ".join(core[i:i + n]))
            if n > 1:
                phrases.append("".join(core[i:i + n]))
    seen, out = set(), []
    for p in phrases:
        if p and p not in seen:
            seen.add(p)
            out.append(p)
    return out


# ----------------------------------------------------------------- packs ----
@dataclass
class Answer:
    id: int
    name: str
    popularity: float
    tier: int = 0


@dataclass
class Pack:
    id: str
    prompt: str
    answers: list[Answer]
    index: dict[str, int] = field(default_factory=dict)  # normalized key -> answer id
    sample: bool = False

    @classmethod
    def load(cls, path: Path) -> "Pack":
        raw = json.loads(path.read_text(encoding="utf-8"))
        rows = sorted(raw["answers"], key=lambda a: -a.get("popularity", 0))
        answers = [Answer(i, r["name"], r.get("popularity", 0)) for i, r in enumerate(rows)]
        n = len(answers)
        for a in answers:
            pct = a.id / max(n - 1, 1)
            a.tier = next(i for i, t in enumerate(TIERS) if pct < t[0])
        pack = cls(raw["id"], raw["prompt"], answers, sample=raw.get("sample", False))
        # Most popular answer claims a shared alias first ("salmon" -> Atlantic salmon).
        for a, r in zip(answers, rows):
            for key in [r["name"], *r.get("aliases", [])]:
                if len(normalize(key)) < 2:
                    continue
                for v in variants(key):
                    pack.index.setdefault(v, a.id)
        return pack

    def match(self, transcript: str) -> Answer | None:
        phrases = candidate_phrases(transcript)
        for p in phrases:                                   # exact, longest phrase first
            if p in self.index:
                return self.answers[self.index[p]]
        best = None
        for p in phrases:                                   # then fuzzy (mishearings)
            if len(p) < FUZZY_MIN_LEN:
                continue
            hit = process.extractOne(p, self.index.keys(), scorer=fuzz.ratio,
                                     score_cutoff=FUZZY_MIN_SCORE)
            if hit and (best is None or hit[1] > best[1]):
                best = hit
        return self.answers[self.index[best[0]]] if best else None


def load_packs() -> dict[str, Pack]:
    packs = {}
    for path in sorted(PACK_DIR.glob("*.json")):
        try:
            p = Pack.load(path)
        except (KeyError, json.JSONDecodeError) as e:
            print(f"skipping {path.name}: {e}")
            continue
        if len(p.answers) >= 10:
            packs[p.id] = p
    # Prefer real (built) packs over the hand-made samples when both exist.
    if any(not p.sample for p in packs.values()):
        packs = {k: p for k, p in packs.items() if not p.sample}
    return packs


PACKS = load_packs()

# ------------------------------------------------------------------- api ----
app = FastAPI(title="Krillion API", version="1.0")


class JudgeIn(BaseModel):
    pack_id: str
    answer: str
    used: list[int] = []


class JudgeOut(BaseModel):
    valid: bool
    repeat: bool = False
    answer_id: int | None = None
    name: str | None = None
    tier: int | None = None
    tier_name: str | None = None
    tier_lcd: str | None = None
    points: int = 0
    sound: str = "bad"
    heard: str


@app.get("/packs")
def list_packs():
    return [{"id": p.id, "prompt": p.prompt, "size": len(p.answers), "sample": p.sample}
            for p in PACKS.values()]


@app.get("/prompts/random")
def random_prompt(exclude: str = ""):
    skip = set(filter(None, exclude.split(",")))
    pool = [p for p in PACKS.values() if p.id not in skip] or list(PACKS.values())
    if not pool:
        raise HTTPException(503, "no packs loaded — run build_packs.py")
    p = random.choice(pool)
    return {"pack_id": p.id, "prompt": p.prompt, "size": len(p.answers)}


@app.post("/judge", response_model=JudgeOut)
def judge(body: JudgeIn):
    pack = PACKS.get(body.pack_id)
    if not pack:
        raise HTTPException(404, "unknown pack")
    a = pack.match(body.answer)
    if a is None:
        return JudgeOut(valid=False, heard=body.answer)
    if a.id in body.used:
        return JudgeOut(valid=False, repeat=True, answer_id=a.id, name=a.name, heard=body.answer)
    name, points, sound, short = TIERS[a.tier][1:]
    return JudgeOut(valid=True, answer_id=a.id, name=a.name, tier=a.tier, tier_name=name,
                    tier_lcd=short, points=points, sound=sound, heard=body.answer)


@app.get("/packs/{pack_id}/deep_cuts")
def deep_cuts(pack_id: str, n: int = 3, exclude: str = ""):
    pack = PACKS.get(pack_id)
    if not pack:
        raise HTTPException(404, "unknown pack")
    skip = {int(x) for x in exclude.split(",") if x}
    rare = [a for a in pack.answers if a.tier >= 3 and a.id not in skip]
    return [{"name": a.name, "tier_name": TIERS[a.tier][1]}
            for a in random.sample(rare, min(n, len(rare)))]
