"""Drive host.py --sim --keyboard with bot players; check the game completes."""
import random, subprocess, sys, re, json, pathlib
random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 0)
laptop = pathlib.Path(__file__).parent.parent / "laptop"
packs = {p.stem: json.loads(p.read_text()) for p in (laptop / "packs").glob("*.json")}
proc = subprocess.Popen([sys.executable, "-u", "host.py", "--sim", "--keyboard", "--api", "local",
                         "--fast", "--games", "2", "--turn-seconds", "1.5"],
                        cwd=laptop, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
prompt = None; log = []; wins = 0; outs = 0
def say(s): proc.stdin.write(s + "\n"); proc.stdin.flush()
for line in proc.stdout:
    log.append(line)
    if "TALK=go" in line: say(random.choice(["2", "3", "4"]))
    m = re.search(r"NEW PROMPT: (.*) \(", line)
    if m: prompt = next(p for p in packs.values() if p["prompt"] == m.group(1))
    if "'s turn" in line:
        r = random.random()
        if r < 0.10: pass                                   # stay silent -> timeout
        elif r < 0.25: say("banana bread lasagna")          # nonsense
        else: say(random.choice(prompt["answers"])["name"]) # may repeat -> fail
    if "IS OUT" in line and "│" not in line: outs += 1
    if "START = again" in line: say("/s")
    if "WINS" in line and "***" in line: wins += 1
proc.wait()
text = "".join(log)
assert proc.returncode == 0, text[-2000:]
assert wins == 2, f"wins={wins}"
assert "Traceback" not in text
print(f"OK: 2 games, {outs} eliminations, {text.count(chr(39)+'s turn')} turns, "
      f"{text.count('Already said')} repeats caught, {text.count('TIME')} timeouts")
