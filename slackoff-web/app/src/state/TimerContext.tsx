import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from './AppState';
import { createTicker } from '../lib/ticker';
import { notify, registerSW, requestPermission } from '../lib/notify';
import { sfx } from '../lib/sfx';
import { fmtClock } from '../lib/dates';

export type Phase = 'work' | 'exercise';
export type Status = 'idle' | 'running' | 'paused';

interface TimerState {
  phase: Phase; status: Status;
  endAt: number;            // when running
  remainingMs: number;      // when paused
  breakCredited: boolean;   // has this break already counted as "completed"?
}

interface TimerCtx extends TimerState {
  totalMs: number; remainingNow: number; progress: number;
  start: () => void; pause: () => void; resume: () => void; reset: () => void; skip: () => void;
  /** Add time to the current countdown (used to lengthen a break that runs activity + stretch). */
  extend: (ms: number) => void;
  /** Call when the user does something during a break; the first call counts the break as completed. */
  creditBreak: () => void;
  enableNotifications: () => Promise<void>;
}

const Ctx = createContext<TimerCtx | null>(null);
export const useTimer = () => { const c = useContext(Ctx); if (!c) throw new Error('useTimer outside provider'); return c; };

export function TimerProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const { settings } = app.data;
  const appRef = useRef(app); appRef.current = app;

  const [s, setS] = useState<TimerState>(() => {
    const saved = app.savedTimer as TimerState | null;   // loaded from Supabase with the rest of your data
    const base: TimerState = { phase: 'work', status: 'idle', endAt: 0, remainingMs: 0, breakCredited: false };
    if (!saved) return base;
    if (saved.status === 'running' && saved.endAt <= Date.now()) return { ...saved, status: 'idle', endAt: 0 };   // expired while the tab was closed
    return saved;
  });
  const sRef = useRef(s); sRef.current = s;
  const [, force] = useState(0);

  useEffect(() => appRef.current.saveTimer(s), [s]);
  useEffect(() => { void registerSW(); }, []);

  const durMs = useCallback((phase: Phase) => (phase === 'work' ? settings.workSeconds : settings.exerciseSeconds) * 1000, [settings.workSeconds, settings.exerciseSeconds]);
  const durRef = useRef(durMs); durRef.current = durMs;

  /** Move to the other phase. `fromExpiry` = the clock ran out (notify the user, log the session as completed). */
  const advance = useCallback((fromExpiry: boolean) => {
    const cur = sRef.current, a = appRef.current, st = a.data.settings;
    const next: Phase = cur.phase === 'work' ? 'exercise' : 'work';
    const planned = (cur.phase === 'work' ? st.workSeconds : st.exerciseSeconds);
    a.addSession({ kind: cur.phase, plannedSeconds: planned, completed: fromExpiry });
    if (fromExpiry) {
      if (next === 'exercise') { sfx.chime(); if (st.notifications) void notify('Time to move! 🏃', 'Your work timer is up. Tap to start your SlackOff break.', 'slackoff-break'); }
      else { sfx.breakOver(); if (st.notifications) void notify('Break over! 💪', 'Nice moves. Time to get back to work.', 'slackoff-work'); }
    }
    const nextMs = (next === 'work' ? st.workSeconds : st.exerciseSeconds) * 1000;
    const running = st.autoCycle;
    setS({
      phase: next, status: running ? 'running' : 'idle', endAt: running ? Date.now() + nextMs : 0, remainingMs: 0,
      breakCredited: false,
    });
  }, []);

  // The clock. Ticks from a worker so it keeps firing in background tabs.
  const ticker = useRef<ReturnType<typeof createTicker> | null>(null);
  useEffect(() => {
    const t = createTicker(() => {
      const cur = sRef.current;
      if (cur.status === 'running' && Date.now() >= cur.endAt) advance(true);
      else force(n => n + 1);
    });
    ticker.current = t;
    return () => t.destroy();
  }, [advance]);
  useEffect(() => { if (s.status === 'running') ticker.current?.start(); else ticker.current?.stop(); }, [s.status]);

  // Clicking a notification (or its action button) brings the user back to the app.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'notification-click') return;
      const cur = sRef.current;
      if (e.data.action === 'start' && cur.status === 'idle') setS(p => ({ ...p, status: 'running', endAt: Date.now() + durRef.current(p.phase) }));
      location.hash = '#/';
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);

  const remainingNow = s.status === 'running' ? Math.max(0, s.endAt - Date.now()) : s.status === 'paused' ? s.remainingMs : durMs(s.phase);
  const totalMs = durMs(s.phase);
  const progress = totalMs ? Math.min(1, Math.max(0, 1 - remainingNow / totalMs)) : 0;

  useEffect(() => {
    document.title = s.status === 'idle' ? 'SlackOff — Stop sitting around. Start SlackOff!' : `${fmtClock(remainingNow)} · ${s.phase === 'work' ? 'Work' : 'MOVE!'} · SlackOff`;
  });

  const value: TimerCtx = {
    ...s, totalMs, remainingNow, progress,
    start: () => {
      sfx.unlock();
      // Ask for notification permission at the moment the user starts a timer: that's when it has an obvious purpose.
      if (settings.notifications) void requestPermission();
      setS(p => ({ ...p, status: 'running', endAt: Date.now() + durMs(p.phase) }));
    },
    pause: () => setS(p => p.status === 'running' ? { ...p, status: 'paused', remainingMs: Math.max(0, p.endAt - Date.now()) } : p),
    resume: () => setS(p => p.status === 'paused' ? { ...p, status: 'running', endAt: Date.now() + p.remainingMs } : p),
    reset: () => setS({ phase: 'work', status: 'idle', endAt: 0, remainingMs: 0, breakCredited: false }),
    skip: () => advance(false),
    extend: ms => setS(p => p.status === 'running' ? { ...p, endAt: p.endAt + ms } : p.status === 'paused' ? { ...p, remainingMs: p.remainingMs + ms } : p),
    creditBreak: () => {
      if (sRef.current.phase !== 'exercise' || sRef.current.breakCredited) return;
      app.addBreak();
      setS(p => ({ ...p, breakCredited: true }));
    },
    enableNotifications: async () => {
      const r = await requestPermission();
      if (r === 'granted') { app.updateSettings({ notifications: true }); await notify('Notifications are on 🎉', "We'll nudge you when it's time to move."); }
      else app.toast({ emoji: '🔕', title: 'Notifications blocked', body: 'Allow them in your browser\'s site settings to get break reminders.' });
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
