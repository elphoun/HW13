# Krillion (tabletop edition)

A physical, pass-around take on the rare-answer trivia game [Krillion](https://krillion.io). This is an unofficial fan project and isn't connected to krillion.io.

A prompt like **"Name a sea creature"** goes around the table. A servo pointer swings to whoever's turn it is, and they hold the talk button and **say an answer out loud**. The laptop transcribes it with Whisper and checks it against a big answer list.

- **Answers are short.** Most are 1–3 words. The transcript is checked against the word bank by exact spelling, then close spelling, then close *sound*, so "Gross" still counts for *Grus*. See [How answers are checked](#how-answers-are-checked).
- **Rarer answers score more**, from *Shallows* (+1) down to *One in a Krillion* (+10).
- **Missing costs a heart.** A miss is a made-up answer, a repeat or running out of time. The buzzer sounds, the LCD reveals a deep cut you could have said, and a new prompt starts.
- **0 hearts means you're out.** The pointer shakes at you and the buzzer wails. The last player standing wins.

```
 ┌───────── laptop ─────────┐          USB serial           ┌──── Arduino Uno ────┐
 │ krillion_api.py  (prompts,│                               │ krillion_body.ino   │
 │   answers, rarity, judge) │◄─ HTTP ─┐                     │  LCD 16x2           │
 │ host.py (game, Whisper,   │─────────┴── "A120" "Skrill" ─►│  servo pointer      │
 │   push-to-talk recording) │◄──────────── "B0D" "B0U" ─────│  passive buzzer     │
 │ packs/*.json (Wikidata)   │                               │  talk + start btns  │
 └───────────────────────────┘                               └─────────────────────┘
```

No questions or answers are hardcoded. They come from **Wikidata** via `build_packs.py`, and rarity is how many language Wikipedias have an article on the answer: fewer articles means rarer. Add any prompt you like to `prompts.json`.

## Parts (all from the ELEGOO Uno R3 starter kit)

- **Uno R3** and USB cable
- **LCD1602** and the **10k potentiometer** (screen contrast)
- **Servo SG90**: tape a paper krill or arrow to the horn
- **Passive buzzer**: the one **without** a sticker, with an open green board underneath. The sealed one with a sticker is the active buzzer, and it can't play the tunes.
- **2 × buttons**: TALK (hold while speaking) and START (lobby / restart)
- **1 × 220 Ω resistor** (LCD backlight), breadboard, jumpers

## Wiring

| From | To |
|---|---|
| LCD 1 VSS / 16 K | GND |
| LCD 2 VDD | 5V |
| LCD 3 V0 | Pot middle pin (pot outer pins → 5V and GND) |
| LCD 4 RS | D12 |
| LCD 5 RW | GND |
| LCD 6 E | D11 |
| LCD 11 / 12 / 13 / 14 (D4–D7) | D5 / D4 / D3 / D2 |
| LCD 15 A | 5V through 220 Ω |
| Servo orange / red / brown | D9 / 5V / GND |
| Passive buzzer + / − | D8 / GND |
| TALK button | D10 |
| START button | D9 |

If the LCD shows nothing or a row of solid blocks, turn the pot. If the board resets when the servo swings, power the servo from the kit's breadboard power module instead of the Uno's 5V, and keep the grounds connected.

## Setup

**1. Arduino:** open `firmware/krillion_body/krillion_body.ino` in the Arduino IDE and upload it. LiquidCrystal and Servo are built in, so there's nothing to install. The LCD should show `waiting for host`.

**2. Laptop** (Python 3.10+):

```bash
cd laptop
pip install -r requirements.txt
python build_packs.py                  # fetch prompt packs from Wikidata (~1 min)
uvicorn krillion_api:app --port 8000   # leave this running
```

Open http://localhost:8000/docs to try the API by hand. For example, `POST /judge` with `{"pack_id": "shark", "answer": "um, a goblin shark"}`.

**3. Play** (in a second terminal):

```bash
python host.py --port COM3                    # Windows (Device Manager → Ports)
python host.py --port /dev/cu.usbmodem1101    # Mac (ls /dev/cu.usb*)
```

The first run downloads the Whisper model (~150 MB). In the lobby, press START to cycle 2/3/4 players, then press TALK to begin. On your turn, **hold TALK, say your answer, and let go**.

### No hardware yet?

```bash
python host.py --sim --keyboard --api local
```

This draws the LCD in your terminal, and you type the answers. `/s` and `/t` press the START and TALK buttons. `--api local` runs the API in-process, so you don't need uvicorn. It uses the two hand-made sample packs until you run `build_packs.py`.

### Laptop push-to-talk (no TALK button needed)

```bash
python host.py --sim                       # hold SPACE, say your answer, let go
python host.py --sim --ptt-key alt_r       # pick another key (space, alt_r, ctrl_r, shift_r, f9, one letter)
python host.py --port /dev/cu.usbmodem1101 --ptt-key space   # add the key alongside the real button
```

Holding the key is the same as holding TALK: it records, and letting go sends the audio to Whisper. A tap shorter than 0.3 s or a silent press is ignored, so a fumble doesn't cost a heart. The listener is global, so it hears the key whichever window has focus. On macOS, allow your terminal under **System Settings → Privacy & Security → Input Monitoring** (the key) and **Microphone** (the recording). Add `--keyboard` to type answers instead of speaking.

## How answers are checked

`Pack.match_explain` in `krillion_api.py` takes the Whisper transcript and looks for a word-bank answer, trying these in order:

1. **Exact.** Case, punctuation, "the/a" and filler ("um, I think it's a...") are ignored. Plurals and "blob fish" / "blobfish" are the same. A name that ends in the pack's common word also answers without it, so "Roquefort" works for *Roquefort cheese*.
2. **Close spelling.** For one-letter slips, such as "narwal" for *narwhal*.
3. **Close sound.** Whisper often writes what it heard, not what was meant ("Kydness" for *Kydnos*), so each name gets a rough phonetic key and the keys are compared. This is deliberately strict: the first sound must match, keys under 4 characters are never matched, and a key under 8 characters has to be nearly identical, so made-up words don't sneak in.

The close-spelling and close-sound steps only look at up to 3 words (`SPOKEN_MAX_WORDS`). Exact matching still finds an answer inside a longer sentence. `/judge` reports which step matched in its `via` field.

On 132 spoken answers from the built packs (macOS speech, `base.en`), the sound step moved correct judgements from 80 to 96. It accepted no more nonsense phrases than before.

## Tuning

| What | Where |
|---|---|
| Turn length (default 20 s) | `host.py --turn-seconds 25` |
| Servo seat angles | `host.py --arc 20 160` |
| Better recognition, slower | `host.py --model small.en` |
| Tier cut-offs and points | `TIERS` in `krillion_api.py` |
| How forgiving spelling slips are | `FUZZY_MIN_SCORE` in `krillion_api.py` |
| How forgiving sound-alikes are | `SOUND_MIN_SCORE`, `SOUND_LONG_SCORE`, `SOUND_MIN_LEN` in `krillion_api.py` |
| Push-to-talk key | `host.py --ptt-key f9` |
| New prompts | Add an entry to `prompts.json`, then `python build_packs.py <id>` |

To write a new prompt, find a Wikidata class for it. For example, "Name a bird of prey" would be `?item wdt:P31 wd:Q...`. You can test the query at https://query.wikidata.org first.

## Tests

```bash
python tests/test_judge.py    # spoken answers vs the word bank (real Whisper transcripts)
python tests/test_ptt.py      # push-to-talk key + turn loop, no mic needed
python tests/test_ptt.py --whisper   # + fake mic -> Whisper -> word bank (macOS: uses `say`)
python tests/play_sim.py      # bots play two full games against the simulated LCD
cd tests && g++ -std=c++17 -Ifwmock fw_test.cpp -o fw_test && ./fw_test   # firmware protocol
```
