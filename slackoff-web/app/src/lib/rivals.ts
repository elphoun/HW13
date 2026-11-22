import { startOfWeek } from './dates';

export interface Rival { name: string; avatar: string; points: number; }
const ROSTER: [string, string][] = [
  ['Bea Bouncer', 'sunny'], ['Rocky Roll', 'minty'], ['Pip Squat', 'bluey'], ['Mo Mentum', 'grape'],
  ['Zig Zag', 'sunny'], ['Lola Lunge', 'pinky'], ['Hop Along', 'minty'], ['Dee Stretch', 'bluey'],
];

const mulberry32 = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Mock competitors. Scores are deterministic per week (and per manual reset), so a new week = a fresh leaderboard. */
export function weeklyRivals(now: number, resets: number): Rival[] {
  const rnd = mulberry32(Math.floor(startOfWeek(now) / 86_400_000) * 31 + resets * 977);
  const progress = Math.min(1, ((now - startOfWeek(now)) / 86_400_000 + 1) / 7);   // rivals "earn" through the week
  return ROSTER.map(([name, avatar]) => ({ name, avatar, points: Math.round((40 + rnd() * 260) * progress / 10) * 10 }));
}
export const nextResetMs = (now: number) => startOfWeek(now) + 7 * 86_400_000;
