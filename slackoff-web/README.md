# Slackoff web (AirPod Wipeout game)

Run from the repo root. The AirPod streamer lives in `slackoff-airpod/`.

1. Terminal 1: `cd slackoff-airpod && swift run HeadMotionStreamer` (AirPods in your ears).
   Add `--stem` to make AirPod stem presses jump (it takes over media controls while running).
2. Terminal 2: `cd slackoff-web && node bridge/server.js`, then open http://localhost:8080
3. Look straight ahead and press Enter to race. There is no calibration: your head pose at the moment a run starts
   becomes neutral, and everything is measured relative to it.

Controls: tilt head left/right (ear toward shoulder) = steer, nod forward = move forward, tilt head back = move backward
(neutral = stopped). About 25° of tilt is full stick.
Jump over the low orange barriers (tall purple walls still need to be steered around). Three ways to jump:
- **Space** on the keyboard
- **AirPod stem press**, when the streamer runs with `--stem` (play/pause/next/previous all count)
- **Physical hop**: move your head up quickly by about 10 cm (a small hop). On by default; turn it off in the debug menu.

Keyboard fallback: A/D or arrows to steer, W/S or up/down to move, Space to jump.
Tuning keys: F flip left/right, G flip forward/back, `,` `.` sensitivity, C re-zero neutral to your current pose mid-run.

Dead zone: within 20% of full tilt (about 5°) of neutral the stick reads exactly 0 and the craft stops.

Debug menu: press `` ` `` to toggle. It has a dead-zone and a sensitivity slider, a re-zero button, and a **Joystick view**
that plots your live head tilt relative to neutral: the dead-zone circle (magenta), the full-tilt box, a short trail,
and the current direction and tilt angle.

**X/Y motion tracking** (used for the physical jump): the AirPod's user acceleration is split, using the gravity
vector, into world-up (Y) and sideways (X). Each axis has its sensor bias removed
and is integrated twice. A 1 s leak pulls position and velocity back to 0, so the values are relative displacements
over a short window, not absolute positions. Because of the leak, a quick 10 cm lift reads about 7 cm. A jump fires when Y
passes **Lift needed** (default 6 cm) while still rising. The debug menu shows a live 5-second plot of X (blue) and Y (green) with the
threshold (yellow dashed) and the jumps that fired (magenta). Use **Record X/Y** to save a CSV
(`t,ax,ay,vx,vy,x,y,jump`) for tuning. If lifting makes Y go negative, tick **invert**.
