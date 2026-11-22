// Rep detectors for the four Wipeout moves, fed with AirPod Samples (see airpods.ts). Same logic and default thresholds as the
// exercise lab (slackoff-web/lab/exercises.js), where they can be tuned live. Keep the two in step when you change a threshold.
// Accelerometer-based moves (jacks, high knees, squats) are estimates: the AirPods only feel your head.
import type { Sample } from './airpods';

export interface Detector { update(s: Sample): void; readonly reps: number; }
export type MoveKind = 'jump' | 'duck' | 'run' | 'collect';

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

export const makeDetector = (kind: MoveKind): Detector =>
  kind === 'jump' ? peaks() : kind === 'duck' ? squat() : kind === 'run' ? oscillation() : flowers();
