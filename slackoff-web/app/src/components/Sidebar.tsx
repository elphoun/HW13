import { useApp } from '../state/AppState';
import { Avatar } from './Mascots';
import { WeeklyChart } from './WeeklyChart';
import { ACHIEVEMENTS } from '../data/achievements';
import { fmtDuration, nextResetLabel } from '../lib/dates';
import { nextResetMs } from '../lib/rivals';

function GoalRing({ value, goal }: { value: number; goal: number }) {
  const r = 30, c = 2 * Math.PI * r, pct = Math.min(1, value / Math.max(1, goal));
  return (
    <div className="ring" role="img" aria-label={`${value} of ${goal} activities today`}>
      <svg viewBox="0 0 80 80" width="84" height="84">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e8e9f6" strokeWidth="9" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={pct >= 1 ? '#2fbf4a' : '#ff6b3d'} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 40 40)" style={{ transition: 'stroke-dashoffset .6s' }} />
      </svg>
      <div className="ring-num"><b>{value}</b><small>/ {goal}</small></div>
    </div>
  );
}

function Stat({ emoji, label, value }: { emoji: string; label: string; value: string | number }) {
  return <div className="stat"><span className="stat-emoji">{emoji}</span><b>{value}</b><small>{label}</small></div>;
}

function Leaderboard() {
  const { leaderboard, resetLeaderboard, toast } = useApp();
  const youIdx = leaderboard.findIndex(r => r.you);
  const top = leaderboard.slice(0, 5);
  const shown = youIdx >= 5 ? [...top, leaderboard[youIdx]] : top;
  return (
    <section className="card leaderboard">
      <h3>🏆 Weekly leaderboard</h3>
      <ol>
        {shown.map((r, i) => (
          <li key={r.name + r.rank} className={r.you ? 'me' : ''} style={youIdx >= 5 && i === 5 ? { marginTop: 8 } : undefined}>
            <span className={`rank r${r.rank}`}>{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
            <Avatar id={r.avatar} size={30} />
            <span className="lb-name">{r.you && r.name !== 'You' ? `${r.name} (you)` : r.name}</span>
            <b>{r.points}</b>
          </li>
        ))}
      </ol>
      <div className="lb-foot">
        <small className="muted">Resets in {nextResetLabel(nextResetMs(Date.now()) - Date.now())}</small>
        <button className="link-btn" onClick={() => { if (confirm('Start a fresh leaderboard week now? Your weekly points go back to 0.')) { resetLeaderboard(); toast({ emoji: '🔄', title: 'New leaderboard week', body: 'Everyone starts fresh.' }); } }}>Reset week</button>
      </div>
    </section>
  );
}

export function Sidebar() {
  const { data, stats } = useApp();
  const goal = data.settings.dailyGoal;
  const unlocked = ACHIEVEMENTS.filter(a => data.achievements[a.id]).length;
  return (
    <aside className="sidebar">
      <section className="card profile">
        <Avatar id={data.profile.avatar} size={58} ring />
        <div className="profile-text">
          <b>{data.profile.name || 'You'}</b>
          <span>{stats.totalPoints} points all-time</span>
        </div>
        <div className="streak" title="Consecutive days with at least one activity">🔥 <b>{stats.streak}</b><small>day streak</small></div>
      </section>

      <section className="card">
        <h3>📊 Your stats</h3>
        <div className="today-row">
          <GoalRing value={stats.today} goal={goal} />
          <div><b>{stats.today >= goal ? 'Goal smashed! 🎉' : "Today's movement"}</b><p className="muted small">{stats.today >= goal ? 'Keep going for bonus glory.' : `${goal - stats.today} more to hit your daily goal`}</p></div>
        </div>
        <div className="stats-grid">
          <Stat emoji="✅" label="Activities" value={stats.totalActivities} />
          <Stat emoji="☕" label="Breaks" value={stats.totalBreaks} />
          <Stat emoji="⏱" label="Exercising" value={fmtDuration(stats.totalSeconds)} />
          <Stat emoji="📅" label="Today" value={stats.today} />
        </div>
      </section>

      <WeeklyChart />
      <Leaderboard />

      <section className="card">
        <h3>🎖 Achievements <small className="muted">{unlocked}/{ACHIEVEMENTS.length}</small></h3>
        <div className="badges">
          {ACHIEVEMENTS.map(a => (
            <span key={a.id} className={`badge ${data.achievements[a.id] ? 'on' : ''}`} title={`${a.name}: ${a.desc}`}>
              <span>{data.achievements[a.id] ? a.emoji : '🔒'}</span><small>{a.name}</small>
            </span>
          ))}
        </div>
      </section>
    </aside>
  );
}
