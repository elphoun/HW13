"""Judge short spoken answers against the word bank.

The transcripts below are what Whisper (base.en) actually returned for speech, so they carry
real mishearings, trailing periods and stray words. Needs the built packs in laptop/packs.

    python tests/test_judge.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "laptop"))
import krillion_api as K

# (pack, what was said, what Whisper heard, expected how it matches)
SHOULD_MATCH = [
    ("shark",         "hammerhead shark",       "Hammerhead shark.",          "exact"),
    ("shark",         "Longnose Gulper Shark",  "Longnose Culper Shark.",     "spelling"),
    ("cat_breed",     "Munchkin cat",           "munchkin",                   "exact"),   # category word dropped
    ("cheese",        "Roquefort cheese",       "Roquefort",                  "exact"),
    ("cheese",        "A Filetta",              "A filleta.",                 "sound"),
    ("constellation", "Grus",                   "Gross.",                     "sound"),
    ("moon",          "Beli",                   "Belly",                      "sound"),
    ("instrument",    "Dean Razorback",         "Dean Raiserback",            "sound"),
    ("cheese",        "Quesillo",               "Quisillo.",                  "sound"),
    ("shark",         "hammerhead shark",       "um I think it's a hammerhead shark", "exact"),  # filler words
]
SHOULD_REJECT = [   # made-up or wrong words must not sneak in through the sound match
    ("shark",         "banana bread"),
    ("shark",         "purple monkey dishwasher"),
    ("country",       "tacos"),
    ("country",       "pass"),
    ("element",       "ten"),             # 3-letter sound keys are too thin to trust
    ("cheese",        "thank you"),
    ("dog_breed",     "I don't know"),
    ("greek_god",     "refrigerator"),
    ("prog_lang",     "blorp"),
]

fails = []
for pack_id, said, heard, how in SHOULD_MATCH:
    pack = K.PACKS[pack_id]
    a, via = pack.match_explain(heard)
    # A mishearing must be judged the same as saying it correctly (the word bank decides who
    # owns a name when aliases overlap, e.g. two sharks both called "longnose gulper shark").
    want = pack.answers[pack.index[K.normalize(said)]]
    if a is None or a.id != want.id:
        fails.append(f"{pack_id}: said {said!r}, heard {heard!r} -> {a.name if a else None!r} (wanted {want.name!r})")
    elif how and via != how:
        fails.append(f"{pack_id}: {heard!r} matched via {via}, expected {how}")
for pack_id, said in SHOULD_REJECT:
    a, via = K.PACKS[pack_id].match_explain(said)
    if a is not None:
        fails.append(f"{pack_id}: {said!r} should be rejected but matched {a.name!r} via {via}")

# Short names get no plural twin ("Pa" -> "pas"), which would turn "pass" into protactinium.
assert "pas" not in K.variants("Pa")

if fails:
    print("FAIL")
    print(*fails, sep="\n  ")
    sys.exit(1)
print(f"OK: {len(SHOULD_MATCH)} spoken answers matched, {len(SHOULD_REJECT)} wrong ones rejected")
