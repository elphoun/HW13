import type { PersistedData } from '../types';
import { DAY_MS, addDays, dayKey, startOfDay, startOfWeek } from './dates';

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

/** Averages for the Today panel. Daily numbers cover the last 30 days (fewer if you started recently, so new users aren't diluted). */
export function computeAverages(d: PersistedData, now = Date.now()) {
  const today0 = startOfDay(now);
  const firsts = [...d.completions.map(c => c.ts), ...d.breaks, ...d.sessions.map(s => s.ts)];
  const first = firsts.length ? Math.min(...firsts) : now;
  const days = Math.max(1, Math.min(30, Math.round((today0 - startOfDay(first)) / DAY_MS) + 1));
  const since = addDays(today0, -(days - 1));
  const acts = d.completions.filter(c => c.ts >= since);
  const seconds = acts.reduce((sum, c) => sum + c.seconds, 0);
  const breaks = d.breaks.filter(b => b >= since).length;
  const focus = d.sessions.filter(s => s.kind === 'work' && s.completed && s.ts >= since).length;

  const monthStart = (t: number) => { const m = new Date(t); m.setHours(0, 0, 0, 0); m.setDate(1); return m.getTime(); };
  const thisMonth = d.completions.filter(c => c.ts >= monthStart(now)).length;
  const fm = new Date(first), nm = new Date(now);
  const months = Math.max(1, (nm.getFullYear() - fm.getFullYear()) * 12 + nm.getMonth() - fm.getMonth() + 1);
  return {
    days, thisMonth, months,
    dailyActivities: acts.length / days, dailyMinutes: seconds / 60 / days, dailyBreaks: breaks / days, dailyFocus: focus / days,
    monthlyActivities: d.completions.length / months,
  };
}
export type Averages = ReturnType<typeof computeAverages>;
