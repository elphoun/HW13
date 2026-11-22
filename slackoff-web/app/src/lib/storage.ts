import type { PersistedData, Settings } from '../types';

// The only place that knows where data lives. Swap these two functions for Supabase calls later (see /supabase/schema.sql).
const KEY = 'slackoff:v1';
const TIMER_KEY = 'slackoff:timer:v1';

export const DEFAULT_SETTINGS: Settings = {
  workSeconds: 25 * 60, exerciseSeconds: 5 * 60, intensity: 2, disabledActivities: [], pickedActivity: 'random',
  preferredMap: 'forest', dailyGoal: 5, notifications: true, sound: true, autoCycle: true,
};

export const defaultData = (): PersistedData => ({
  settings: { ...DEFAULT_SETTINGS },
  profile: { name: 'You', avatar: 'pinky' },
  completions: [], breaks: [], sessions: [], runs: [], achievements: {},
  leaderboard: { resetAt: 0, resets: 0 },
});

export function loadData(): PersistedData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultData();
    const p = JSON.parse(raw) as Partial<PersistedData>;
    const d = defaultData();
    return { ...d, ...p, settings: { ...d.settings, ...p.settings }, profile: { ...d.profile, ...p.profile }, leaderboard: { ...d.leaderboard, ...p.leaderboard } };
  } catch { return defaultData(); }
}
export function saveData(d: PersistedData) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage full / private mode */ } }

export function loadJSON<T>(key: string = TIMER_KEY): T | null { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) as T : null; } catch { return null; } }
export function saveJSON(v: unknown, key: string = TIMER_KEY) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }
