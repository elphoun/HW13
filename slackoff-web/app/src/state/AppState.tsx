import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Completion, GameRun, PersistedData, Profile, Settings, TimerSession } from '../types';
import * as store from '../lib/storage';
import { computeStats, type Stats } from '../lib/stats';
import { startOfWeek, uid } from '../lib/dates';
import { ACHIEVEMENTS } from '../data/achievements';
import { setSoundEnabled, sfx } from '../lib/sfx';
import { airpods } from '../lib/airpods';
import { AuthScreen } from '../components/AuthScreen';

export interface Toast { id: string; emoji: string; title: string; body?: string; }
export interface LeaderRow { name: string; avatar: string; points: number; you: boolean; rank: number; }

interface AppCtx {
  userId: string;
  /** Timer state saved in Supabase when the app loaded (TimerContext restores it). */
  initialTimer: unknown;
  data: PersistedData;
  stats: Stats;
  leaderboard: LeaderRow[];
  toasts: Toast[];
  updateSettings: (p: Partial<Settings>) => void;
  updateProfile: (p: Partial<Profile>) => void;
  addCompletion: (c: Omit<Completion, 'id' | 'ts'>) => Completion;
  addBreak: () => void;
  addSession: (s: Omit<TimerSession, 'id' | 'ts'>) => void;
  addRun: (r: Omit<GameRun, 'id' | 'ts'>) => void;
  resetLeaderboard: () => void;
  resetAllData: () => void;
  saveTimer: (t: unknown) => void;
  signOut: () => Promise<void>;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => { const c = useContext(Ctx); if (!c) throw new Error('useApp outside provider'); return c; };

type Boot = { state: 'loading' } | { state: 'signed-out' } | { state: 'error'; message: string } | { state: 'ready'; userId: string; data: PersistedData; timer: unknown; migrated: boolean };

/** Waits for a signed-in user, moves any old localStorage data into Supabase, loads the account, then renders the app. */
export function AppProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const [userId, setUserId] = useState<string | null | undefined>(undefined);   // undefined = not checked yet
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!store.supabase) { setBoot({ state: 'error', message: 'Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in app/.env.local' }); return; }
    store.currentUserId().then(setUserId).catch(() => setUserId(null));
    return store.onAuthChange(setUserId);
  }, []);

  useEffect(() => {
    if (userId === undefined) return;
    if (userId === null) { setBoot({ state: 'signed-out' }); return; }
    let live = true;
    setBoot(b => (b.state === 'ready' && b.userId === userId ? b : { state: 'loading' }));
    (async () => {
      const migrated = await store.migrateLocalData(userId);
      const { data, timer } = await store.loadData(userId);
      if (live) setBoot(b => (b.state === 'ready' && b.userId === userId ? b : { state: 'ready', userId, data, timer, migrated }));
    })().catch((e: unknown) => { if (live) setBoot({ state: 'error', message: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [userId, attempt]);

  if (boot.state === 'loading') return <div className="boot-screen"><p>Loading your SlackOff…</p></div>;
  if (boot.state === 'signed-out') return <AuthScreen />;
  if (boot.state === 'error') return (
    <div className="boot-screen">
      <p><b>Couldn't reach your SlackOff account.</b></p>
      <p className="muted small">{boot.message}</p>
      <button className="btn primary" onClick={() => { setBoot({ state: 'loading' }); setAttempt(n => n + 1); }}>Try again</button>
    </div>
  );
  return <AppState userId={boot.userId} initial={boot.data} initialTimer={boot.timer} migrated={boot.migrated}>{children}</AppState>;
}

/** Debounces a write so typing a name or dragging a slider doesn't send a request per keystroke. */
function useDebounced<T>(fn: (v: T) => void, wait: number) {
  const t = useRef<ReturnType<typeof setTimeout>>(); const f = useRef(fn); f.current = fn;
  return useCallback((v: T) => { clearTimeout(t.current); t.current = setTimeout(() => f.current(v), wait); }, [wait]);
}

function AppState({ userId, initial, initialTimer, migrated, children }: { userId: string; initial: PersistedData; initialTimer: unknown; migrated: boolean; children: ReactNode }) {
  const [data, setData] = useState<PersistedData>(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(Date.now());
  const [board, setBoard] = useState<store.BoardRow[]>([]);

  useEffect(() => setSoundEnabled(data.settings.sound), [data.settings.sound]);
  useEffect(() => { airpods.flipUp = data.settings.airpodsFlipUp; }, [data.settings.airpodsFlipUp]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);   // roll the day/week over while open

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid();
    setToasts(l => [...l.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts(l => l.filter(x => x.id !== id)), 5000);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts(l => l.filter(x => x.id !== id)), []);

  useEffect(() => { if (migrated) toast({ emoji: '☁️', title: 'Data moved to your account', body: 'Your stats from this browser are now saved in Supabase.' }); }, [migrated, toast]);

  /** Run a Supabase write in the background; local state has already been updated. */
  const bg = useCallback((p: Promise<unknown>, what = 'your progress') => {
    p.catch((e: { code?: string; message?: string }) => {
      console.error(e);
      toast(e?.code === '23505' && what === 'your name'
        ? { emoji: '🙊', title: 'That name is taken', body: 'Pick another display name.' }
        : { emoji: '⚠️', title: `Couldn't save ${what}`, body: e?.message });
    });
  }, [toast]);

  const stats = useMemo(() => computeStats(data, now), [data, now]);

  // Achievements: unlock anything newly satisfied, toast it once.
  useEffect(() => {
    const fresh = ACHIEVEMENTS.filter(a => !data.achievements[a.id] && a.test(data, stats));
    if (!fresh.length) return;
    const unlocked = Object.fromEntries(fresh.map(a => [a.id, Date.now()]));
    setData(d => ({ ...d, achievements: { ...d.achievements, ...unlocked } }));
    bg(store.insertAchievements(userId, unlocked), 'achievements');
    fresh.forEach(a => toast({ emoji: a.emoji, title: `Achievement: ${a.name}`, body: a.desc }));
    sfx.unlock_badge();
  }, [data, stats, toast, bg, userId]);

  // Leaderboard: everyone's weekly points from Supabase. Refreshed every minute, when the tab comes back, and after you score.
  const week0 = startOfWeek(now);
  const refreshBoard = useCallback(() => {
    store.fetchLeaderboard(week0).then(setBoard).catch(e => console.error('leaderboard', e));
  }, [week0]);
  useEffect(() => { refreshBoard(); }, [refreshBoard, now, stats.weeklyPoints, data.leaderboard.resets]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') refreshBoard(); };
    document.addEventListener('visibilitychange', onVis); return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshBoard]);

  const leaderboard = useMemo<LeaderRow[]>(() => {
    const rows = [
      ...board.filter(r => r.id !== userId).map(r => ({ name: r.username, avatar: r.avatar, points: r.points, you: false })),
      // Your row uses local numbers so it moves the moment you score, before the server round-trip.
      { name: data.profile.name || 'You', avatar: data.profile.avatar, points: stats.weeklyPoints, you: true },
    ];
    // Ties favor you so a fresh week doesn't bury you under zeros.
    rows.sort((a, b) => b.points - a.points || Number(b.you) - Number(a.you));
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [board, userId, data.profile, stats.weeklyPoints]);

  const saveSettings = useDebounced((p: Settings) => bg(store.saveSettings(userId, p), 'settings'), 400);
  const saveName = useDebounced((name: string) => { if (name.trim()) bg(store.saveProfile(userId, { name }), 'your name'); }, 700);
  const saveTimer = useDebounced((t: unknown) => bg(store.saveTimer(userId, t), 'the timer'), 300);
  const dataRef = useRef(data); dataRef.current = data;

  const value: AppCtx = {
    userId, initialTimer, data, stats, leaderboard, toasts, toast, dismissToast, saveTimer,
    signOut: store.signOut,
    updateSettings: p => {
      const next = { ...dataRef.current.settings, ...p };
      setData(d => ({ ...d, settings: { ...d.settings, ...p } }));
      saveSettings(next);
    },
    updateProfile: p => {
      setData(d => ({ ...d, profile: { ...d.profile, ...p } }));
      if (p.name !== undefined) saveName(p.name);
      if (p.avatar !== undefined) bg(store.saveProfile(userId, { avatar: p.avatar }), 'your avatar');
    },
    addCompletion: c => {
      const full: Completion = { ...c, id: crypto.randomUUID(), ts: Date.now() };
      setData(d => ({ ...d, completions: [...d.completions, full] }));
      bg(store.insertCompletion(userId, full));
      return full;
    },
    addBreak: () => {
      const ts = Date.now();
      setData(d => ({ ...d, breaks: [...d.breaks, ts] }));
      bg(store.insertBreak(userId, ts));
    },
    addSession: s => {
      const full: TimerSession = { ...s, id: crypto.randomUUID(), ts: Date.now() };
      setData(d => ({ ...d, sessions: [...d.sessions, full] }));
      bg(store.insertSession(userId, full));
    },
    addRun: r => {
      const full: GameRun = { ...r, id: crypto.randomUUID(), ts: Date.now() };
      setData(d => ({ ...d, runs: [...d.runs, full] }));
      bg(store.insertRun(userId, full));
    },
    resetLeaderboard: () => {
      const l = { resetAt: Date.now(), resets: dataRef.current.leaderboard.resets + 1 };
      setData(d => ({ ...d, leaderboard: l }));
      bg(store.saveLeaderboardReset(userId, l));
    },
    resetAllData: () => {
      setData(d => ({ ...store.defaultData(), settings: d.settings, profile: d.profile }));
      bg(store.deleteStats(userId), 'the reset');
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
