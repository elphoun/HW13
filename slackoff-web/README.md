# Slackoff web

Two things live here:

| Folder | What it is |
| --- | --- |
| `app/` | **The SlackOff web app** (React + TypeScript + Vite): focus timer, today's stats, weekly leaderboard, notifications, settings, and story-based exercise breaks. |
| `lab/`, `bridge/` | The **exercise lab**: a testing page for the AirPod stretch and activity detectors, and the Node bridge that serves it (see "Exercise lab" below). |

## SlackOff app

    cd slackoff-web/app
    npm install
    npm run dev          # http://localhost:5173
    npm run build        # type-check + production build

- **Home**: today's stats and the weekly leaderboard on the left, upcoming breaks along the top bar, and the focus timer. **Begin activity** / **Begin stretch** start a break right away; the line above the clock starts and pauses the focus timer. Timer length, presets (incl. **Demo 30s / 15s**), intensity and the break story live in **Settings** (the gear).
- **Breaks are stories**: a break plays through a story one scene at a time. Each scene has a picture, a story line ("Jump on the red balls") and one exercise. The story is the same for activity and stretch breaks; only the exercise changes ("Jump 5 times" vs "Stretch to the sky 5 times"). Press **Space** or **Done one** per rep; the next scene appears once you've done them all. A break that starts when the timer runs out asks activity or stretch first. Intensity scales the reps (level 1 fewer, level 3 more).
- **Adventures** (flag in the left rail): play any story outside a break. Stories live in `src/data/stories.ts`. Scene pictures go in `src/assets/stories/<story id>/1.png`, `2.png`, ... (png, jpg, webp or svg) and are picked up automatically; scenes without a picture show a sky backdrop.
- **Notifications**: Notification API through a service worker (`public/sw.js`), asked for when you first press Start. They fire from a Web Worker clock, so they still arrive in background tabs. Notifications while the site is fully closed need a push server (VAPID keys); `sw.js` already has the `push` handler, but nothing sends pushes yet.
- **Persistence**: localStorage, all behind `src/lib/storage.ts`. `supabase/schema.sql` has the matching tables; it is not wired up yet.
- The leaderboard rivals are mock data that reset every Monday (or with "Reset week").
- Reps are self-reported (no camera or sensor detection yet); the 0.2 s minimum gap between presses just stops key-mashing.

## Exercise lab (AirPod testing page)

The old AirPod hover-racer game was removed (it is in git history). `lab/` is now a place to test exercise detection.

1. Terminal 1: `cd slackoff-airpod && swift run HeadMotionStreamer` (AirPods in your ears).
2. Terminal 2: `cd slackoff-web && node bridge/server.js`, then open http://localhost:8080
3. Pick an exercise on the left. After a 1.5 s "hold still" your current pose becomes neutral (no calibration), then do it.

- **Stretches** (measured by head angle, accurate): neck tilts, body rotations, touch your toes (sitting), neck circles.
- **Activities** (measured by head acceleration, approximate): jumping jacks, 1-leg hop (same head bounce), high knees (up/down wobble), squats,
  touch your toes (standing), pick the flowers. The AirPods only feel your head, so they can't see arms or legs and
  can't tell which leg you hopped on.
- The page shows the rep count, six live charts (roll, pitch, yaw, forward bend, acceleration, up/down) and the
  thresholds as yellow dashed lines. Every threshold has a slider and is saved in your browser.
- `C` or **Zero pose** re-zeroes neutral to your current pose. **flip up/down** inverts the vertical axis if squats read backwards.
- Code: `lab/sensor.js` (packets -> samples), `lab/exercises.js` (detectors + default thresholds), `lab/lab.js` (page).
