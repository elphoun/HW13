# Slackoff web

Two things live here:

| Folder | What it is |
| --- | --- |
| `app/` | **The SlackOff web app** (React + TypeScript + Vite): work/exercise timer, stats sidebar, leaderboard, notifications, settings, and the Wipeout game. |
| `game/`, `bridge/` | The original AirPod hover-racer prototype and its Node bridge (see "AirPod Wipeout" below). Untouched. |

## SlackOff app

    cd slackoff-web/app
    npm install
    npm run dev          # http://localhost:5173
    npm run build        # type-check + production build

- **Home**: sidebar (profile, stats, daily-goal ring, this-week-vs-last-week chart, weekly leaderboard, achievements), day tracker, timer, exercise breaks, intensity/activity picker. Use the **Demo (30s / 15s)** preset to see the whole loop quickly.
- **Wipeout**: pick a map (Forest for now; `src/data/maps.ts` is the registry) and difficulty. Do the real move, then press **Space** / tap once per rep before the obstacle arrives: jumping jacks jump boulders, squats duck branches, high knees sprint over ponds, picking flowers collects them. Every cleared obstacle is added to your SlackOff stats.
- **Notifications**: Notification API through a service worker (`public/sw.js`), asked for when you first press Start. They fire from a Web Worker clock, so they still arrive in background tabs. Notifications while the site is fully closed need a push server (VAPID keys); `sw.js` already has the `push` handler, but nothing sends pushes yet.
- **Persistence**: localStorage, all behind `src/lib/storage.ts`. `supabase/schema.sql` has the matching tables; it is not wired up yet.
- The leaderboard rivals are mock data that reset every Monday (or with "Reset week").
- Reps in Wipeout are self-reported (no camera or sensor detection yet); the 0.2 s minimum gap between presses just stops key-mashing.

## AirPod Wipeout (original prototype)

Run from the repo root. The AirPod streamer lives in `slackoff-airpod/`.

1. Terminal 1: `cd slackoff-airpod && swift run HeadMotionStreamer` (AirPod connected; Automatic Ear Detection off to hold it in your hand).
   Add `--stem` to make AirPod stem presses jump (it takes over media controls while running).
2. Terminal 2: `cd slackoff-web && node bridge/server.js`, then open http://localhost:8080
3. Press Enter, follow the 5 calibration steps (hold still, lean left, right, forward, back), press Enter to race.

Controls: lean left/right = steer, lean forward = move forward, lean back = move backward (level = stopped).
Jump over the low orange barriers (tall purple walls still need to be steered around). Three ways to jump:
- **Space** on the keyboard
- **AirPod stem press**, when the streamer runs with `--stem` (play/pause/next/previous all count)
- **Physical lift**: raise the AirPod quickly by about 10 cm. On by default; turn it off in the debug menu.

Keyboard fallback: A/D or arrows to steer, W/S or up/down to move, Space to jump.
Tuning keys: F flip left/right, G flip forward/back, `,` `.` sensitivity, C recenter neutral, R recalibrate.

Dead zone: near neutral the stick reads exactly 0 and the craft stops. The radius is the larger of the
dead-zone setting (default 0.20 of your calibrated lean) and 3x the hand jitter measured during the "hold still" step.

Debug menu: press `` ` `` to toggle. It has a dead-zone and a sensitivity slider, a recenter button, and a **Joystick view**
that plots the AirPod's live tilt in calibrated space: the dead-zone circle (magenta), the jitter ring (yellow, dotted),
the four calibrated L/R/F/B poses, the full-lean box, a short trail, and raw/output/tilt-angle readouts.

**X/Y motion tracking** (used for the physical jump): the AirPod's user acceleration is split, using the gravity
vector, into world-up (Y) and sideways (X, along your calibrated left/right lean). Each axis has its sensor bias removed
and is integrated twice. A 1 s leak pulls position and velocity back to 0, so the values are relative displacements
over a short window, not absolute positions. Because of the leak, a quick 10 cm lift reads about 7 cm. A jump fires when Y
passes **Lift needed** (default 6 cm) while still rising. The debug menu shows a live 5-second plot of X (blue) and Y (green) with the
threshold (yellow dashed) and the jumps that fired (magenta). Use **Record X/Y** to save a CSV
(`t,ax,ay,vx,vy,x,y,jump`) for tuning. If lifting makes Y go negative, tick **invert**.
