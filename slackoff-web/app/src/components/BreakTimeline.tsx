import { useEffect, useState } from 'react';
import { useApp } from '../state/AppState';
import { useTimer } from '../state/TimerContext';
import { fmtClock } from '../lib/dates';

const HOUR = 3_600_000, SPAN_H = 9;
const clockTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** The top strip: hours of the day, with the moments the Pomodoro will send you on a break. */
export function BreakTimeline() {
  const { data } = useApp();
  const t = useTimer();
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick(n => n + 1), 15_000); return () => clearInterval(i); }, []);

  const now = Date.now();
  const s = new Date(now); s.setMinutes(0, 0, 0);
  const start = s.getTime() - HOUR, end = start + SPAN_H * HOUR;
  const pct = (ts: number) => ((ts - start) / (end - start)) * 100;

  const { workSeconds, exerciseSeconds, autoCycle } = data.settings;
  const work = workSeconds * 1000, brk = exerciseSeconds * 1000;
  const first = t.status === 'running' ? t.endAt : t.status === 'paused' ? now + t.remainingMs : now + work;
  const breaks: number[] = [];
  for (let b = first; b < end && breaks.length < 400; b += work + brk) { breaks.push(b); if (!autoCycle) break; }
  const projected = t.status !== 'running';
  const past = data.breaks.filter(b => b >= start && b <= now);

  const label = t.status === 'running' ? `Next break at ${clockTime(first)} · in ${fmtClock(first - now)}`
    : t.status === 'paused' ? `Paused · next break would be at ${clockTime(first)}`
    : `Start the timer and your first break lands at ${clockTime(first)}`;

  return (
    <section className="hour-strip" aria-label="Today's break schedule">
      <div className="hs-head"><b>⏰ Today's break schedule</b><span>{label}</span></div>
      <div className="hs-track">
        {Array.from({ length: SPAN_H + 1 }, (_, i) => {
          const h = start + i * HOUR;
          return <span key={i} className="hs-tick" style={{ left: `${pct(h)}%` }}><i />{i < SPAN_H && <em>{new Date(h).toLocaleTimeString([], { hour: 'numeric' })}</em>}</span>;
        })}
        {breaks.map((b, i) => (
          <span key={i} className={`hs-break ${projected ? 'proj' : ''}`} title={`Break ${clockTime(b)} – ${clockTime(b + brk)}`}
            style={{ left: `${pct(b)}%`, width: `max(7px, ${(brk / (end - start)) * 100}%)` }} />
        ))}
        {past.map((b, i) => <span key={i} className="hs-done" title={`Break completed at ${clockTime(b)}`} style={{ left: `${pct(b)}%` }}>✓</span>)}
        <span className="hs-now" style={{ left: `${pct(now)}%` }}><b>now</b></span>
      </div>
    </section>
  );
}
