import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../state/AppState';
import { nextResetLabel, nextResetMs, startOfDay } from '../lib/dates';
import { computeAverages } from '../lib/stats';
import { Avatar } from './Mascots';

/** Which sidebar section is open. Only one at a time, so the list stays short (the bush sits below it). */
export type SideTab = 'today' | 'averages' | 'week' | null;

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const ICONS: Record<string, ReactNode> = {
  sun: <g {...stroke}><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></g>,
  trophy: <g {...stroke}><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7" /></g>,
  check: <g {...stroke}><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12.2 2.5 2.4 4.9-5" /></g>,
  drop: <g {...stroke}><path d="M12 3.5c3 3.6 5.5 7 5.5 10.1a5.5 5.5 0 0 1-11 0C6.5 10.5 9 7.1 12 3.5z" /></g>,
  flame: <g {...stroke}><path d="M12 3.5c3.2 3.3 5.2 6.2 5.2 9.2A5.2 5.2 0 0 1 12 18a5.2 5.2 0 0 1-5.2-5.4c0-2 1-3.8 2.5-5.3.3 1.6 1 2.5 2 2.7C11 8 11.2 5.7 12 3.5z" /></g>,
  cup: <g {...stroke}><path d="M5 8h10.5v5.5a4.5 4.5 0 0 1-4.5 4.5h-1.5A4.5 4.5 0 0 1 5 13.5zm10.5 1.5h1.8a2 2 0 0 1 0 4h-1.9" /></g>,
  bars: <g {...stroke}><path d="M6 18v-5M12 18V7M18 18v-8" /></g>,
  calendar: <g {...stroke}><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></g>,
  clock: <g {...stroke}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></g>,
  reset: <g {...stroke}><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.5H8" /></g>,
};
const Icon = ({ name }: { name: keyof typeof ICONS }) => <svg className="sb-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>{ICONS[name]}</svg>;

function Section({ id, icon, title, open, onToggle, children }: { id: string; icon: keyof typeof ICONS; title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="sb-section">
      <button className="sb-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <svg className={`sb-caret${open ? ' open' : ''}`} viewBox="0 0 12 12" width="12" height="12" aria-hidden><path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <Icon name={icon} />
        <span>{title}</span>
      </button>
      {open && <div id={id} className="sb-items">{children}</div>}
    </section>
  );
}

const Row = ({ icon, label, value }: { icon: keyof typeof ICONS; label: string; value: string | number }) => (
  <li className="sb-row"><Icon name={icon} /><span className="sb-label">{label}</span><span className="sb-value">{value}</span></li>
);

function Today() {
  const { data, stats } = useApp();
  const today0 = startOfDay(Date.now());
  const focus = data.sessions.filter(s => s.kind === 'work' && s.completed && s.ts >= today0).length;
  const activeMin = Math.round(data.completions.filter(c => c.ts >= today0).reduce((sum, c) => sum + c.seconds, 0) / 60);
  const breaks = data.breaks.filter(b => b >= today0).length;
  return (
    <ul className="sb-list">
      <Row icon="check" label="Focus sessions" value={focus} />
      <Row icon="drop" label="Active minutes" value={activeMin} />
      <Row icon="flame" label="Streak" value={`${stats.streak} ${stats.streak === 1 ? 'day' : 'days'}`} />
      <Row icon="cup" label="Breaks taken" value={breaks} />
    </ul>
  );
}

/** Whole numbers stay whole; everything else gets one decimal. */
const num = (n: number) => { const r = Math.round(n * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };

/** Averages over the last 30 days (or since you started), plus this month. */
function Averages() {
  const { data } = useApp();
  const avg = computeAverages(data);
  return (
    <>
      <p className="sb-note">{avg.days === 1 ? 'Per day, so far just today' : `Per day, last ${avg.days} days`}</p>
      <ul className="sb-list">
        <Row icon="check" label="Focus sessions" value={num(avg.dailyFocus)} />
        <Row icon="drop" label="Active minutes" value={num(avg.dailyMinutes)} />
        <Row icon="bars" label="Activities" value={num(avg.dailyActivities)} />
        <Row icon="cup" label="Breaks" value={num(avg.dailyBreaks)} />
      </ul>
      <p className="sb-note">Activities by month</p>
      <ul className="sb-list">
        <Row icon="calendar" label="This month" value={avg.thisMonth} />
        <Row icon="bars" label="Monthly average" value={num(avg.monthlyActivities)} />
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
    <>
      <ol className="sb-list">
        {shown.map((r, i) => (
          <li key={r.name + r.rank} className={`sb-row lb${r.you ? ' me' : ''}${youIdx >= 5 && i === 4 ? ' gap' : ''}`}>
            <span className={`sb-rank r${r.rank}`} aria-label={`Rank ${r.rank}`}>{r.rank}</span>
            <Avatar id={r.avatar} size={20} />
            <span className="sb-label">{r.you ? 'You' : r.name}</span>
            <span className="sb-value">{r.points}</span>
          </li>
        ))}
      </ol>
      <ul className="sb-list sb-foot">
        <li className="sb-row muted"><Icon name="clock" /><span className="sb-label">Resets in {nextResetLabel(nextResetMs(Date.now()) - Date.now())}</span></li>
        <li>
          {confirming ? (
            <div className="sb-row confirm">
              <Icon name="reset" /><span className="sb-label">Your points go back to 0</span>
              <button className="sb-mini" onClick={() => setConfirming(false)}>Keep</button>
              <button className="sb-mini danger" onClick={() => { resetLeaderboard(); setConfirming(false); toast({ emoji: '🔄', title: 'Week reset', body: 'Your points this week start from 0.' }); }}>Reset</button>
            </div>
          ) : (
            <button className="sb-row sb-btn muted" onClick={() => setConfirming(true)}><Icon name="reset" /><span className="sb-label">Reset my week</span></button>
          )}
        </li>
      </ul>
    </>
  );
}

/** Slack-style sidebar: collapsible sections for today's numbers and this week's leaderboard. */
export function StatsPanel({ tab, setTab }: { tab: SideTab; setTab: (t: SideTab) => void }) {
  const toggle = (t: Exclude<SideTab, null>) => setTab(tab === t ? null : t);
  return (
    <nav className="stats-panel" aria-label="Your stats">
      <Section id="sb-today" icon="sun" title="Today" open={tab === 'today'} onToggle={() => toggle('today')}><Today /></Section>
      <Section id="sb-avg" icon="bars" title="Averages" open={tab === 'averages'} onToggle={() => toggle('averages')}><Averages /></Section>
      <hr className="sb-divider" />
      <Section id="sb-week" icon="trophy" title="This week" open={tab === 'week'} onToggle={() => toggle('week')}><Week /></Section>
    </nav>
  );
}
