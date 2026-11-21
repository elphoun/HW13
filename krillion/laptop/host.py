"""
Krillion game host — runs on the laptop, plays the game, drives the Arduino.

  # 1. (optional) run the Krillion API as its own server, e.g. for the /docs page.
  #    If it isn't running, the host just runs the API code itself.
  uvicorn krillion_api:app --port 8000

  # 2a. real hardware, voice answers (hold the talk button while speaking)
  python host.py                 # finds the Arduino automatically
  python host.py --port /dev/cu.usbmodem1101      # or pick it (Windows: COM3)

  # 2b. no hardware yet: fake LCD in the terminal, type answers
  python host.py --sim --keyboard

Keyboard / sim controls: type an answer + Enter on your turn.
  /s = press the START button   /t = press the TALK button   /q = quit
"""

from __future__ import annotations

import argparse
import queue
import sys
import threading
import time
import unicodedata

HEART, EMPTY = "\x01", "\x02"
TURN_SECONDS = 20
TICK_FROM = 5
START_HEARTS = 3
BTN_TALK, BTN_START = 0, 1


def lcd_text(s: str) -> str:
    """Fold to plain ASCII the HD44780 LCD can draw ("Pokémon" -> "Pokemon")."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return s.replace("\n", " ")


# ============================================================ the "body" ====
def find_arduino_port() -> str:
    """Pick the USB serial port an Uno (or clone) is plugged into."""
    from serial.tools import list_ports
    ports = list(list_ports.comports())
    likely = [p for p in ports
              if (p.vid in (0x2341, 0x2A03, 0x1A86, 0x0403, 0x10C4))   # Arduino, CH340, FTDI, CP210x
              or "usbmodem" in p.device or "usbserial" in p.device
              or "Arduino" in (p.description or "")]
    if len(likely) == 1:
        print(f"using Arduino on {likely[0].device}")
        return likely[0].device
    listing = "\n".join(f"  {p.device}  ({p.description})" for p in ports) or "  (none)"
    if not likely:
        sys.exit("No Arduino found. Is it plugged in (with a data USB cable)?\n"
                 f"Serial ports I can see:\n{listing}")
    sys.exit(f"Several possible Arduinos — pick one with --port:\n{listing}")


class SerialBody:
    """The real Arduino, over USB serial."""

    def __init__(self, port: str, events: queue.Queue):
        import serial  # pyserial
        try:
            self.ser = serial.Serial(port, 115200, timeout=0.1)
        except serial.SerialException as e:
            hint = ("\nOn a Mac the port looks like /dev/cu.usbmodem1101 (try: ls /dev/cu.usb*)."
                    if port.upper().startswith("COM") and sys.platform != "win32" else "")
            busy = "\nIf it says busy: close the Arduino IDE's Serial Monitor first." 
            sys.exit(f"Couldn't open {port}: {e}{hint}{busy}")
        self.events = events
        self.acks: queue.Queue = queue.Queue()
        self.ready = threading.Event()
        threading.Thread(target=self._reader, daemon=True).start()
        # Opening the port resets the Uno; wait for its READY.
        if not self.ready.wait(6):
            self.ser.write(b"?\n")
            if not self.ready.wait(3):
                sys.exit("Arduino didn't say READY — is krillion_body.ino uploaded and the port right?")

    def _reader(self):
        buf = b""
        while True:
            buf += self.ser.read(64)
            while b"\n" in buf:
                raw, buf = buf.split(b"\n", 1)
                line = raw.decode(errors="ignore").strip()
                if line == "READY":
                    self.ready.set()
                elif line == "OK" or line.startswith("ERR"):
                    self.acks.put(line)
                elif len(line) == 3 and line[0] == "B":
                    self.events.put(("btn", int(line[1]), line[2] == "D"))

    def send(self, cmd: str, timeout: float = 6.0):
        self.ser.write(cmd.encode("latin-1", "replace")[:98] + b"\n")
        try:
            ack = self.acks.get(timeout=timeout)
            if ack.startswith("ERR"):
                print("arduino:", ack)
        except queue.Empty:
            print(f"arduino: no OK for {cmd!r}")


class SimBody:
    """Prints the LCD/servo/buzzer to the terminal instead."""

    def __init__(self, fast: bool = False):
        self.rows = [" " * 16, " " * 16]
        self.angle = 90
        self.fast = fast

    def _show(self, note: str = ""):
        draw = lambda r: r.replace(HEART, "♥").replace(EMPTY, "♡")
        print(f"  ┌────────────────┐  servo {self.angle:3d}°  {note}")
        print(f"  │{draw(self.rows[0])}│")
        print(f"  │{draw(self.rows[1])}│")
        print("  └────────────────┘")

    def send(self, cmd: str, timeout: float = 0):
        op, arg = cmd[0], cmd[1:]
        if op == "C":
            self.rows = [" " * 16, " " * 16]
        elif op in "01":
            self.rows[int(op)] = arg[:16].ljust(16)
            self._show()
        elif op == "M":
            self.rows[0] = arg[:16].ljust(16)
            self._show(f"(scrolling: {arg})" if len(arg) > 16 else "")
        elif op == "A":
            self.angle = int(arg)
        elif op == "W":
            print("  [servo wiggles]")
        elif op == "S" and arg != "tick":
            print(f"  [buzzer: {arg}]")


# ================================================================= input ====
class Keyboard:
    """Reads stdin lines: answers, or /s /t button presses."""

    def __init__(self, events: queue.Queue):
        self.events = events
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        for line in sys.stdin:
            line = line.strip()
            if line in ("/s", "/t"):
                b = BTN_START if line == "/s" else BTN_TALK
                self.events.put(("btn", b, True))
                self.events.put(("btn", b, False))
            elif line == "/q":
                self.events.put(("quit",))
            elif line:
                self.events.put(("text", line))
        self.events.put(("quit",))


class Voice:
    """Push-to-talk: record while the talk button is held, then Whisper it."""

    RATE = 16000

    def __init__(self, model_name: str):
        import numpy as np
        import sounddevice as sd
        from faster_whisper import WhisperModel
        self.np, self.sd = np, sd
        print(f"loading Whisper '{model_name}' (first run downloads it)...")
        self.model = WhisperModel(model_name, device="cpu", compute_type="int8")
        self.chunks: list = []
        self.stream = None

    def start(self):
        self.chunks = []
        self.stream = self.sd.InputStream(samplerate=self.RATE, channels=1, dtype="float32",
                                          callback=lambda d, *_: self.chunks.append(d.copy()))
        self.stream.start()

    def stop_and_transcribe(self, hint: str) -> str:
        if not self.stream:
            return ""
        self.stream.stop(); self.stream.close(); self.stream = None
        if not self.chunks:
            return ""
        audio = self.np.concatenate(self.chunks)[:, 0]
        if len(audio) < self.RATE * 0.3:        # tap, not speech
            return ""
        # The prompt as initial_prompt nudges Whisper toward the right vocabulary.
        segs, _ = self.model.transcribe(audio, language="en", beam_size=5,
                                        initial_prompt=f"{hint}.")
        return " ".join(s.text for s in segs).strip()


# =================================================================== api ====
class Api:
    def __init__(self, base: str):
        if base != "local":
            import httpx
            self.http = httpx.Client(base_url=base, timeout=10)
            try:
                self.http.get("/packs").raise_for_status()
                print(f"using Krillion API at {base}")
                return
            except httpx.HTTPError:
                print(f"no Krillion API running at {base} — running it inside the host instead")
        from fastapi.testclient import TestClient   # call the API code directly, no server
        from krillion_api import app, PACKS
        self.http = TestClient(app)
        sample = all(p.sample for p in PACKS.values())
        print(f"loaded {len(PACKS)} packs" + (" (samples only — run build_packs.py)" if sample else ""))

    def _get(self, path, **params):
        r = self.http.get(path, params=params); r.raise_for_status(); return r.json()

    def random_prompt(self, exclude):
        return self._get("/prompts/random", exclude=",".join(exclude))

    def judge(self, pack_id, answer, used):
        r = self.http.post("/judge", json={"pack_id": pack_id, "answer": answer, "used": used})
        r.raise_for_status(); return r.json()

    def deep_cut(self, pack_id, used):
        cuts = self._get(f"/packs/{pack_id}/deep_cuts", n=1, exclude=",".join(map(str, used)))
        return cuts[0]["name"] if cuts else None


# ================================================================== game ====
class Game:
    def __init__(self, body, api: Api, events: queue.Queue, voice: Voice | None, args):
        self.body, self.api, self.events, self.voice = body, api, events, voice
        self.args = args
        self.pause_scale = 0 if args.fast else 1

    # ---- helpers
    def pause(self, s):
        time.sleep(s * self.pause_scale)

    def seat(self, p):
        lo, hi = self.args.arc
        return lo if self.n <= 1 else round(lo + (hi - lo) * p / (self.n - 1))

    def hearts_str(self, p):
        return HEART * self.hearts[p] + EMPTY * (START_HEARTS - self.hearts[p])

    def next_event(self, timeout):
        try:
            ev = self.events.get(timeout=timeout)
        except queue.Empty:
            return None
        if ev[0] == "quit":
            raise KeyboardInterrupt
        return ev

    # ---- lobby
    def lobby(self) -> int:
        n = 2
        self.body.send("C")
        self.body.send("A90")
        self.body.send("1START+  TALK=go")
        while True:
            self.body.send(f"0KRILLION  {n} ppl")
            ev = self.next_event(None)
            if ev[0] == "btn" and ev[2]:
                if ev[1] == BTN_START:
                    n = 2 + (n - 1) % 3            # 2 -> 3 -> 4 -> 2
                elif ev[1] == BTN_TALK:
                    return n
            elif ev[0] == "text" and ev[1] in ("2", "3", "4"):
                return int(ev[1])

    # ---- one game
    def play(self, n: int):
        self.n = n
        self.hearts = [START_HEARTS] * n
        self.score = [0] * n
        recent_packs: list[str] = []

        self.body.send("C")
        self.body.send("0Roll call...")
        for p in range(n):
            self.body.send(f"A{self.seat(p)}")
            self.body.send(f"1Player {p + 1}")
            self.body.send("Sturn")

        p = 0
        prompt = None
        while sum(h > 0 for h in self.hearts) > 1:
            if prompt is None:                      # fresh prompt
                prompt = self.api.random_prompt(recent_packs[-5:])
                recent_packs.append(prompt["pack_id"])
                used: list[int] = []
                print(f"\n=== NEW PROMPT: {prompt['prompt']} ({prompt['size']} answers) ===")
                self.body.send("0NEW PROMPT!")
                self.body.send("1" + lcd_text(prompt["prompt"])[:16])
                self.pause(1.5)

            result = self.turn(p, prompt, used)
            if result and result["valid"]:
                used.append(result["answer_id"])
                self.score[p] += result["points"]
                if len(used) >= prompt["size"]:
                    prompt = None                   # someone emptied the ocean
            else:
                prompt = None                       # a miss ends this prompt
            # next alive player
            for _ in range(n):
                p = (p + 1) % n
                if self.hearts[p] > 0:
                    break

        w = next(i for i in range(n) if self.hearts[i] > 0)
        print(f"\n*** PLAYER {w + 1} WINS — scores: {self.score} ***")
        self.body.send(f"A{self.seat(w)}")
        self.body.send(f"0 PLAYER {w + 1} WINS!")
        self.body.send(f"1Score {self.score[w]}")
        self.body.send("Swin")
        self.pause(3)
        self.body.send("1START = again")
        while True:                                 # wait for a press
            ev = self.next_event(None)
            if ev[0] == "btn" and ev[2]:
                return

    # ---- one turn; returns the judge result, or None on timeout
    def turn(self, p, prompt, used):
        b = self.body
        while not self.events.empty():              # drop stale presses / typing
            self.events.get_nowait()
        print(f"\n-- Player {p + 1}'s turn ({prompt['prompt']}) --")
        b.send(f"A{self.seat(p)}")
        b.send("Sturn")
        b.send("M" + lcd_text(prompt["prompt"]))

        deadline = time.monotonic() + self.args.turn_seconds
        last_shown = None
        answer = None
        while answer is None:
            left = deadline - time.monotonic()
            recording = self.voice is not None and self.voice.stream is not None
            if left <= 0 and not (recording and left > -8):   # finish a started answer
                break
            secs = max(int(left) + 1, 0)
            if secs != last_shown and not recording:
                if last_shown is not None and secs <= TICK_FROM:
                    b.send("Stick")
                b.send(f"1P{p + 1} {self.hearts_str(p)}  Sc{self.score[p]:<3} {secs:2d}")
                last_shown = secs
            ev = self.next_event(min(0.1, max(left, 0.01)))
            if not ev:
                continue
            if ev[0] == "text":
                answer = ev[1]
            elif ev[0] == "btn" and ev[1] == BTN_TALK and self.voice:
                if ev[2]:                           # talk pressed: start recording
                    self.voice.start()
                    b.send("1  listening...")
                else:                               # released: transcribe
                    b.send("1  thinking...")
                    answer = self.voice.stop_and_transcribe(prompt["prompt"])
                    print(f"   heard: {answer!r}")
                    if not answer:
                        answer = None
                        last_shown = None           # redraw the timer
                        deadline += 1.0             # small grace for a fumbled press

        if answer is None:
            if self.voice and self.voice.stream:    # time ran out mid-recording
                self.voice.stop_and_transcribe("")
            print("   TIME'S UP")
            b.send("0TIME'S UP!")
            b.send("1")
            self.lose_heart(p, prompt, used)
            return None

        res = self.api.judge(prompt["pack_id"], answer, used)
        print(f"   {res}")
        if res["valid"]:
            b.send("0" + lcd_text(res["name"])[:16])
            b.send(f"1{res['tier_lcd']} +{res['points']}")
            b.send("S" + res["sound"])
            self.pause(2.2)
        else:
            if res["repeat"]:
                b.send("0Already said!")
                b.send("1" + lcd_text(res["name"])[:16])
            else:
                b.send("0Not on the list")
                b.send("1" + lcd_text(f'"{answer}"')[:16])
            self.lose_heart(p, prompt, used)
        return res

    def lose_heart(self, p, prompt, used):
        b = self.body
        b.send("Sbad")
        self.pause(1.2)
        self.hearts[p] -= 1
        cut = self.api.deep_cut(prompt["pack_id"], used)
        if cut:                                     # teach everyone a deep cut
            b.send("0Deep cut:")
            b.send("1" + lcd_text(cut)[:16])
            self.pause(2.0)
        if self.hearts[p] == 0:
            print(f"   PLAYER {p + 1} IS OUT")
            b.send(f"0PLAYER {p + 1} IS OUT")
            b.send("1   x_x  bye!")
            b.send("W")
            b.send("Sout")
        else:
            b.send(f"0P{p + 1} {self.hearts_str(p)}")
            self.pause(1.0)


def main():
    ap = argparse.ArgumentParser(description="Krillion tabletop host")
    ap.add_argument("--port", help="Arduino serial port (default: find it automatically)")
    ap.add_argument("--sim", action="store_true", help="no Arduino: draw the LCD in the terminal")
    ap.add_argument("--keyboard", action="store_true", help="type answers instead of speaking")
    ap.add_argument("--api", default="http://localhost:8000",
                    help="Krillion API URL, or 'local' to run it in-process")
    ap.add_argument("--model", default="base.en", help="Whisper model: tiny.en base.en small.en")
    ap.add_argument("--turn-seconds", type=float, default=TURN_SECONDS)
    ap.add_argument("--arc", type=int, nargs=2, default=[15, 165], metavar=("MIN", "MAX"),
                    help="servo angles for the first and last seat")
    ap.add_argument("--fast", action="store_true", help="skip pauses (testing)")
    ap.add_argument("--games", type=int, default=0, help="stop after N games (0 = forever)")
    args = ap.parse_args()

    if not args.sim and not args.port:
        args.port = find_arduino_port()

    events: queue.Queue = queue.Queue()
    body = SimBody(args.fast) if args.sim else SerialBody(args.port, events)
    voice = None
    if args.keyboard or args.sim:
        Keyboard(events)                            # typing always works in sim
    if not args.keyboard:
        voice = Voice(args.model)
    api = Api(args.api)
    game = Game(body, api, events, voice, args)

    played = 0
    try:
        while True:
            game.play(game.lobby())
            played += 1
            if args.games and played >= args.games:
                break
    except KeyboardInterrupt:
        pass
    body.send("C")
    body.send("0  ~ KRILLION ~")
    body.send("1  host stopped")


if __name__ == "__main__":
    main()
    