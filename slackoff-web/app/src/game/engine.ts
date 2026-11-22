// Wipeout game logic. No DOM here: the component feeds it dt and rep presses, the renderer reads its state.
//
// A run is a course of challenges. Each challenge puts one obstacle on the path that creeps toward the player.
// Do the real-life move (jumping jacks, squats, high knees, picking flowers) and press once per rep before it arrives:
// finish in time and the character clears it; run out of time and it wipes out (lose a heart).

import type { ActivityMode } from '../types';

// jump/duck/run/collect are the ACTIVITIES; tilt/circle/toes/rotate are the STRETCHES.
export type Kind = 'jump' | 'duck' | 'run' | 'collect' | 'tilt' | 'circle' | 'toes' | 'rotate';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface ChallengeDef { kind: Kind; exerciseId: string; title: string; move: string; unit: string; obstacle: string; secPerRep: number; reps: Record<Difficulty, number>; }

export const CHALLENGE_DEFS: Record<Kind, ChallengeDef> = {
  jump: { kind: 'jump', exerciseId: 'jumping-jacks', title: 'Jump past the boulder!', move: 'jumping jacks', unit: 'jumping jacks', obstacle: 'boulder', secPerRep: 1.9, reps: { easy: 3, normal: 5, hard: 8 } },
  duck: { kind: 'duck', exerciseId: 'squats', title: 'Duck under the branch!', move: 'squats', unit: 'squats', obstacle: 'branch', secPerRep: 2.3, reps: { easy: 3, normal: 5, hard: 8 } },
  run: { kind: 'run', exerciseId: 'high-knees', title: 'Sprint over the pond!', move: 'high knees', unit: 'high knees', obstacle: 'pond', secPerRep: 0.95, reps: { easy: 8, normal: 12, hard: 20 } },
  collect: { kind: 'collect', exerciseId: 'pick-the-flowers', title: 'Pick the flowers!', move: 'flower picks', unit: 'flowers', obstacle: 'flowers', secPerRep: 2.1, reps: { easy: 3, normal: 5, hard: 8 } },
  tilt: { kind: 'tilt', exerciseId: 'neck-tilts', title: 'Sway under the vines!', move: 'neck tilts', unit: 'neck tilts', obstacle: 'vines', secPerRep: 3.2, reps: { easy: 2, normal: 4, hard: 6 } },
  circle: { kind: 'circle', exerciseId: 'neck-circles', title: 'Roll the bubbles away!', move: 'neck circles', unit: 'neck circles', obstacle: 'bubbles', secPerRep: 4.2, reps: { easy: 2, normal: 3, hard: 5 } },
  toes: { kind: 'toes', exerciseId: 'seated-toe-touches', title: 'Touch the stepping stones!', move: 'toe touches', unit: 'toe touches', obstacle: 'stones', secPerRep: 3.2, reps: { easy: 3, normal: 5, hard: 8 } },
  rotate: { kind: 'rotate', exerciseId: 'body-rotations', title: 'Twist the gate open!', move: 'body rotations', unit: 'body twists', obstacle: 'gate', secPerRep: 3.2, reps: { easy: 3, normal: 5, hard: 8 } },
};

export const ACTIVITY_KINDS: Kind[] = ['jump', 'duck', 'run', 'collect'];
export const STRETCH_KINDS: Kind[] = ['tilt', 'circle', 'toes', 'rotate'];
export const ALL_KINDS = Object.keys(CHALLENGE_DEFS) as Kind[];
/** Wipeout challenges for the chosen mode (stretches / activities / both) that the user hasn't switched off (never empty). */
export const enabledKinds = (disabled: string[], mode: ActivityMode = 'both'): Kind[] => {
  const pool = mode === 'stretches' ? STRETCH_KINDS : mode === 'activities' ? ACTIVITY_KINDS : ALL_KINDS;
  const k = pool.filter(x => !disabled.includes(CHALLENGE_DEFS[x].exerciseId));
  return k.length ? k : pool;
};
export const DIFFICULTY_BY_LEVEL: Record<1 | 2 | 3, Difficulty> = { 1: 'easy', 2: 'normal', 3: 'hard' };

export const W = 960, H = 540, GROUND = 430, PLAYER_X = 230, HIT_X = PLAYER_X + 55, START_X = W + 120;
export const COURSE_LENGTH = 8, LIVES = 3;
export const MIN_REP_GAP = 0.2;      // seconds; stops key-mashing from counting as exercise

export type Mode = 'approach' | 'resolve' | 'hit' | 'recover' | 'done';
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; text?: string; color: string; size: number; }
export interface Result { exerciseId: string; kind: Kind; reps: number; success: boolean; points: number; }
export type GameEvent = 'start' | 'rep' | 'success' | 'hit' | 'win' | 'lose' | 'next';

export interface Challenge { def: ChallengeDef; reps: number; budget: number; }

export class Game {
  challenges: Challenge[] = [];
  idx = 0; reps = 0; t = 0; budget = 1;
  mode: Mode = 'approach'; modeT = 0;
  obstacleX = START_X; obstacleFromX = START_X; resolveTargetX = 0;
  lives = LIVES; score = 0; combo = 0; bestCombo = 0;
  scroll = 0; scrollSpeed = 60;
  results: Result[] = [];
  particles: Particle[] = [];
  pulse = 0;                 // 0..1, bumps on every rep for the character's little "I'm doing it" motion
  lastRepAt = -10; clock = 0;
  finished: null | 'win' | 'lose' = null;
  shake = 0;
  onEvent: (e: GameEvent, data?: unknown) => void = () => {};

