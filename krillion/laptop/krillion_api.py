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

FUZZY_MIN_SCORE = 88       # 0..100, how close a misheard word may be (by spelling)
FUZZY_MIN_LEN = 4          # don't fuzzy-match very short strings
SOUND_MIN_SCORE = 90       # 0..100, how close two "sound keys" must be. Because the keys are
                           # short, this allows one slip only on keys of ~6+ characters, so short
                           # words must sound identical.
SOUND_LONG_LEN = 8         # keys this long carry enough sounds to forgive one more slip...
SOUND_LONG_SCORE = 85      # ...down to this score
SOUND_MIN_LEN = 4          # shortest sound key we'll match at all
SOUND_MIN_LEN_SUB = 6      # ...and when it's only part of a longer sentence
SPOKEN_MAX_WORDS = 3       # answers are usually 1-3 words; guess-by-sound only looks at this much
STRIP_SUFFIX_SHARE = 0.10  # "Roquefort cheese" also answers to "Roquefort" if >=10% of the pack ends in "cheese"
FILLER = {"um", "uh", "er", "like", "i", "think", "its", "it's", "is", "say", "ill",
          "i'll", "my", "answer", "maybe", "okay", "ok", "so", "um,", "hmm", "uhm", "erm",
          "the", "a", "an", "guess", "pick", "going", "go", "with", "would", "be", "that", "was"}


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
    elif len(n) > 3:                                   # not "pa" -> "pas" (chemical symbols)
        out.add(n + "s")
    out |= {v.replace(" ", "") for v in out}           # "blob fish" == "blobfish"
    return {v for v in out if v}


_SOUND_RULES = [
    (r"^(kn|gn)", "n"), (r"^wr", "r"), (r"^ps", "s"), (r"^x", "z"), (r"^y", "Y"),
    (r"mb$", "m"),
    (r"tch|sch|sh|ch", "X"),        # sh / ch / tch are close enough for a speech-to-text guess
    (r"ph", "f"), (r"th", "t"), (r"gh", ""), (r"dg", "j"), (r"ck", "k"),
    (r"qu", "kw"), (r"q", "k"), (r"x", "ks"), (r"c(?=[eiy])", "s"), (r"c", "k"), (r"z", "s"),
    (r"h", ""),
    (r"(.)\1+", r"\1"),             # doubled letters: "Filetta" ~ "filleta"
    (r"y", "i"),                    # vowels are what Whisper gets wrong most, so blur them
    (r"[ei]+", "e"), (r"[ou]+", "o"), (r"a+", "a"),   # but not into nothing: "ten" != "tan"
]


