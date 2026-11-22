import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Completion, GameRun, PersistedData, Profile, Settings, TimerSession } from '../types';
import { db, defaultData, loadLeaderboard, loadUserData, supabase, type LeaderboardEntry, type LoadedUser } from '../lib/storage';
import { importLegacyData } from '../lib/legacyImport';
import { computeStats, type Stats } from '../lib/stats';
import { uid } from '../lib/dates';
import { ACHIEVEMENTS } from '../data/achievements';
import { setSoundEnabled, sfx } from '../lib/sfx';
import { airpods } from '../lib/airpods';
import { AuthScreen, LoadingScreen } from '../components/AuthScreen';
import { usernameFromEmail } from '../lib/auth';

export interface Toast { id: string; emoji: string; title: string; body?: string; }
export interface LeaderRow { name: string; avatar: string; points: number; you: boolean; rank: number; }

interface AppCtx {
  /** `username` is the login name (fixed); data.profile.name is the editable display name. */
  user: { id: string; username: string | null };
  data: PersistedData;
  stats: Stats;
  leaderboard: LeaderRow[];
  toasts: Toast[];
  /** Timer clock state as saved in Supabase when the app loaded (TimerContext restores from it). */
  savedTimer: unknown | null;
  saveTimer: (state: unknown) => void;
  updateSettings: (p: Partial<Settings>) => void;
  updateProfile: (p: Partial<Profile>) => void;
  addCompletion: (c: Omit<Completion, 'id' | 'ts'>) => Completion;
  addBreak: () => void;
  addSession: (s: Omit<TimerSession, 'id' | 'ts'>) => void;
  addRun: (r: Omit<GameRun, 'id' | 'ts'>) => void;
  resetLeaderboard: () => void;
  resetAllData: () => void;
  signOut: () => Promise<void>;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => { const c = useContext(Ctx); if (!c) throw new Error('useApp outside provider'); return c; };

/**
 * Collects rapid partial updates (typing a name, dragging a stepper) and writes them once things settle.
 * Flushes on page hide and on unmount so a quick close doesn't lose the last change.
 */
function useCoalescedWrite<T extends object>(write: (patch: Partial<T>) => Promise<void>, onError: (e: unknown) => void, delayMs = 500) {
  const pending = useRef<Partial<T>>({});
  const timer = useRef<number | undefined>(undefined);
  const writeRef = useRef(write); writeRef.current = write;
  const errRef = useRef(onError); errRef.current = onError;

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const patch = pending.current; pending.current = {};
    if (Object.keys(patch).length) await writeRef.current(patch).catch(errRef.current);
  }, []);
  const push = useCallback((patch: Partial<T>) => {
    Object.assign(pending.current, patch);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), delayMs);
  }, [flush, delayMs]);
  useEffect(() => {
    const onHide = () => void flush();
    addEventListener('pagehide', onHide);
    return () => { removeEventListener('pagehide', onHide); void flush(); };
  }, [flush]);
  return [push, flush] as const;
}

/** Auth gate: sign in, load the user's data from Supabase, then render the app. */
export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loaded, setLoaded] = useState<(LoadedUser & { userId: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    setLoaded(null); setError(null);
    if (!userId) return;
    let cancelled = false;
    (async () => {
      await importLegacyData(userId);   // one-time upload of pre-Supabase localStorage data
      const r = await loadUserData(userId);
      if (!cancelled) setLoaded({ ...r, userId });
    })().catch(e => { if (!cancelled) setError(e?.message ?? String(e)); });
    return () => { cancelled = true; };
  }, [userId, attempt]);

  if (session === undefined) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  if (!loaded || loaded.userId !== session.user.id) {
    return <LoadingScreen error={error} onRetry={() => setAttempt(n => n + 1)} onSignOut={() => void supabase.auth.signOut()} />;
  }
  return (
    <DataProvider key={loaded.userId} user={{ id: loaded.userId, username: usernameFromEmail(session.user.email) }} initial={loaded}>
      {children}
    </DataProvider>
  );
}