  constructor(public difficulty: Difficulty, rnd: () => number = Math.random, kinds: Kind[] = ALL_KINDS) {
    let prev: Kind | null = null;
    for (let i = 0; i < COURSE_LENGTH; i++) {
      let k: Kind; do { k = kinds[Math.floor(rnd() * kinds.length)]; } while (k === prev && kinds.length > 1);
      prev = k;
      const def = CHALLENGE_DEFS[k], reps = def.reps[difficulty];
      this.challenges.push({ def, reps, budget: Math.round((reps * def.secPerRep + 4) * 10) / 10 });
    }
    this.beginChallenge();
  }

  get current(): Challenge { return this.challenges[Math.min(this.idx, this.challenges.length - 1)]; }
  get timeLeft() { return Math.max(0, this.budget - this.t); }
  get kind(): Kind { return this.current.def.kind; }

  private beginChallenge() {
    const c = this.current;
    this.reps = 0; this.t = 0; this.budget = c.budget; this.mode = 'approach'; this.modeT = 0;
    this.obstacleX = this.obstacleFromX = START_X;
    this.onEvent('next');
  }

  /** One real-world rep happened. Returns true if it counted. `fromSensor` skips the anti-mash gap: AirPod reps are real. */
  rep(fromSensor = false): boolean {
    if (this.mode !== 'approach' || this.finished) return false;
    if (!fromSensor && this.clock - this.lastRepAt < MIN_REP_GAP) return false;
    this.lastRepAt = this.clock;
    this.reps++; this.pulse = 1;
    this.burst(PLAYER_X, GROUND - 130, '+1', '#fff176', 1);
    this.onEvent('rep', this.reps);
    if (this.reps >= this.current.reps) this.succeed();
    return true;
  }

  private succeed() {
    const c = this.current;
    this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
    const speedBonus = Math.round(60 * (this.timeLeft / this.budget)), comboBonus = 25 * (this.combo - 1);
    const pts = 100 + speedBonus + comboBonus;
    this.score += pts;
    this.results.push({ exerciseId: c.def.exerciseId, kind: c.def.kind, reps: c.reps, success: true, points: pts });
    this.mode = 'resolve'; this.modeT = 0; this.obstacleFromX = this.obstacleX;
    this.resolveTargetX = 2 * PLAYER_X - this.obstacleX;     // passes the player at the midpoint of the dash
    this.burst(PLAYER_X + 20, GROUND - 90, `+${pts}`, '#7CFC9A', 1.4);
    for (let i = 0; i < 14; i++) this.sparkle(PLAYER_X, GROUND - 80);
    this.onEvent('success', { points: pts, combo: this.combo, challenge: c });
  }

  private fail() {
    const c = this.current;
    this.lives--; this.combo = 0; this.shake = 0.5;
    this.results.push({ exerciseId: c.def.exerciseId, kind: c.def.kind, reps: this.reps, success: false, points: 0 });
    this.mode = 'hit'; this.modeT = 0;
    this.burst(PLAYER_X, GROUND - 140, 'WIPEOUT!', '#ff6b6b', 1.5);
    this.onEvent('hit');
  }

  private nextOrFinish() {
    if (this.lives <= 0) { this.finished = 'lose'; this.mode = 'done'; this.onEvent('lose'); return; }
    this.idx++;
    if (this.idx >= this.challenges.length) { this.idx = this.challenges.length - 1; this.finished = 'win'; this.mode = 'done'; this.score += 200 + this.lives * 50; this.onEvent('win'); return; }
    this.mode = 'recover'; this.modeT = 0; this.obstacleX = -300;
  }

  update(dt: number) {
    this.clock += dt;
    this.pulse = Math.max(0, this.pulse - dt * 4);
    this.shake = Math.max(0, this.shake - dt);
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.text ? 0 : 500) * dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    if (this.finished && this.mode === 'done') { this.scrollSpeed = 40; this.scroll += this.scrollSpeed * dt; return; }

    this.modeT += dt;
    switch (this.mode) {
      case 'approach': {
        this.t += dt;
        const v = (START_X - HIT_X) / this.budget;
        this.obstacleX -= v * dt; this.scrollSpeed = v;
        if (this.obstacleX <= HIT_X) { this.obstacleX = HIT_X; this.fail(); }
        break;
      }
      case 'resolve': {
        const D = 1.25, u = Math.min(1, this.modeT / D);
        this.obstacleX = this.obstacleFromX + (this.resolveTargetX - this.obstacleFromX) * u;
        this.scrollSpeed = Math.abs(this.resolveTargetX - this.obstacleFromX) / D;
        if (u >= 1) this.nextOrFinish();
        break;
      }
      case 'hit': {
        this.obstacleX -= 260 * dt; this.scrollSpeed = 40;
        if (this.modeT > 1.4) this.nextOrFinish();
        break;
      }
      case 'recover': {
        this.scrollSpeed = 220 * Math.max(0.25, 1 - this.modeT / 0.9);
        if (this.modeT > 0.9) this.beginChallenge();
        break;
      }
    }
    this.scroll += this.scrollSpeed * dt;
  }

  /** 0..1 progress through the dash (resolve) for pose/animation. */
  get resolveU() { return this.mode === 'resolve' ? Math.min(1, this.modeT / 1.25) : 0; }

  burst(x: number, y: number, text: string, color: string, size: number) { this.particles.push({ x, y, vx: 0, vy: -60, life: 0.9, max: 0.9, text, color, size }); }
  sparkle(x: number, y: number) {
    const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 220;
    this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 0.7, max: 0.7, color: ['#ffd23f', '#ff8fa3', '#8fe3ff', '#9bff9b'][Math.floor(Math.random() * 4)], size: 5 });
  }

  completedCount() { return this.results.filter(r => r.success).length; }
}
