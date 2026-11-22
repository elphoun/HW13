// Rep detectors for the four Wipeout moves, fed with AirPod Samples (see airpods.ts). Same logic and default thresholds as the
// exercise lab (slackoff-web/lab/exercises.js), where they can be tuned live. Keep the two in step when you change a threshold.
// Accelerometer-based moves (jacks, high knees, squats) are estimates: the AirPods only feel your head.
import type { Sample } from './airpods';

export interface Detector { update(s: Sample): void; readonly reps: number; }
export type MoveKind = 'jump' | 'duck' | 'run' | 'collect' | 'tilt' | 'circle' | 'toes' | 'rotate';

/** Jumping jacks: bursts of head acceleration (landings). A jack = 2 bounces. Lone bumps don't count (needs a streak of 2). */
const JACKS = { thr: 0.5, gap: 0.3, maxGap: 1.2, streak: 2, perRep: 2 };
/** High knees: up/down wobble of the head, one full swing = 1 step. Needs a streak of 4 steps to start counting. */
const KNEES = { amp: 0.12, tau: 0.5, gap: 0.2, maxGap: 0.9, streak: 4 };
/** Squats: the head drops `dip` metres and comes back within `back` metres. */
const SQUAT = { dip: 0.08, back: 0.03 };
/** Pick the flowers: bend forward past `angle` degrees and straighten up past `back`. No hold. */
const FLOWERS = { angle: 30, back: 15 };

function peaks(P = JACKS): Detector {
  let tn = 0, last = -1e9, streak = 0, bounces = 0, above = false;
  return {
    update(s) {
      tn += s.dt; const hi = s.mag > P.thr;
      if (hi && !above && tn - last >= P.gap) {
        streak = tn - last <= P.maxGap ? streak + 1 : 1; last = tn;
        if (streak === P.streak) bounces += P.streak; else if (streak > P.streak) bounces++;
      }
      if (s.mag < P.thr * 0.6) above = false; else if (hi) above = true;
    },
    get reps() { return Math.floor(bounces / P.perRep); },
  };
}

function oscillation(P = KNEES): Detector {
  let tn = 0, ema = 0, init = false, high = false, last = -1e9, streak = 0, reps = 0;
  return {
    update(s) {
      tn += s.dt; if (!init) { ema = s.up; init = true; }
      ema += (s.up - ema) * (1 - Math.exp(-s.dt / P.tau)); const v = s.up - ema;
      if (!high && v > P.amp) {
        high = true;
        if (tn - last >= P.gap) {
          streak = tn - last <= P.maxGap ? streak + 1 : 1; last = tn;
          if (streak === P.streak) reps += P.streak; else if (streak > P.streak) reps++;
        }
      } else if (high && v < -P.amp) high = false;
    },
    get reps() { return reps; },
  };
}

function squat(P = SQUAT): Detector {
  let down = false, reps = 0;
  return {
    update(s) { if (!down && s.y < -P.dip) down = true; else if (down && s.y > -P.back) { down = false; reps++; } },
    get reps() { return reps; },
  };
}

function flowers(P = FLOWERS): Detector {
  let armed = true, reps = 0;
  return {
    update(s) { if (armed && s.bend > P.angle) { armed = false; reps++; } else if (!armed && s.bend < P.back) armed = true; },
    get reps() { return reps; },
  };
}

const wrapDeg = (a: number) => { a = ((a + 180) % 360 + 360) % 360 - 180; return a; };

/** "One side, then the other" = 1 rep. A side counts after being held past `on` for `hold` s; re-arms inside `off`. */
function pairs(feed: (s: Sample) => number, on: number, off: number, hold: number): Detector {
  let first = 0, reps = 0; const armed: Record<string, boolean> = { '-1': true, '1': true }, held: Record<string, number> = { '-1': 0, '1': 0 };
  return {
    update(s) {
      const v = feed(s);
      for (const side of [-1, 1]) {
        const m = v * side;
        held[side] = m > on ? held[side] + s.dt : 0;
        if (held[side] >= hold && armed[side]) { armed[side] = false; if (first === 0) first = side; else if (first !== side) { reps++; first = 0; } }
        if (m < off) armed[side] = true;
      }
    },
    get reps() { return reps; },
  };
}

/** Neck tilts: ear toward one shoulder, then the other. 15 degrees of roll, held a quarter second. */
const tilts = (): Detector => pairs(s => s.roll, 15, 6, 0.25);

/** Body rotations: turn 30 degrees one way then the other (yaw drifts, so it's measured from a slowly-following baseline). */
function rotations(): Detector {
  let base = 0, rel = 0; const inner = pairs(() => rel, 30, 12, 0.25);
  return { update(s) { const d = wrapDeg(s.yaw - base); base += d * (1 - Math.exp(-s.dt / 60)); rel = d; inner.update(s); }, get reps() { return inner.reps; } };
}

/** Neck circles: roll your head round; every full 340 degrees (either direction) is one circle. */
function circles(): Detector {
  const R = 12, KEEP = 6, TURN = 340 * Math.PI / 180;
  let acc = 0, prev = 0, active = false, reps = 0;
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  return {
    update(s) {
      const x = s.roll, y = -s.pitch, r = Math.hypot(x, y), a = Math.atan2(y, x);
      if (!active) { if (r > R) { active = true; prev = a; acc = 0; } return; }
      if (r < KEEP) { active = false; acc = 0; return; }
      const da = wrap(a - prev); prev = a; if (acc * da < 0) acc = 0; acc += da;
      if (Math.abs(acc) >= TURN) { reps++; acc = 0; }
    },
    get reps() { return reps; },
  };
}

/** Seated toe touches: bend forward past 45 degrees, hold a second, sit back up. */
function toeTouches(): Detector {
  let held = 0, armed = true, reps = 0;
  return {
    update(s) {
      if (s.bend > 45) { if (armed) { held += s.dt; if (held >= 1) { reps++; armed = false; held = 0; } } }
      else { held = 0; if (s.bend < 20) armed = true; }
    },
    get reps() { return reps; },
  };
}

export const makeDetector = (kind: MoveKind): Detector => {
  switch (kind) {
    case 'jump': return peaks();
    case 'duck': return squat();
    case 'run': return oscillation();
    case 'collect': return flowers();
    case 'tilt': return tilts();
    case 'circle': return circles();
    case 'toes': return toeTouches();
    case 'rotate': return rotations();
  }
};
