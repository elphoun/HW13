import { createClient } from '@supabase/supabase-js';
import type { Completion, GameRun, PersistedData, Profile, Settings, TimerSession } from '../types';

// The only place that knows where data lives: Supabase (see /supabase/schema.sql + migration-002-app-sync.sql).
// Publishable key only: it's public, and RLS limits every query to the signed-in user's rows.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

export const DEFAULT_SETTINGS: Settings = {
  workSeconds: 25 * 60, exerciseSeconds: 5 * 60, intensity: 2,
  story: 'wipeout', breakType: 'activity', dailyGoal: 5, notifications: true, sound: true, autoCycle: true, airpods: true,
  airpodsFlipUp: false,
};

export const defaultData = (): PersistedData => ({
  settings: { ...DEFAULT_SETTINGS },
  profile: { name: 'You', avatar: 'pinky' },
  completions: [], breaks: [], sessions: [], runs: [], achievements: {},
  leaderboard: { resetAt: 0, resets: 0 },
});

// ---------------------------------------------------------------------------------------------------
// Row <-> app shape mapping (DB is snake_case with ISO timestamps; the app uses camelCase + epoch ms)
// ---------------------------------------------------------------------------------------------------
const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string | null | undefined) => (s ? Date.parse(s) : 0);

const SETTINGS_COLUMNS: { [K in keyof Settings]: string } = {
  workSeconds: 'work_seconds', exerciseSeconds: 'exercise_seconds', intensity: 'intensity', story: 'story',
  breakType: 'break_type', dailyGoal: 'daily_goal', notifications: 'notifications', sound: 'sound',
  autoCycle: 'auto_cycle', airpods: 'airpods', airpodsFlipUp: 'airpods_flip_up',
};

export function settingsToRow(p: Partial<Settings>) {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) row[SETTINGS_COLUMNS[k as keyof Settings]] = v;
  return row;
}
function rowToSettings(row: Record<string, unknown> | null): Settings {
  const s = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  if (row) for (const [k, col] of Object.entries(SETTINGS_COLUMNS)) if (row[col] != null) s[k] = row[col];
  return s as unknown as Settings;
}

export const completionToRow = (userId: string, c: Completion) => ({
  id: c.id, user_id: userId, exercise_id: c.exerciseId, source: c.source, points: c.points, seconds: c.seconds, completed_at: iso(c.ts),
});
export const sessionToRow = (userId: string, s: TimerSession) => ({
  id: s.id, user_id: userId, kind: s.kind, planned_seconds: s.plannedSeconds, completed: s.completed, started_at: iso(s.ts),
});
export const runToRow = (userId: string, r: GameRun) => ({
  id: r.id, user_id: userId, story: r.map, score: r.score, completed: r.completed, total: r.total, played_at: iso(r.ts),
});

/** PostgREST caps responses (1000 rows by default), so page through anything that grows without bound. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const size = 1000, out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

const check = <T extends { error: unknown }>(r: T) => { if (r.error) throw r.error; return r; };

// ---------------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------------
export interface LoadedUser { data: PersistedData; timer: unknown | null; }

/** Everything the app keeps for one user. Creates the profile/settings rows if the signup trigger didn't. */
export async function loadUserData(userId: string): Promise<LoadedUser> {
  const [profileRes, settingsRes, completions, breaks, sessionsRes, runs, achievementsRes] = await Promise.all([
    supabase.from('profiles').select().eq('id', userId).maybeSingle(),
    supabase.from('user_settings').select().eq('user_id', userId).maybeSingle(),
    fetchAll((a, b) => supabase.from('completed_activities').select().eq('user_id', userId).order('completed_at').order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('breaks').select('taken_at').eq('user_id', userId).order('taken_at').order('id').range(a, b)),
    supabase.from('timer_sessions').select().eq('user_id', userId).order('started_at', { ascending: false }).limit(500),   // the app keeps the last 500
    fetchAll((a, b) => supabase.from('game_runs').select().eq('user_id', userId).order('played_at').order('id').range(a, b)),
    supabase.from('achievements').select().eq('user_id', userId),
  ]);
  for (const r of [profileRes, settingsRes, sessionsRes, achievementsRes]) check(r);

  let profile = profileRes.data;
  if (!profile) {
    profile = check(await supabase.from('profiles').insert({ id: userId, username: `user_${userId.slice(0, 8)}` }).select().single()).data;
  }
  if (!settingsRes.data) check(await supabase.from('user_settings').insert({ user_id: userId }));

  const data: PersistedData = {
    settings: rowToSettings(settingsRes.data),
    profile: { name: profile.username, avatar: profile.avatar },
    completions: completions.map((c: any) => ({ id: c.id, ts: ms(c.completed_at), exerciseId: c.exercise_id, points: c.points, seconds: c.seconds, source: c.source })),
    breaks: breaks.map((b: any) => ms(b.taken_at)),
    sessions: (sessionsRes.data ?? []).reverse().map((s: any) => ({ id: s.id, ts: ms(s.started_at), kind: s.kind, plannedSeconds: s.planned_seconds, completed: s.completed })),
    runs: runs.map((r: any) => ({ id: r.id, ts: ms(r.played_at), map: r.story, score: r.score, completed: r.completed, total: r.total })),
    achievements: Object.fromEntries((achievementsRes.data ?? []).map((a: any) => [a.achievement_id, ms(a.unlocked_at)])),
    leaderboard: { resetAt: ms(profile.leaderboard_reset_at), resets: profile.leaderboard_resets ?? 0 },
  };
  return { data, timer: settingsRes.data?.timer_state ?? null };
}

