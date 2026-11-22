import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../state/AppState';
import { nextResetLabel, startOfDay } from '../lib/dates';
import { nextResetMs } from '../lib/rivals';
import { computeAverages } from '../lib/stats';
import { Avatar } from './Mascots';

export type SideTab = 'today' | 'week';

const ICONS: Record<string, ReactNode> = {
  check: <><circle cx="12" cy="12" r="9" stroke="#8a9e80" strokeWidth="1.8" /><path d="m8 12.2 2.7 2.6L16 9.6" stroke="#8a9e80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>,
  drop: <path d="M12 3.5c3 3.6 5.5 7 5.5 10.1a5.5 5.5 0 0 1-11 0C6.5 10.5 9 7.1 12 3.5z" stroke="#a9d08e" strokeWidth="1.8" strokeLinejoin="round" />,
  flame: <path d="M12 3.5c3.2 3.3 5.2 6.2 5.2 9.2A5.2 5.2 0 0 1 12 18a5.2 5.2 0 0 1-5.2-5.4c0-2 1-3.8 2.5-5.3.3 1.6 1 2.5 2 2.7C11 8 11.2 5.7 12 3.5z" fill="#e9b54f" />,
  cup: <path d="M5 8h10.5v5.5a4.5 4.5 0 0 1-4.5 4.5h-1.5A4.5 4.5 0 0 1 5 13.5zm10.5 1.5h1.8a2 2 0 0 1 0 4h-1.9" stroke="#e0937b" strokeWidth="1.8" strokeLinejoin="round" />,
};

function Row({ icon, label, value }: { icon: keyof typeof ICONS; label: string; value: string }) {
  return (
    <li className="sp-row">
      <svg className="sp-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden>{ICONS[icon]}</svg>
      <span className="sp-text"><span className="sp-label">{label}</span><b className="sp-value">{value}</b></span>
    </li>
  );
}

/** Whole numbers stay whole; everything else gets one decimal. */
const num = (n: number) => (Number.isInteger(Math.round(n * 10) / 10) ? String(Math.round(n * 10) / 10) : (Math.round(n * 10) / 10).toFixed(1));
function AvgRow({ label, value }: { label: string; value: string }) {
  return <li className="sp-avgrow"><span>{label}</span><b>{value}</b></li>;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Today() {
  const { data, stats } = useApp();
  const avg = computeAverages(data);
  const today0 = startOfDay(Date.now());
  const focus = data.sessions.filter(s => s.kind === 'work' && s.completed && s.ts >= today0).length;
  const activeMin = Math.round(data.completions.filter(c => c.ts >= today0).reduce((sum, c) => sum + c.seconds, 0) / 60);
  const breaks = data.breaks.filter(b => b >= today0).length;
  return (
    <>
      <ul className="sp-list">
        <Row icon="check" label="Focus sessions" value={`${focus} today`} />
        <Row icon="drop" label="Active minutes" value={`${activeMin} min`} />
        <Row icon="flame" label="Current streak" value={plural(stats.streak, 'day')} />
        <Row icon="cup" label="Breaks taken" value={`${breaks} today`} />
      </ul>
      <ul className="sp-avg" aria-label="Averages">
        <AvgRow label="Daily avg · activities" value={num(avg.dailyActivities)} />
        <AvgRow label="Daily avg · active min" value={`${num(avg.dailyMinutes)} min`} />
        <AvgRow label="Daily avg · breaks" value={num(avg.dailyBreaks)} />
        <AvgRow label="Daily avg · focus sessions" value={num(avg.dailyFocus)} />
        <AvgRow label="Activities this month" value={String(avg.thisMonth)} />
        <AvgRow label="Monthly avg · activities" value={num(avg.monthlyActivities)} />
      </ul>
    </>
  );
}

function Week() {
  const { leaderboard, resetLeaderboard, toast } = useApp();
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { if (!confirming) return; const t = setTimeout(() => setConfirming(false), 5000); return () => clearTimeout(t); }, [confirming]);
  const youIdx = leaderboard.findIndex(r => r.you);
  const shown = youIdx >= 5 ? [...leaderboard.slice(0, 4), leaderboard[youIdx]] : leaderboard.slice(0, 5);
  return (
    <div className="lb">
      <ol className="lb-list">
        {shown.map((r, i) => (
          <li key={r.name + r.rank} className={`lb-row${r.you ? ' me' : ''}${youIdx >= 5 && i === 4 ? ' gap' : ''}`}>
            <span className={`lb-rank r${r.rank}`} aria-label={`Rank ${r.rank}`}>{r.rank}</span>
            <Avatar id={r.avatar} size={28} />
            <span className="lb-name">{r.you ? 'You' : r.name}</span>
            <b className="lb-pts">{r.points}</b>
          </li>
        ))}
      </ol>
      <div className="lb-foot">
        {confirming ? (
          <>
            <span>Points go back to 0.</span>
            <span className="lb-actions">
              <button className="lb-link" onClick={() => setConfirming(false)}>Keep</button>
              <button className="lb-link strong" onClick={() => { resetLeaderboard(); setConfirming(false); toast({ emoji: '🔄', title: 'Week reset', body: 'Everyone starts from 0.' }); }}>Reset</button>
            </span>
          </>
        ) : (
          <>
            <span>Resets in {nextResetLabel(nextResetMs(Date.now()) - Date.now())}</span>
            <button className="lb-link" onClick={() => setConfirming(true)}>Reset week</button>
          </>
        )}
      </div>
    </div>
  );
}

/** Dark sidebar panel: today's numbers, or this week's leaderboard. */
export function StatsPanel({ tab, setTab }: { tab: SideTab; setTab: (t: SideTab) => void }) {
  return (
    <section className="stats-panel">
      <div className="sp-tabs" role="tablist" aria-label="Stats">
        <button role="tab" id="sp-tab-today" aria-selected={tab === 'today'} aria-controls="sp-body" className="sp-tab" onClick={() => setTab('today')}>Today</button>
        <button role="tab" id="sp-tab-week" aria-selected={tab === 'week'} aria-controls="sp-body" className="sp-tab" onClick={() => setTab('week')}>This week</button>
      </div>
      <div id="sp-body" role="tabpanel" aria-labelledby={tab === 'today' ? 'sp-tab-today' : 'sp-tab-week'} className="sp-body">
        {tab === 'today' ? <Today /> : <Week />}
      </div>
    </section>
  );
}
