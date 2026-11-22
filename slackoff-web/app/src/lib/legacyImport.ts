import type { PersistedData } from '../types';
import { EXERCISES } from '../data/exercises';
import { ACHIEVEMENTS } from '../data/achievements';
import { DEFAULT_SETTINGS, completionToRow, runToRow, sessionToRow, settingsToRow, supabase } from './storage';

// Before Supabase, the app kept everything in localStorage under these keys. On first sign-in we upload
// that data to the account once, then delete it so it can't be imported twice.
const LEGACY_KEYS = { data: 'slackoff:v1', timer: 'slackoff:timer:v1', flipUp: 'slackoff:airpods:flipUp' };

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const chunks = <T,>(a: T[], n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const throwIf = (r: { error: unknown }) => { if (r.error) throw r.error; };

/**
 * Uploads this browser's old localStorage data into the signed-in account.
 * Only runs when the account has no activity yet, so it never double-counts or mixes two people's history;
 * otherwise the local data is left untouched. Returns true if something was imported.
 */
export async function importLegacyData(userId: string): Promise<boolean> {
  const raw = read(LEGACY_KEYS.data);
  if (!raw) return false;
  let p: Partial<PersistedData>;
  try { p = JSON.parse(raw); } catch { return false; }

  const existing = await supabase.from('completed_activities').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  throwIf(existing);
  if ((existing.count ?? 0) > 0) return false;

  const validExercise = new Set(EXERCISES.map(e => e.id));
  const validAchievement = new Set(ACHIEVEMENTS.map(a => a.id));
  const newId = () => crypto.randomUUID();   // old ids weren't UUIDs; nothing references them

  const settings = { ...DEFAULT_SETTINGS, ...p.settings, airpodsFlipUp: read(LEGACY_KEYS.flipUp) === '1' };
  let timer: unknown = null;
  try { timer = JSON.parse(read(LEGACY_KEYS.timer) ?? 'null'); } catch { /* ignore */ }
  throwIf(await supabase.from('user_settings').update({ ...settingsToRow(settings), timer_state: timer }).eq('user_id', userId));

  if (p.profile?.avatar) throwIf(await supabase.from('profiles').update({ avatar: p.profile.avatar }).eq('id', userId));
  // The old default name was "You"; only carry over a real one. A taken username is skipped, not fatal.
  if (p.profile?.name && p.profile.name.trim() && p.profile.name !== 'You') {
    await supabase.from('profiles').update({ username: p.profile.name.trim() }).eq('id', userId);
  }
  if (p.leaderboard) {
    throwIf(await supabase.from('profiles').update({
      leaderboard_reset_at: p.leaderboard.resetAt ? new Date(p.leaderboard.resetAt).toISOString() : null,
      leaderboard_resets: p.leaderboard.resets ?? 0,
    }).eq('id', userId));
  }

  const completions = (p.completions ?? []).filter(c => validExercise.has(c.exerciseId)).map(c => completionToRow(userId, { ...c, id: newId() }));
  const sessions = (p.sessions ?? []).slice(-500).map(s => sessionToRow(userId, { ...s, id: newId() }));
  const runs = (p.runs ?? []).map(r => runToRow(userId, { ...r, id: newId() }));
  const breaks = (p.breaks ?? []).map(ts => ({ user_id: userId, taken_at: new Date(ts).toISOString() }));
  const achievements = Object.entries(p.achievements ?? {}).filter(([id]) => validAchievement.has(id))
    .map(([id, ts]) => ({ user_id: userId, achievement_id: id, unlocked_at: new Date(ts).toISOString() }));

  for (const c of chunks(completions)) throwIf(await supabase.from('completed_activities').insert(c));
  for (const c of chunks(sessions)) throwIf(await supabase.from('timer_sessions').insert(c));
  for (const c of chunks(runs)) throwIf(await supabase.from('game_runs').insert(c));
  for (const c of chunks(breaks)) throwIf(await supabase.from('breaks').insert(c));
  if (achievements.length) throwIf(await supabase.from('achievements').upsert(achievements, { onConflict: 'user_id,achievement_id', ignoreDuplicates: true }));

  try { Object.values(LEGACY_KEYS).forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
  return true;
}