export interface LeaderboardEntry { id: string; username: string; avatar: string; points: number; }

/** This week's ranking across all users (the weekly_leaderboard view; signed-in users only). */
export async function loadLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const r = check(await supabase.from('weekly_leaderboard').select('id, username, avatar, points').limit(limit));
  return (r.data ?? []) as LeaderboardEntry[];
}

// ---------------------------------------------------------------------------------------------------
// Writes: one small write per user action. Each throws on failure so the caller can surface it.
// ---------------------------------------------------------------------------------------------------
export const db = {
  async updateSettings(userId: string, p: Partial<Settings>) {
    const row = settingsToRow(p);
    if (Object.keys(row).length) check(await supabase.from('user_settings').update(row).eq('user_id', userId));
  },
  async updateProfile(userId: string, p: Partial<Profile>) {
    const row: Record<string, unknown> = {};
    if (p.name !== undefined) row.username = p.name.trim();
    if (p.avatar !== undefined) row.avatar = p.avatar;
    if (row.username === '') delete row.username;   // username is required; keep the old one while the field is empty
    if (Object.keys(row).length) check(await supabase.from('profiles').update(row).eq('id', userId));
  },
  async saveTimer(userId: string, state: unknown) {
    check(await supabase.from('user_settings').update({ timer_state: state }).eq('user_id', userId));
  },
  async addCompletion(userId: string, c: Completion) {
    check(await supabase.from('completed_activities').insert(completionToRow(userId, c)));
  },
  async addBreak(userId: string, ts: number) {
    check(await supabase.from('breaks').insert({ user_id: userId, taken_at: iso(ts) }));
  },
  async addSession(userId: string, s: TimerSession) {
    check(await supabase.from('timer_sessions').insert(sessionToRow(userId, s)));
  },
  async addRun(userId: string, r: GameRun) {
    check(await supabase.from('game_runs').insert(runToRow(userId, r)));
  },
  async addAchievements(userId: string, unlocked: Record<string, number>) {
    const rows = Object.entries(unlocked).map(([id, ts]) => ({ user_id: userId, achievement_id: id, unlocked_at: iso(ts) }));
    if (rows.length) check(await supabase.from('achievements').upsert(rows, { onConflict: 'user_id,achievement_id', ignoreDuplicates: true }));
  },
  async setLeaderboard(userId: string, lb: PersistedData['leaderboard']) {
    check(await supabase.from('profiles').update({ leaderboard_reset_at: lb.resetAt ? iso(lb.resetAt) : null, leaderboard_resets: lb.resets }).eq('id', userId));
  },
  /** "Reset my stats": wipes history but keeps settings and profile. */
  async resetStats(userId: string) {
    const results = await Promise.all([
      supabase.from('completed_activities').delete().eq('user_id', userId),
      supabase.from('breaks').delete().eq('user_id', userId),
      supabase.from('timer_sessions').delete().eq('user_id', userId),
      supabase.from('game_runs').delete().eq('user_id', userId),
      supabase.from('achievements').delete().eq('user_id', userId),
      supabase.from('profiles').update({ leaderboard_reset_at: null, leaderboard_resets: 0 }).eq('id', userId),
    ]);
    results.forEach(check);
  },
};
