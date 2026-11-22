import { createClient } from '@supabase/supabase-js';
import type { BreakType, Completion, GameRun, Level, PersistedData, Profile, Settings, TimerSession } from '../types';
import { EXERCISES } from '../data/exercises';

// The only place that knows where data lives: Supabase (see /supabase). Users sign in with email + password;
// the database's handle_new_user trigger creates the profile + settings rows on sign-up.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabase = url && key ? createClient(url, key) : null;
const db = () => { if (!supabase) throw new Error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in app/.env.local'); return supabase; };

export const DEFAULT_SETTINGS: Settings = {
  workSeconds: 25 * 60, exerciseSeconds: 5 * 60, intensity: 2,
  story: 'wipeout', breakType: 'activity', dailyGoal: 5, notifications: true, sound: true, autoCycle: true, airpods: true, airpodsFlipUp: false,
};

export const defaultData = (): PersistedData => ({
  settings: { ...DEFAULT_SETTINGS },
  profile: { name: 'You', avatar: 'pinky' },
  completions: [], breaks: [], sessions: [], runs: [], achievements: {},
  leaderboard: { resetAt: 0, resets: 0 },
});

const iso = (t: number) => new Date(t).toISOString();
const ms = (s: string | null) => (s ? Date.parse(s) : 0);
const check = <T extends { error: { message: string } | null }>(r: T) => { if (r.error) throw r.error; return r; };

// ---- Legacy localStorage (read once, for the migration) ----
const LEGACY_KEY = 'slackoff:v1';
const LEGACY_TIMER_KEY = 'slackoff:timer:v1';
const LEGACY_FLIP_KEY = 'slackoff:airpods:flipUp';
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
function legacyData(): PersistedData | null {
  const raw = ls.get(LEGACY_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PersistedData>, d = defaultData();
    return { ...d, ...p, settings: { ...d.settings, ...p.settings, airpodsFlipUp: ls.get(LEGACY_FLIP_KEY) === '1' }, profile: { ...d.profile, ...p.profile }, leaderboard: { ...d.leaderboard, ...p.leaderboard } };
  } catch { return null; }
}

// ---- Auth ----
// Supabase's built-in email + password provider.
/** The signed-in user's id, or null when signed out. */
export async function currentUserId(): Promise<string | null> {
  const { data: { session } } = await db().auth.getSession();
  return session?.user.id ?? null;
}
/** Calls `cb` whenever the user signs in or out (including after clicking the email confirmation link). */
export function onAuthChange(cb: (userId: string | null) => void) {
  const { data } = db().auth.onAuthStateChange((_e, session) => cb(session?.user.id ?? null));
  return () => data.subscription.unsubscribe();
}
export async function signIn(email: string, password: string) {
  const { error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw error;
}
/** Returns true when the project wants the user to confirm their email before signing in. */
export async function signUp(email: string, password: string, username: string): Promise<boolean> {
  const legacy = legacyData()?.profile;
  const { data, error } = await db().auth.signUp({
    email, password,
    options: { emailRedirectTo: location.origin + location.pathname, data: { username: username.trim() || undefined, avatar: legacy?.avatar } },
  });
  if (error) throw error;
  return !data.session;
}
export async function sendPasswordReset(email: string) {
  const { error } = await db().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) throw error;
}
export async function signOut() { await db().auth.signOut(); }
/** The name an older version of the app had in this browser's localStorage, to prefill sign-up. */
export const legacyName = () => { const n = legacyData()?.profile.name.trim(); return n && n !== 'You' ? n : ''; };

// ---- Row mapping ----
interface SettingsRow {
  work_seconds: number; exercise_seconds: number; intensity: number; story: string; break_type: string; daily_goal: number;
  notifications: boolean; sound: boolean; auto_cycle: boolean; airpods: boolean; airpods_flip_up: boolean; timer_state: unknown;
}
const settingsFromRow = (r: SettingsRow): Settings => ({
  workSeconds: r.work_seconds, exerciseSeconds: r.exercise_seconds, intensity: r.intensity as Level, story: r.story,
  breakType: r.break_type as BreakType, dailyGoal: r.daily_goal, notifications: r.notifications, sound: r.sound,
  autoCycle: r.auto_cycle, airpods: r.airpods, airpodsFlipUp: r.airpods_flip_up,
});
const SETTINGS_COLS: Record<keyof Settings, keyof SettingsRow> = {
  workSeconds: 'work_seconds', exerciseSeconds: 'exercise_seconds', intensity: 'intensity', story: 'story', breakType: 'break_type',
  dailyGoal: 'daily_goal', notifications: 'notifications', sound: 'sound', autoCycle: 'auto_cycle', airpods: 'airpods', airpodsFlipUp: 'airpods_flip_up',
};
const settingsToRow = (p: Partial<Settings>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [SETTINGS_COLS[k as keyof Settings], v]));

