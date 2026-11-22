import { useEffect, useState } from 'react';
import { useApp } from '../state/AppState';
import { useTimer } from '../state/TimerContext';
import { DurationStepper } from './Controls';
import { Avatar, AVATARS } from './Mascots';
import { EXERCISES, LEVELS } from '../data/exercises';
import { MAPS } from '../data/maps';
import { notify, permission } from '../lib/notify';
import { sfx } from '../lib/sfx';
import type { Level } from '../types';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { data, updateSettings, updateProfile, resetAllData, toast } = useApp();
  const t = useTimer();
  const s = data.settings;
  const [perm, setPerm] = useState(permission());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleActivity = (id: string, on: boolean) => {
    const disabled = on ? s.disabledActivities.filter(x => x !== id) : [...s.disabledActivities, id];
    // Keep at least one activity per level enabled so every intensity has something to offer.
    const lvl = EXERCISES.find(e => e.id === id)!.level;
    if (!on && EXERCISES.filter(e => e.level === lvl && !disabled.includes(e.id)).length === 0) { toast({ emoji: '🙅', title: 'Keep at least one', body: `Level ${lvl} needs an activity.` }); return; }
    updateSettings({ disabledActivities: disabled, pickedActivity: !on && s.pickedActivity === id ? 'random' : s.pickedActivity });
  };

  const onNotifToggle = async (on: boolean) => {
    updateSettings({ notifications: on });
    if (on) { await t.enableNotifications(); setPerm(permission()); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="modal-head"><h2>⚙️ Settings</h2><button className="icon-btn" onClick={onClose} aria-label="Close settings">✕</button></div>
        <div className="modal-body">
          <section>
            <h3>You</h3>
            <label className="field">Display name<input value={data.profile.name} maxLength={18} onChange={e => updateProfile({ name: e.target.value })} /></label>
            <div className="avatar-pick">{AVATARS.map(a => <button key={a} className={data.profile.avatar === a ? 'on' : ''} onClick={() => updateProfile({ avatar: a })} aria-label={`Avatar ${a}`}><Avatar id={a} size={42} /></button>)}</div>
          </section>

          <section>
            <h3>Timer</h3>
            <div className="steppers">
              <DurationStepper label="Work duration" value={s.workSeconds} onChange={v => updateSettings({ workSeconds: v })} />
              <DurationStepper label="Exercise duration" value={s.exerciseSeconds} onChange={v => updateSettings({ exerciseSeconds: v })} />
            </div>
            <label className="switch"><input type="checkbox" checked={s.autoCycle} onChange={e => updateSettings({ autoCycle: e.target.checked })} /><span />Automatic timer cycling</label>
            <label className="field">Exercise intensity
              <select value={s.intensity} onChange={e => updateSettings({ intensity: +e.target.value as Level, pickedActivity: 'random' })}>
                {LEVELS.map(l => <option key={l.level} value={l.level}>Level {l.level} — {l.name}</option>)}
              </select></label>
            <label className="field">Daily movement goal (activities)
              <input type="number" min={1} max={50} value={s.dailyGoal} onChange={e => updateSettings({ dailyGoal: Math.max(1, Math.min(50, Math.round(+e.target.value) || 1)) })} /></label>
          </section>

          <section>
            <h3>Enabled activities</h3>
            {LEVELS.map(l => (
              <div key={l.level} className="act-group"><b>{l.emoji} Level {l.level}</b>
                <div className="checks">{EXERCISES.filter(e => e.level === l.level).map(e => (
                  <label key={e.id} className="check"><input type="checkbox" checked={!s.disabledActivities.includes(e.id)} onChange={ev => toggleActivity(e.id, ev.target.checked)} />{e.name}</label>
                ))}</div></div>
            ))}
          </section>

          <section>
            <h3>Wipeout</h3>
            <label className="field">Preferred map
              <select value={s.preferredMap} onChange={e => updateSettings({ preferredMap: e.target.value })}>
                {MAPS.map(m => <option key={m.id} value={m.id} disabled={!m.playable}>{m.name}{m.playable ? '' : ' (coming soon)'}</option>)}
              </select></label>
          </section>

          <section>
            <h3>Notifications & sound</h3>
            <label className="switch"><input type="checkbox" checked={s.notifications} onChange={e => void onNotifToggle(e.target.checked)} /><span />Browser notifications</label>
            <p className="muted small">
              Permission: <b>{perm === 'unsupported' ? 'not supported in this browser' : perm}</b>
              {perm === 'denied' && ' — allow notifications for this site in your browser settings.'}
            </p>
            <div className="row-wrap">
              <button className="btn secondary" disabled={perm !== 'granted'} onClick={() => void notify('Time to move! 🏃', 'This is how SlackOff will nudge you.', 'slackoff-test')}>Send test notification</button>
              <button className="btn secondary" onClick={() => { sfx.unlock(); sfx.chime(); }} disabled={!s.sound}>▶ Test sound</button>
            </div>
            <label className="switch"><input type="checkbox" checked={s.sound} onChange={e => updateSettings({ sound: e.target.checked })} /><span />Sound effects</label>
          </section>

          <section>
            <h3>Data</h3>
            <p className="muted small">Everything is stored in this browser (localStorage).</p>
            <button className="btn danger" onClick={() => { if (confirm('Erase all your stats, streaks and game history? Settings are kept.')) { resetAllData(); t.reset(); toast({ emoji: '🧹', title: 'Stats cleared' }); } }}>Reset my stats</button>
          </section>
        </div>
      </div>
    </div>
  );
}