function DataProvider({ user, initial, children }: { user: AppCtx['user']; initial: LoadedUser; children: ReactNode }) {
  const userId = user.id;
  const [data, setData] = useState<PersistedData>(initial.data);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => setSoundEnabled(data.settings.sound), [data.settings.sound]);
  useEffect(() => airpods.setFlipUp(data.settings.airpodsFlipUp), [data.settings.airpodsFlipUp]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);   // roll the day/week over while open

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid();
    setToasts(l => [...l.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts(l => l.filter(x => x.id !== id)), 5000);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts(l => l.filter(x => x.id !== id)), []);

  // The screen updates immediately; the write goes to Supabase in the background and only surfaces if it fails.
  const onSaveError = useCallback((e: unknown) => {
    const msg = (e as { message?: string })?.message ?? String(e);
    const taken = (e as { code?: string })?.code === '23505';
    toast({ emoji: '⚠️', title: taken ? 'That name is taken' : "Couldn't save to Supabase", body: taken ? 'Pick a different display name.' : msg });
  }, [toast]);
  const persist = useCallback((p: Promise<void>) => { p.catch(onSaveError); }, [onSaveError]);

  const [queueSettings, flushSettings] = useCoalescedWrite<Settings>(p => db.updateSettings(userId, p), onSaveError);
  const [queueProfile, flushProfile] = useCoalescedWrite<Profile>(p => db.updateProfile(userId, p), onSaveError, 800);
  const [queueTimer, flushTimer] = useCoalescedWrite<{ state: unknown }>(p => db.saveTimer(userId, p.state), onSaveError, 300);

  const stats = useMemo(() => computeStats(data, now), [data, now]);

  // Everyone else's weekly points come from Supabase, refreshed each minute (the `now` tick).
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadLeaderboard().then(rows => { if (!cancelled) setBoard(rows); }).catch(e => console.warn('Leaderboard failed to load', e));
    return () => { cancelled = true; };
  }, [now]);

  // Achievements: unlock anything newly satisfied, toast it once.
  useEffect(() => {
    const fresh = ACHIEVEMENTS.filter(a => !data.achievements[a.id] && a.test(data, stats));
    if (!fresh.length) return;
    const unlocked = Object.fromEntries(fresh.map(a => [a.id, Date.now()]));
    setData(d => ({ ...d, achievements: { ...d.achievements, ...unlocked } }));
    persist(db.addAchievements(userId, unlocked));
    fresh.forEach(a => toast({ emoji: a.emoji, title: `Achievement: ${a.name}`, body: a.desc }));
    sfx.unlock_badge();
  }, [data, stats, toast, persist, userId]);

  const leaderboard = useMemo<LeaderRow[]>(() => {
    // Your own row uses local stats so it updates the instant you finish an activity (and respects "Reset week").
    const rows = [
      ...board.filter(r => r.id !== userId).map(r => ({ name: r.username, avatar: r.avatar, points: r.points, you: false })),
      { name: data.profile.name || 'You', avatar: data.profile.avatar, points: stats.weeklyPoints, you: true },
    ];
    // Ties favor you so a fresh week doesn't bury you under zeros.
    rows.sort((a, b) => b.points - a.points || Number(b.you) - Number(a.you));
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [board, userId, data.profile, stats.weeklyPoints]);

  const value: AppCtx = {
    user, data, stats, leaderboard, toasts, toast, dismissToast,
    savedTimer: initial.timer,
    saveTimer: state => queueTimer({ state }),
    updateSettings: p => { setData(d => ({ ...d, settings: { ...d.settings, ...p } })); queueSettings(p); },
    updateProfile: p => { setData(d => ({ ...d, profile: { ...d.profile, ...p } })); queueProfile(p); },
    addCompletion: c => {
      const full: Completion = { ...c, id: crypto.randomUUID(), ts: Date.now() };
      setData(d => ({ ...d, completions: [...d.completions, full] }));
      persist(db.addCompletion(userId, full));
      return full;
    },
    addBreak: () => {
      const ts = Date.now();
      setData(d => ({ ...d, breaks: [...d.breaks, ts] }));
      persist(db.addBreak(userId, ts));
    },
    addSession: s => {
      const full: TimerSession = { ...s, id: crypto.randomUUID(), ts: Date.now() };
      setData(d => ({ ...d, sessions: [...d.sessions.slice(-499), full] }));
      persist(db.addSession(userId, full));
    },
    addRun: r => {
      const full: GameRun = { ...r, id: crypto.randomUUID(), ts: Date.now() };
      setData(d => ({ ...d, runs: [...d.runs, full] }));
      persist(db.addRun(userId, full));
    },
    resetLeaderboard: () => {
      const lb = { resetAt: Date.now(), resets: data.leaderboard.resets + 1 };
      setData(d => ({ ...d, leaderboard: lb }));
      persist(db.setLeaderboard(userId, lb));
    },
    // Settings and profile (your name/avatar) are kept; history is wiped.
    resetAllData: () => {
      setData(d => ({ ...defaultData(), settings: d.settings, profile: d.profile }));
      persist(db.resetStats(userId));
    },
    signOut: async () => {
      await Promise.all([flushSettings(), flushProfile(), flushTimer()]);   // write pending edits while still signed in
      await supabase.auth.signOut();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