def sound_key(s: str) -> str:
    """Rough phonetic fingerprint, spaces removed: "Kydnos" and "kydness" both give a close "kednos"/"kednes"."""
    s = normalize(s).replace(" ", "")
    for pat, rep in _SOUND_RULES:
        s = re.sub(pat, rep, s)
    return re.sub(r"(.)\1+", r"\1", s)


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
    sounds: dict[str, dict[str, int]] = field(default_factory=dict)  # first sound -> {sound_key: answer id}
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
        keys = [[k for k in [r["name"], *r.get("aliases", [])] if len(normalize(k)) >= 2]
                for r in rows]
        for a, ks in zip(answers, keys):
            for key in ks:
                for v in variants(key):
                    pack.index.setdefault(v, a.id)
        # Players drop the category word: "Roquefort" for "Roquefort cheese". Added after every
        # full name has claimed its key, so a shortened form never beats a real answer.
        tail = pack._common_tail(rows)
        if tail:
            for a, ks in zip(answers, keys):
                for key in ks:
                    words = normalize(key).split()
                    if len(words) >= 2 and words[-1] == tail and len(" ".join(words[:-1])) >= 4:
                        for v in variants(" ".join(words[:-1])):
                            pack.index.setdefault(v, a.id)
        # Sound-alikes (for Whisper mishearings) across every spelling we accept.
        owner = dict(pack.index)
        for key, aid in owner.items():
            k = sound_key(key)
            if k:
                pack.sounds.setdefault(k[0], {}).setdefault(k, aid)
        return pack

    @staticmethod
    def _common_tail(rows: list[dict]) -> str | None:
        """The last word shared by >=10% of multi-word names ("cheese", "shark"), if any."""
        ends: dict[str, int] = {}
        for r in rows:
            w = normalize(r["name"]).split()
            if len(w) >= 2:
                ends[w[-1]] = ends.get(w[-1], 0) + 1
        if not ends:
            return None
        word, count = max(ends.items(), key=lambda kv: kv[1])
        return word if len(word) >= 3 and count >= STRIP_SUFFIX_SHARE * len(rows) else None

    def match(self, transcript: str) -> Answer | None:
        return self.match_explain(transcript)[0]

    def match_explain(self, transcript: str) -> tuple[Answer | None, str]:
        """Find the word-bank answer a spoken transcript means. Returns (answer, how).

        Order: exact spelling, then close spelling, then close sound. Answers are usually 1-3
        words, so the "close" steps only look at phrases of up to SPOKEN_MAX_WORDS words.
        """
        phrases = candidate_phrases(transcript)
        for p in phrases:                                   # exact, longest phrase first
            if p in self.index:
                return self.answers[self.index[p]], "exact"
        short = [p for p in phrases if len(p.split()) <= SPOKEN_MAX_WORDS]
        best = None
        for p in short:                                     # then fuzzy spelling
            if len(p) < FUZZY_MIN_LEN:
                continue
            hit = process.extractOne(p, self.index.keys(), scorer=fuzz.ratio,
                                     score_cutoff=FUZZY_MIN_SCORE)
            if hit and (best is None or hit[1] > best[1]):
                best = hit
        if best:
            return self.answers[self.index[best[0]]], "spelling"
        whole = normalize(transcript)
        for p in short:                                     # then fuzzy sound
            k = sound_key(p)
            # A short sound key is only trusted when it's the whole thing said.
            if len(k) < (SOUND_MIN_LEN if p.replace(" ", "") == whole.replace(" ", "")
                         else SOUND_MIN_LEN_SUB):
                continue
            # Speech-to-text slips on vowels and middles, rarely on the first sound.
            group = self.sounds.get(k[0], {})
            hit = process.extractOne(k, group.keys(), scorer=fuzz.ratio,
                                     score_cutoff=SOUND_LONG_SCORE)
            if hit and hit[1] < SOUND_MIN_SCORE and min(len(k), len(hit[0])) < SOUND_LONG_LEN:
                hit = None
            if hit and (best is None or hit[1] > best[1]):
                best = (hit[0], hit[1], group[hit[0]])
        if best:
            return self.answers[best[2]], "sound"
        return None, ""


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
    via: str = ""                   # how the transcript matched: exact / spelling / sound


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
    a, via = pack.match_explain(body.answer)
    if a is None:
        return JudgeOut(valid=False, heard=body.answer)
    if a.id in body.used:
        return JudgeOut(valid=False, repeat=True, answer_id=a.id, name=a.name,
                        heard=body.answer, via=via)
    name, points, sound, short = TIERS[a.tier][1:]
    return JudgeOut(valid=True, answer_id=a.id, name=a.name, tier=a.tier, tier_name=name,
                    tier_lcd=short, points=points, sound=sound, heard=body.answer, via=via)


@app.get("/packs/{pack_id}/deep_cuts")
def deep_cuts(pack_id: str, n: int = 3, exclude: str = ""):
    pack = PACKS.get(pack_id)
    if not pack:
        raise HTTPException(404, "unknown pack")
    skip = {int(x) for x in exclude.split(",") if x}
    rare = [a for a in pack.answers if a.tier >= 3 and a.id not in skip]
    return [{"name": a.name, "tier_name": TIERS[a.tier][1]}
            for a in random.sample(rare, min(n, len(rare)))]
