import { useEffect, useRef } from 'react';
import { StatsPanel, type SideTab } from '../components/StatsPanel';
import { HomeMascot } from '../components/HomeMascot';
import { useUpcomingBreaks } from '../components/TopBar';
import { useTimer } from '../state/TimerContext';
import { useApp } from '../state/AppState';
import { fmtClock } from '../lib/dates';
import { permission } from '../lib/notify';
import { storyById } from '../data/stories';
import type { BreakType } from '../types';
import clouds from '../assets/home/clouds.png';
import bush from '../assets/home/bush.png';

const DESIGN_H = 918;   // height of the home area in the Figma frame
const clockTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** One line above the clock: what the focus timer is doing, plus the control for it. */
function TimerStatus() {
  const t = useTimer();
  const { breaks } = useUpcomingBreaks();
  const [text, action] = t.status === 'running' ? [`Next break at ${clockTime(breaks[0] ?? t.endAt)}`, { label: 'Pause', fn: t.pause }]
    : t.status === 'paused' ? ['Focus timer paused', { label: 'Resume', fn: t.resume }]
    : ['Ready to focus?', { label: 'Start timer', fn: t.start }];
  return (
    <div className="home-status" aria-live="polite">
      <span>{text}</span>
      <button className="home-status-btn" onClick={action.fn}>{action.label}</button>
    </div>
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
  const { data } = useApp();
  const story = storyById(data.settings.story);
  // Shrink the bush + mascot on shorter screens so they don't cover the buttons.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => el.style.setProperty('--home-scale', String(Math.min(1, e.contentRect.height / DESIGN_H))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return (
    <main className="home" ref={ref}>
      <img className="home-clouds" src={clouds} alt="" />
      <aside className="home-side"><StatsPanel tab={tab} setTab={setTab} /></aside>
      <div className={`home-timer is-${t.status}`}>
        <TimerStatus />
        <div className="home-clock" role="timer" aria-label={`${fmtClock(t.remainingNow)} remaining`}>{fmtClock(t.remainingNow)}</div>
        <button className="home-btn" onClick={() => beginBreak('activity')} title={`Start an activity break: ${story.name}`}>Begin activity</button>
        <button className="home-btn" onClick={() => beginBreak('stretch')} title={`Start a stretch break: ${story.name}`}>Begin stretch</button>
        <button className="home-btn" onClick={t.reset} disabled={t.status === 'idle'}>Reset</button>
        <ReminderPrompt />
      </div>
      <div className="home-bush">
        <img className="home-bush-img" src={bush} alt="" />
        <h1 className="home-title">Slack Off</h1>
        <button className="home-mascot-btn" onClick={goAdventures} aria-label="Pick an adventure">
          <HomeMascot />
          <span className="home-bubble" aria-hidden>Pick an adventure</span>
        </button>
      </div>
    </main>
  );
}
