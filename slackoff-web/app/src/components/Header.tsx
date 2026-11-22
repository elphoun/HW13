import { useApp } from '../state/AppState';
import { Logo } from './Mascots';
import { useTimer } from '../state/TimerContext';
import { fmtClock } from '../lib/dates';

export type Route = 'home' | 'wipeout';

export function Header({ route, go, openSettings }: { route: Route; go: (r: Route) => void; openSettings: () => void }) {
  const { stats } = useApp();
  const t = useTimer();
  return (
    <header className="topbar">
      <button className="brand" onClick={() => go('home')} aria-label="SlackOff home"><Logo small /></button>
      <nav className="tabs" aria-label="Main">
        <button className={route === 'home' ? 'tab on' : 'tab'} onClick={() => go('home')}>🏠 Home</button>
        <button className={route === 'wipeout' ? 'tab on' : 'tab'} onClick={() => go('wipeout')}>🎮 Wipeout</button>
      </nav>
      <div className="top-right">
        {route !== 'home' && t.status !== 'idle' && (
          <button className="chip mini-timer" onClick={() => go('home')} title="Back to the timer">
            {t.phase === 'work' ? '💼' : '🏃'} {fmtClock(t.remainingNow)}{t.status === 'paused' ? ' ⏸' : ''}
          </button>
        )}
        <span className="chip" title="Points earned this week">⭐ {stats.weeklyPoints} pts</span>
        <button className="icon-btn" onClick={openSettings} aria-label="Settings" title="Settings">⚙️</button>
      </div>
    </header>
  );
}
