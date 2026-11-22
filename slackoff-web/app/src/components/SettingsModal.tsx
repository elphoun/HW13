import { useEffect, useState } from 'react';
import { useApp } from '../state/AppState';
import { useTimer } from '../state/TimerContext';
import { DurationStepper, PRESETS } from './Controls';
import { Avatar, AVATARS } from './Mascots';
import { LEVELS } from '../data/exercises';
import { STORIES } from '../data/stories';
import { notify, permission } from '../lib/notify';
import { sfx } from '../lib/sfx';
import { airpods } from '../lib/airpods';
import type { BreakType, Level } from '../types';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { data, updateSettings, updateProfile, resetAllData, toast } = useApp();
  const t = useTimer();
  const s = data.settings;
  const [perm, setPerm] = useState(permission());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [onClose]);

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
            <h3>Your rhythm</h3>
            <div className="presets">
              {PRESETS.map(p => <button key={p.name} className={`pill ${s.workSeconds === p.w && s.exerciseSeconds === p.e ? 'on' : ''}`} onClick={() => updateSettings({ workSeconds: p.w, exerciseSeconds: p.e })}>{p.name}</button>)}
            </div>
            <div className="steppers">
              <DurationStepper label="Work duration" value={s.workSeconds} onChange={v => updateSettings({ workSeconds: v })} />
              <DurationStepper label="Exercise duration" value={s.exerciseSeconds} onChange={v => updateSettings({ exerciseSeconds: v })} />
            </div>
            <label className="switch"><input type="checkbox" checked={s.airpods} onChange={e => updateSettings({ airpods: e.target.checked })} /><span />Count reps with AirPods (when the streamer is running)</label>
            <label className="switch"><input type="checkbox" defaultChecked={airpods.flipUp} onChange={e => airpods.setFlipUp(e.target.checked)} /><span />Flip AirPod up/down (turn on if squats don't count)</label>
            <label className="switch"><input type="checkbox" checked={s.autoCycle} onChange={e => updateSettings({ autoCycle: e.target.checked })} /><span />Automatic timer cycling</label>
            <label className="field">Exercise intensity
              <select value={s.intensity} onChange={e => updateSettings({ intensity: +e.target.value as Level })}>
                {LEVELS.map(l => <option key={l.level} value={l.level}>Level {l.level} — {l.name}</option>)}
              </select>
              <small>Sets how many reps each story scene asks for: level 1 asks for fewer, level 3 for more.</small></label>
            <label className="field">Daily movement goal (activities)
              <input type="number" min={1} max={50} value={s.dailyGoal} onChange={e => updateSettings({ dailyGoal: Math.max(1, Math.min(50, Math.round(+e.target.value) || 1)) })} /></label>
          </section>

          <section>
            <h3>Breaks</h3>
            <label className="field">Story
              <select value={s.story} onChange={e => updateSettings({ story: e.target.value })}>
                {STORIES.map(st => <option key={st.id} value={st.id} disabled={!st.playable}>{st.name}{st.playable ? '' : ' (coming soon)'}</option>)}
              </select>
              <small>Every break plays through this story, one scene at a time.</small></label>
            <label className="field">When a break starts on its own
              <select value={s.breakType} onChange={e => updateSettings({ breakType: e.target.value as BreakType })}>
                <option value="activity">Activity: get moving</option>
                <option value="stretch">Stretch: loosen up</option>
              </select>
              <small>The story stays the same. Only the exercise in each scene changes.</small></label>
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
