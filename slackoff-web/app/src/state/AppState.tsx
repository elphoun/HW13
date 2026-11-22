import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Completion, GameRun, PersistedData, Profile, Settings, TimerSession } from '../types';
import { defaultData, loadData, saveData } from '../lib/storage';
import { computeStats, type Stats } from '../lib/stats';
import { weeklyRivals } from '../lib/rivals';
import { uid } from '../lib/dates';
import { ACHIEVEMENTS } from '../data/achievements';
import { setSoundEnabled, sfx } from '../lib/sfx';

export interface Toast { id: string; emoji: string; title: string; body?: string; }
export interface LeaderRow { name: string; avatar: string; points: number; you: boolean; rank: number; }

interface AppCtx {
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
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => { const c = useContext(Ctx); if (!c) throw new Error('useApp outside provider'); return c; };

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PersistedData>(loadData);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => saveData(data), [data]);
  useEffect(() => setSoundEnabled(data.settings.sound), [data.settings.sound]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);   // roll the day/week over while open

  // Keep several tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'slackoff:v1') setData(loadData()); };
    addEventListener('storage', onStorage); return () => removeEventListener('storage', onStorage);
  }, []);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid();
    setToasts(l => [...l.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts(l => l.filter(x => x.id !== id)), 5000);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts(l => l.filter(x => x.id !== id)), []);

  const stats = useMemo(() => computeStats(data, now), [data, now]);

  // Achievements: unlock anything newly satisfied, toast it once.
  useEffect(() => {
    const fresh = ACHIEVEMENTS.filter(a => !data.achievements[a.id] && a.test(data, stats));
    if (!fresh.length) return;
    setData(d => ({ ...d, achievements: { ...d.achievements, ...Object.fromEntries(fresh.map(a => [a.id, Date.now()])) } }));
    fresh.forEach(a => toast({ emoji: a.emoji, title: `Achievement: ${a.name}`, body: a.desc }));
    sfx.unlock_badge();
  }, [data, stats, toast]);

  const leaderboard = useMemo<LeaderRow[]>(() => {
    const rows = [
      ...weeklyRivals(now, data.leaderboard.resets).map(r => ({ ...r, you: false })),
      { name: data.profile.name || 'You', avatar: data.profile.avatar, points: stats.weeklyPoints, you: true },
    ];
    // Ties favor you so a fresh week doesn't bury you under zeros.
    rows.sort((a, b) => b.points - a.points || Number(b.you) - Number(a.you));
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [now, data.leaderboard.resets, data.profile, stats.weeklyPoints]);

  const value: AppCtx = {
    data, stats, leaderboard, toasts, toast, dismissToast,
    updateSettings: p => setData(d => ({ ...d, settings: { ...d.settings, ...p } })),
    updateProfile: p => setData(d => ({ ...d, profile: { ...d.profile, ...p } })),
    addCompletion: c => {
      const full: Completion = { ...c, id: uid(), ts: Date.now() };
      setData(d => ({ ...d, completions: [...d.completions, full] }));
      return full;
    },
    addBreak: () => setData(d => ({ ...d, breaks: [...d.breaks, Date.now()] })),
    addSession: s => setData(d => ({ ...d, sessions: [...d.sessions.slice(-499), { ...s, id: uid(), ts: Date.now() }] })),
    addRun: r => setData(d => ({ ...d, runs: [...d.runs, { ...r, id: uid(), ts: Date.now() }] })),
    resetLeaderboard: () => setData(d => ({ ...d, leaderboard: { resetAt: Date.now(), resets: d.leaderboard.resets + 1 } })),
    resetAllData: () => setData({ ...defaultData(), settings: data.settings }),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
