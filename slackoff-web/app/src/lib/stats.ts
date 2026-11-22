import type { PersistedData } from '../types';
import { addDays, dayKey, startOfDay, startOfWeek } from './dates';

export function computeStats(d: PersistedData, now = Date.now()) {
  const { completions } = d;
  const perDay = new Map<string, number>();
  let totalPoints = 0, totalSeconds = 0;
  for (const c of completions) {
    const k = dayKey(c.ts);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
    totalPoints += c.points; totalSeconds += c.seconds;
  }
  const today0 = startOfDay(now);
  const today = perDay.get(dayKey(today0)) ?? 0;

  // Streak: consecutive active days ending today (or yesterday, so the streak survives until you've had a chance to move today).
  let streak = 0, cursor = today0;
  if (!today) cursor = addDays(cursor, -1);
  while (perDay.get(dayKey(cursor))) { streak++; cursor = addDays(cursor, -1); }

  const week0 = startOfWeek(now), lastWeek0 = addDays(week0, -7);
  const thisWeek = Array.from({ length: 7 }, (_, i) => perDay.get(dayKey(addDays(week0, i))) ?? 0);
  const lastWeek = Array.from({ length: 7 }, (_, i) => perDay.get(dayKey(addDays(lastWeek0, i))) ?? 0);

  const weekStart = Math.max(week0, d.leaderboard.resetAt);
  const weeklyPoints = completions.filter(c => c.ts >= weekStart).reduce((s, c) => s + c.points, 0);

  return {
    totalActivities: completions.length, totalBreaks: d.breaks.length, totalSeconds, totalPoints,
    streak, today, thisWeek, lastWeek, weeklyPoints, week0,
    thisWeekTotal: thisWeek.reduce((a, b) => a + b, 0), lastWeekTotal: lastWeek.reduce((a, b) => a + b, 0),
  };
}
export type Stats = ReturnType<typeof computeStats>;
