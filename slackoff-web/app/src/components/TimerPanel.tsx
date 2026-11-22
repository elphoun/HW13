import { useTimer } from '../state/TimerContext';
import { useApp } from '../state/AppState';
import { fmtClock } from '../lib/dates';
import { permission } from '../lib/notify';

export function TimerPanel() {
  const t = useTimer();
  const { data } = useApp();
  const working = t.phase === 'work';
  const perm = permission();
  const primary = t.status === 'running' ? { label: '⏸ Pause', fn: t.pause }
    : t.status === 'paused' ? { label: '▶ Resume', fn: t.resume }
    : { label: working ? '▶ Start working' : '🏃 Begin your break', fn: t.start };
  return (
    <div className={`timer-panel ${working ? 'is-work' : 'is-move'}`}>
      <div className="phase-pill">{working ? '💼 Working' : '🏃 Move time!'}{t.status === 'paused' && ' · paused'}</div>
      <div className="clock" role="timer" aria-label={`${fmtClock(t.remainingNow)} remaining`}>{fmtClock(t.remainingNow)}</div>
      <div className="progress" aria-hidden><i style={{ width: `${t.progress * 100}%` }} /></div>
      <div className="progress-cap">{t.status === 'idle' ? (working ? 'Ready when you are' : 'Break is waiting for you!') : `${Math.round(t.progress * 100)}% done`}</div>
      <div className="controls">
        <button className="btn primary big" onClick={primary.fn}>{primary.label}</button>
        <div className="row">
          <button className="btn secondary" onClick={t.reset}>↺ Reset</button>
          <button className="btn ghost" onClick={t.skip} title="Jump straight to your Wipeout break">⏭ Skip to break</button>
        </div>
      </div>
      {data.settings.notifications && perm === 'default' && <button className="link-btn" onClick={t.enableNotifications}>🔔 Turn on break reminders</button>}
      {data.settings.notifications && perm === 'denied' && <div className="hint">🔕 Notifications are blocked in your browser. Allow them in site settings to get reminders.</div>}
      {data.settings.notifications && perm === 'granted' && <div className="hint ok">🔔 We'll notify you when it's time to move.</div>}
    </div>
  );
}
