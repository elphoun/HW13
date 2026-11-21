"""Push-to-talk: key handling, the turn loop's press/release flow, and (optionally) real Whisper.

    python tests/test_ptt.py             # fast, no microphone or Whisper needed
    python tests/test_ptt.py --whisper   # also: fake mic -> real Voice -> Whisper -> word bank
                                         #   (macOS only: uses `say` to make the speech)
"""
import argparse
import pathlib
import queue
import subprocess
import sys
import tempfile
import threading
import time
import wave
from types import SimpleNamespace

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "laptop"))
import host

ARGS = SimpleNamespace(turn_seconds=3.0, fast=True, arc=[15, 165])


# ---------------------------------------------------------------- key handling ----
def test_key_autorepeat():
    """Holding a key makes the OS repeat key-down; only the first may start a recording."""
    ev = queue.Queue()
    k = host.PttKey.__new__(host.PttKey)
    k.events, k.down, k.key = ev, False, "SPACE"
    for key in ["SPACE", "SPACE", "SPACE", "x"]:    # held (repeating) + a stray other key
        k._press(key)
    k._release("x")                                 # releasing a different key does nothing
    k._release("SPACE")
    k._release("SPACE")
    got = []
    while not ev.empty():
        got.append(ev.get())
    assert got == [("btn", host.BTN_TALK, True), ("btn", host.BTN_TALK, False)], got


# ------------------------------------------------------------------ turn loop ----
class FakeVoice:
    """Stands in for Voice: records nothing, 'hears' whatever we script."""

    def __init__(self, transcripts):
        self.transcripts, self.stream, self.started = list(transcripts), None, 0

    def start(self):
        self.started += 1
        self.stream = object()
        return True

    def stop_and_transcribe(self, hint):
        self.stream = None
        return self.transcripts.pop(0)


class Recorder(host.SimBody):
    def __init__(self):
        super().__init__(fast=True)
        self.sent = []

    def send(self, cmd, timeout=0):
        self.sent.append(cmd)
        super().send(cmd, timeout)


def play_turn(presses, transcripts, pack_id="shark"):
    """Run one turn. `presses` = list of seconds to hold TALK, back to back."""
    api = host.Api("local")
    ev = queue.Queue()
    body = Recorder()
    voice = FakeVoice(transcripts)
    g = host.Game(body, api, ev, voice, ARGS)
    g.n, g.hearts, g.score = 2, [3, 3], [0, 0]
    prompt = next(dict(pack_id=x["id"], prompt=x["prompt"], size=x["size"])
                  for x in api.http.get("/packs").json() if x["id"] == pack_id)

    def finger():
        time.sleep(0.3)                             # after the turn drains stale presses
        for hold in presses:
            ev.put(("btn", host.BTN_TALK, True))
            time.sleep(hold)
            ev.put(("btn", host.BTN_TALK, False))
            time.sleep(0.2)
    threading.Thread(target=finger, daemon=True).start()
    res = g.turn(0, prompt, [])
    return res, body, voice, g


def test_hold_and_answer():
    import krillion_api as K
    name = K.PACKS["shark"].answers[0].name
    res, body, voice, g = play_turn([0.5], [name])
    assert res and res["valid"], res
    assert voice.started == 1
    assert any("listening" in c for c in body.sent), body.sent
    assert any("thinking" in c for c in body.sent), body.sent
    assert g.hearts == [3, 3]


def test_fumbled_tap_then_real_answer():
    """An empty transcript (a tap, or silence) must not cost a heart: the player tries again."""
    import krillion_api as K
    name = K.PACKS["shark"].answers[0].name
    res, body, voice, g = play_turn([0.1, 0.5], ["", name])
    assert res and res["valid"], res
    assert voice.started == 2
    assert g.hearts == [3, 3]


def test_wrong_answer_costs_a_heart():
    res, body, voice, g = play_turn([0.4], ["banana bread lasagna"])
    assert res and not res["valid"]
    assert g.hearts == [2, 3], g.hearts


# --------------------------------------------------------------- real whisper ----
def test_whisper_end_to_end():
    """Fake mic feeds spoken audio to the real Voice class; Whisper + word bank judge it."""
    import numpy as np
    import krillion_api as K

    voice = host.Voice("base.en")
    tmp = pathlib.Path(tempfile.mkdtemp())

    def speak(text):
        aiff, wav = tmp / "s.aiff", tmp / "s.wav"
        subprocess.run(["say", "-v", "Samantha", "-o", str(aiff), text], check=True)
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", str(aiff), str(wav)], check=True)
        with wave.open(str(wav)) as w:
            a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype("float32") / 32768
        return a.reshape(-1, 1)

    class FakeInputStream:                          # what sounddevice.InputStream would do
        audio = None
        pad = 3000                                  # silence before/after, like a real press

        def __init__(self, samplerate, channels, dtype, callback):
            self.cb = callback

        def start(self):                            # the "mic" delivers audio in 100 ms blocks
            z = np.zeros((self.pad, 1), "float32")
            a = np.concatenate([z, self.audio, z])
            for i in range(0, len(a), 1600):
                self.cb(a[i:i + 1600], None, None, None)

        def stop(self): pass
        def close(self): pass

    voice.sd = SimpleNamespace(InputStream=FakeInputStream)
    pack = K.PACKS["shark"]
    for name in ["hammerhead shark", "whale shark", "tiger shark"]:
        FakeInputStream.audio = speak(name)
        assert voice.start()
        heard = voice.stop_and_transcribe(pack.prompt)
        a, via = pack.match_explain(heard)
        print(f"   said {name!r} -> heard {heard!r} -> {a.name if a else None!r} ({via})")
        want = pack.answers[pack.index[K.normalize(name)]]       # what saying it perfectly gives
        assert a is not None and a.id == want.id, (name, heard)

    FakeInputStream.audio = np.zeros((16000, 1), "float32")        # a silent press
    voice.start()
    assert voice.stop_and_transcribe(pack.prompt) == ""
    FakeInputStream.audio, FakeInputStream.pad = speak("shark")[:2000], 0   # a 0.12 s tap
    voice.start()
    assert voice.stop_and_transcribe(pack.prompt) == ""


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--whisper", action="store_true")
    opts = ap.parse_args()
    tests = [test_key_autorepeat, test_hold_and_answer, test_fumbled_tap_then_real_answer,
             test_wrong_answer_costs_a_heart]
    if opts.whisper:
        tests.append(test_whisper_end_to_end)
    for t in tests:
        t()
        print("ok  ", t.__name__)
    print(f"OK: {len(tests)} push-to-talk tests passed")
