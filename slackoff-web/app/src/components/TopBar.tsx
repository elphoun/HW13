import { useEffect, useState } from 'react';
import { useApp } from '../state/AppState';
import { useTimer } from '../state/TimerContext';
import breakDot from '../assets/home/break-dot.svg';

const HOUR = 3_600_000, LOOKBACK = 0.5 * HOUR, SPAN = 4 * HOUR;   // the bar shows 30 min ago to 3.5 h ahead
const clockTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/** Upcoming breaks over the next few hours. Shared by the top bar and the home screen's "next break" line. */
export function useUpcomingBreaks() {
  const { data } = useApp();
  const t = useTimer();
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick(n => n + 1), 15_000); return () => clearInterval(i); }, []);
  const now = Date.now();
  const start = now - LOOKBACK, end = start + SPAN;
  const { workSeconds, exerciseSeconds, autoCycle } = data.settings;
  const work = workSeconds * 1000, brk = exerciseSeconds * 1000;
  const first = t.status === 'running' ? t.endAt : t.status === 'paused' ? now + t.remainingMs : now + work;
  const breaks: number[] = [];
  for (let b = first; b < end && breaks.length < 400; b += work + brk) { breaks.push(b); if (!autoCycle) break; }
  const hours: number[] = [];
  for (let h = Math.ceil(start / HOUR) * HOUR; h < end; h += HOUR) hours.push(h);
  return { breaks, hours, now, pct: (ts: number) => ((ts - start) / (end - start)) * 100 };
}

/** Top bar: your weekly rank on the left, then the next few hours with a dot for every upcoming break. */
export function TopBar({ onShowWeek }: { onShowWeek: () => void }) {
  const { leaderboard, stats } = useApp();
  const { breaks, hours, now, pct } = useUpcomingBreaks();
  const hourLabel = (h: number) => new Date(h).toLocaleTimeString([], { hour: 'numeric' });
  const rank = leaderboard.find(r => r.you)?.rank ?? 0;

  return (
    <header className="topbar">
      <button className="tb-rank" onClick={onShowWeek} title="See this week's leaderboard"
        aria-label={`You're ${ordinal(rank)} this week with ${stats.weeklyPoints} points. Show leaderboard`}>
        <span className={`tb-rank-num r${rank}`}>{rank}</span>
        <span className="tb-rank-pts">{stats.weeklyPoints} pts</span>
      </button>
      <div className="tb-track" role="img" aria-label={breaks.length ? `Breaks at ${breaks.map(clockTime).join(', ')}` : 'No breaks scheduled'}
        style={{ ['--now' as string]: `${pct(now)}%` }}>
        {hours.map(h => <span key={h} className="tb-hour" style={{ left: `${pct(h)}%` }}>{hourLabel(h)}</span>)}
        <span className="tb-now" title={`Now, ${clockTime(now)}`} />
        {breaks.map((b, i) => (
          <span key={i} className="tb-dot" style={{ left: `${pct(b)}%` }}>
            <img src={breakDot} alt="" />
            <span className="tb-tip">Break at {clockTime(b)}</span>
          </span>
        ))}
      </div>
    </header>
  );
}