const completionRow = (userId: string, c: Completion) => ({ id: c.id, user_id: userId, exercise_id: c.exerciseId, source: c.source, points: c.points, seconds: c.seconds, completed_at: iso(c.ts) });
const sessionRow = (userId: string, s: TimerSession) => ({ id: s.id, user_id: userId, kind: s.kind, planned_seconds: s.plannedSeconds, completed: s.completed, started_at: iso(s.ts) });
const runRow = (userId: string, r: GameRun) => ({ id: r.id, user_id: userId, story: r.map, score: r.score, completed: r.completed, total: r.total, played_at: iso(r.ts) });

/** PostgREST caps a response at 1000 rows, so page through. */
async function fetchAll<T>(table: string, cols: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from(table).select(cols).order(order).range(from, from + 999);
    if (error) throw error;
    out.push(...(data as T[]));
    if (data.length < 1000) return out;
  }
}

// ---- Load ----
export async function loadData(userId: string): Promise<{ data: PersistedData; timer: unknown }> {
  const [profile, settings, completions, breaks, sessions, runs, achievements] = await Promise.all([
    db().from('profiles').select('username, avatar, leaderboard_reset_at, leaderboard_resets').eq('id', userId).single().then(check),
    db().from('user_settings').select('*').eq('user_id', userId).single().then(check),
    fetchAll<{ id: string; exercise_id: string; source: Completion['source']; points: number; seconds: number; completed_at: string }>('completed_activities', 'id, exercise_id, source, points, seconds, completed_at', 'completed_at'),
    fetchAll<{ taken_at: string }>('breaks', 'taken_at', 'taken_at'),
    fetchAll<{ id: string; kind: TimerSession['kind']; planned_seconds: number; completed: boolean; started_at: string }>('timer_sessions', 'id, kind, planned_seconds, completed, started_at', 'started_at'),
    fetchAll<{ id: string; story: string; score: number; completed: number; total: number; played_at: string }>('game_runs', 'id, story, score, completed, total, played_at', 'played_at'),
    fetchAll<{ achievement_id: string; unlocked_at: string }>('achievements', 'achievement_id, unlocked_at', 'unlocked_at'),
  ]);
  const p = profile.data!, s = settings.data as SettingsRow;
  return {
    timer: s.timer_state,
    data: {
      settings: settingsFromRow(s),
      profile: { name: p.username, avatar: p.avatar },
      completions: completions.map(c => ({ id: c.id, ts: ms(c.completed_at), exerciseId: c.exercise_id, points: c.points, seconds: c.seconds, source: c.source })),
      breaks: breaks.map(b => ms(b.taken_at)),
      sessions: sessions.map(x => ({ id: x.id, ts: ms(x.started_at), kind: x.kind, plannedSeconds: x.planned_seconds, completed: x.completed })),
      runs: runs.map(r => ({ id: r.id, ts: ms(r.played_at), map: r.story, score: r.score, completed: r.completed, total: r.total })),
      achievements: Object.fromEntries(achievements.map(a => [a.achievement_id, ms(a.unlocked_at)])),
      leaderboard: { resetAt: ms(p.leaderboard_reset_at), resets: p.leaderboard_resets },
    },
  };
}

// ---- One-time migration of this browser's localStorage into Supabase ----
/**
 * Copies the old localStorage data into the signed-in account, one table at a time. Finished steps are
 * remembered, so a failure part-way can be retried without duplicating rows. When every step is done the
 * old keys are moved to `*:migrated` backups. Returns true if anything was migrated.
 */
