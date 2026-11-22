import { useEffect, useRef } from 'react';
import { StatsPanel, type SideTab } from '../components/StatsPanel';
import { useUpcomingBreaks } from '../components/TopBar';
import { useTimer } from '../state/TimerContext';
import { useApp } from '../state/AppState';
import { fmtClock } from '../lib/dates';
import { permission } from '../lib/notify';
import { movesFor, storyById } from '../data/stories';
import { exerciseById } from '../data/exercises';
import type { BreakType } from '../types';
import { CloudSky } from '../components/CloudSky';
import bush from '../assets/home/bush.png';
import logo from '../assets/home/logo.png';

const DESIGN_H = 918;   // height of the home area in the Figma frame
const clockTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const PLAY = 'M8 5.5v13l10-6.5z', PAUSE = 'M9 5.5v13M15 5.5v13', RESET = 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.5H8';

/** Above the clock: what the focus timer is doing, and its two controls. */
function TimerStatus() {
  const t = useTimer();
  const { breaks } = useUpcomingBreaks();
  const [text, action] = t.status === 'running' ? [`Next break at ${clockTime(breaks[0] ?? t.endAt)}`, { label: 'Pause', icon: PAUSE, fn: t.pause }]
    : t.status === 'paused' ? ['Focus timer paused', { label: 'Resume', icon: PLAY, fn: t.resume }]
    : ['Ready to focus?', { label: 'Start', icon: PLAY, fn: t.start }];
  return (
    <div className="home-status" aria-live="polite">
      <span>{text}</span>
      <button className={`home-ctl${t.status === 'running' ? '' : ' strong'}`} onClick={action.fn}><Icon d={action.icon} />{action.label}</button>
      <button className="home-ctl" onClick={t.reset} disabled={t.status === 'idle'} title="Reset the focus timer"><Icon d={RESET} />Reset</button>
    </div>
  );
}

/** The ways to take a break. All play the same story; the card says which moves you'll get. */
function BreakCard({ type, title, onClick }: { type: BreakType; title: string; onClick: () => void }) {
  const { data } = useApp();
  const story = storyById(data.settings.story);
  const moves = [...new Set(story.scenes.flatMap(sc => movesFor(sc, type)).map(m => exerciseById(m.exerciseId)?.name).filter(Boolean))] as string[];
  const preview = type === 'both' ? 'every scene: the activity, then the stretch. About twice as long' : moves.slice(0, 3).join(', ').toLowerCase();
  const count = story.scenes.length * (type === 'both' ? 2 : 1);
  return (
    <button className={`home-card ${type}`} onClick={onClick}>
      <b>{title}</b>
      <span>{preview.charAt(0).toUpperCase() + preview.slice(1)}{type !== 'both' && moves.length > 3 ? ' and more' : ''}</span>
      <small>{story.name}, {count} moves</small>
    </button>
  );
}

function ReminderPrompt() {
  const t = useTimer();
  const { data } = useApp();
  if (!data.settings.notifications || permission() !== 'default') return null;
  return <button className="home-remind" onClick={t.enableNotifications}>Turn on break reminders</button>;
}

export function Home({ tab, setTab, beginBreak, goAdventures }: { tab: SideTab; setTab: (t: SideTab) => void; beginBreak: (type: BreakType) => void; goAdventures: () => void }) {
  const t = useTimer();
  // Shrink the bush + mascot on shorter screens so they don't cover the buttons.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => el.style.setProperty('--home-scale', String(Math.min(1, e.contentRect.height / DESIGN_H))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return (
    <main className="home" ref={ref}>
      <CloudSky />
      <aside className="home-side"><StatsPanel tab={tab} setTab={setTab} /></aside>
      <div className={`home-timer is-${t.status}`}>
        <TimerStatus />
        <div className="home-clock" role="timer" aria-label={`${fmtClock(t.remainingNow)} remaining`}>{fmtClock(t.remainingNow)}</div>
        <div className="home-progress" role="progressbar" aria-label="Focus session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(t.progress * 100)}>
          <i style={{ width: `${t.progress * 100}%` }} />
        </div>
        <div className="home-cards">
          <BreakCard type="activity" title="Begin activity" onClick={() => beginBreak('activity')} />
          <BreakCard type="stretch" title="Begin stretch" onClick={() => beginBreak('stretch')} />
          <BreakCard type="both" title="Activity + stretch" onClick={() => beginBreak('both')} />
        </div>
        <ReminderPrompt />
      </div>
      <div className="home-bush">
        <img className="home-bush-img" src={bush} alt="" />

        <button className="home-mascot-btn" onClick={goAdventures} aria-label="Pick an adventure">
          <img className="home-logo" src={logo} alt="" />
          <span className="home-bubble" aria-hidden>Pick an adventure</span>
        </button>
      </div>
    </main>
  );
}