export async function migrateLocalData(userId: string): Promise<boolean> {
  const d = legacyData();
  const timer = ls.get(LEGACY_TIMER_KEY);
  if (!d && !timer) return false;
  const doneKey = `slackoff:migration:${userId}`;
  const done = new Set<string>(JSON.parse(ls.get(doneKey) ?? '[]'));
  const step = async (name: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    if (done.has(name)) return;
    check(await fn());
    done.add(name); ls.set(doneKey, JSON.stringify([...done]));
  };
  const uuid = () => crypto.randomUUID();
  const known = new Set(EXERCISES.map(e => e.id));

  if (d) {
    await step('settings', () => db().from('user_settings').update(settingsToRow(d.settings)).eq('user_id', userId));
    await step('profile', () => db().from('profiles').update({
      avatar: d.profile.avatar,
      leaderboard_reset_at: d.leaderboard.resetAt ? iso(d.leaderboard.resetAt) : null, leaderboard_resets: d.leaderboard.resets,
    }).eq('id', userId));
    const completions = d.completions.filter(c => known.has(c.exerciseId)).map(c => completionRow(userId, { ...c, id: uuid() }));
    if (completions.length) await step('completions', () => db().from('completed_activities').insert(completions));
    if (d.breaks.length) await step('breaks', () => db().from('breaks').insert(d.breaks.map(t => ({ user_id: userId, taken_at: iso(t) }))));
    if (d.sessions.length) await step('sessions', () => db().from('timer_sessions').insert(d.sessions.map(s => sessionRow(userId, { ...s, id: uuid() }))));
    if (d.runs.length) await step('runs', () => db().from('game_runs').insert(d.runs.map(r => runRow(userId, { ...r, id: uuid() }))));
    const ach = Object.entries(d.achievements).map(([id, t]) => ({ user_id: userId, achievement_id: id, unlocked_at: iso(t) }));
    if (ach.length) await step('achievements', () => db().from('achievements').upsert(ach, { ignoreDuplicates: true }));
  }
  if (timer) await step('timer', () => db().from('user_settings').update({ timer_state: JSON.parse(timer) }).eq('user_id', userId));

  for (const k of [LEGACY_KEY, LEGACY_TIMER_KEY, LEGACY_FLIP_KEY]) { const v = ls.get(k); if (v !== null) { ls.set(`${k}:migrated`, v); ls.del(k); } }
  ls.del(doneKey);
  return true;
}

// ---- Writes ----
export const saveSettings = async (userId: string, p: Partial<Settings>) => { check(await db().from('user_settings').update(settingsToRow(p)).eq('user_id', userId)); };
export const saveTimer = async (userId: string, t: unknown) => { check(await db().from('user_settings').update({ timer_state: t }).eq('user_id', userId)); };
export async function saveProfile(userId: string, p: Partial<Profile>) {
  const row: Record<string, string> = {};
  if (p.name !== undefined) row.username = p.name.trim();
  if (p.avatar !== undefined) row.avatar = p.avatar;
  check(await db().from('profiles').update(row).eq('id', userId));
}
export const saveLeaderboardReset = async (userId: string, l: PersistedData['leaderboard']) => {
  check(await db().from('profiles').update({ leaderboard_reset_at: iso(l.resetAt), leaderboard_resets: l.resets }).eq('id', userId));
};
export const insertCompletion = async (userId: string, c: Completion) => { check(await db().from('completed_activities').insert(completionRow(userId, c))); };
export const insertBreak = async (userId: string, ts: number) => { check(await db().from('breaks').insert({ user_id: userId, taken_at: iso(ts) })); };
export const insertSession = async (userId: string, s: TimerSession) => { check(await db().from('timer_sessions').insert(sessionRow(userId, s))); };
export const insertRun = async (userId: string, r: GameRun) => { check(await db().from('game_runs').insert(runRow(userId, r))); };
export const insertAchievements = async (userId: string, a: Record<string, number>) => {
  check(await db().from('achievements').upsert(Object.entries(a).map(([id, t]) => ({ user_id: userId, achievement_id: id, unlocked_at: iso(t) })), { ignoreDuplicates: true }));
};
/** "Reset my stats": deletes history, keeps settings and profile. */
export async function deleteStats(userId: string) {
  await Promise.all(['completed_activities', 'breaks', 'timer_sessions', 'game_runs', 'achievements'].map(t => db().from(t).delete().eq('user_id', userId).then(check)));
  check(await db().from('profiles').update({ leaderboard_reset_at: null, leaderboard_resets: 0 }).eq('id', userId));
}

// ---- Leaderboard ----
export interface BoardRow { id: string; username: string; avatar: string; points: number; }
/** Everyone's points since `weekStart` (your local Monday 00:00). See supabase/migrations/002_web_app_wiring.sql. */
export async function fetchLeaderboard(weekStart: number): Promise<BoardRow[]> {
  const { data, error } = await db().rpc('leaderboard', { week_start: iso(weekStart) });
  if (error) throw error;
  return (data as BoardRow[]).map(r => ({ ...r, points: Number(r.points) }));
}
