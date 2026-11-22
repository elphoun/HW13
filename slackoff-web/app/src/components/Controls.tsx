import { useApp } from '../state/AppState';
import { EXERCISES, LEVELS } from '../data/exercises';
import type { Level } from '../types';

const STEPS = [15, 30, 45, 60, 120, 180, 300, 420, 600, 900, 1200, 1500, 1800, 2700, 3600, 5400];
export const fmtStep = (s: number) => s < 60 ? `${s} sec` : s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)}m ${s % 60}s`;

export function DurationStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const idx = STEPS.reduce((best, s, i) => Math.abs(s - value) < Math.abs(STEPS[best] - value) ? i : best, 0);
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <div className="stepper-ctl">
        <button aria-label={`Decrease ${label}`} disabled={idx === 0} onClick={() => onChange(STEPS[idx - 1])}>−</button>
        <b>{fmtStep(value)}</b>
        <button aria-label={`Increase ${label}`} disabled={idx === STEPS.length - 1} onClick={() => onChange(STEPS[idx + 1])}>+</button>
      </div>
    </div>
  );
}

const PRESETS = [
  { name: '🍅 Classic', w: 25 * 60, e: 5 * 60 },
  { name: '🌿 Gentle', w: 50 * 60, e: 10 * 60 },
  { name: '⚡ Demo (30s / 15s)', w: 30, e: 15 },
];

export function TimerConfig() {
  const { data, updateSettings } = useApp();
  const s = data.settings;
  return (
    <section className="card config">
      <h3>⏱ Your rhythm</h3>
      <div className="presets">
        {PRESETS.map(p => (
          <button key={p.name} className={`pill ${s.workSeconds === p.w && s.exerciseSeconds === p.e ? 'on' : ''}`} onClick={() => updateSettings({ workSeconds: p.w, exerciseSeconds: p.e })}>{p.name}</button>
        ))}
      </div>
      <div className="steppers">
        <DurationStepper label="Work for" value={s.workSeconds} onChange={v => updateSettings({ workSeconds: v })} />
        <DurationStepper label="Move for" value={s.exerciseSeconds} onChange={v => updateSettings({ exerciseSeconds: v })} />
      </div>
      <label className="switch"><input type="checkbox" checked={s.autoCycle} onChange={e => updateSettings({ autoCycle: e.target.checked })} /><span />Automatically switch between work and breaks</label>
    </section>
  );
}

export function IntensityPicker() {
  const { data, updateSettings } = useApp();
  const s = data.settings;
  const pool = EXERCISES.filter(e => e.level === s.intensity);
  return (
    <section className="card config">
      <h3>💪 Exercise intensity</h3>
      <div className="levels">
        {LEVELS.map(l => (
          <button key={l.level} className={`level l${l.level} ${s.intensity === l.level ? 'on' : ''}`} onClick={() => updateSettings({ intensity: l.level as Level, pickedActivity: 'random' })} aria-pressed={s.intensity === l.level}>
            <span className="lv-emoji">{l.emoji}</span><b>Level {l.level}</b><span>{l.name}</span><small>{l.blurb}</small>
          </button>
        ))}
      </div>
      <div className="act-head">Activities <small>(pick one, or let SlackOff surprise you)</small></div>
      <div className="acts">
        <button className={`pill ${s.pickedActivity === 'random' ? 'on' : ''}`} onClick={() => updateSettings({ pickedActivity: 'random' })}>🎲 Surprise me</button>
        {pool.map(e => {
          const off = s.disabledActivities.includes(e.id);
          return <button key={e.id} disabled={off} title={off ? 'Disabled in settings' : undefined} className={`pill ${s.pickedActivity === e.id ? 'on' : ''}`} onClick={() => updateSettings({ pickedActivity: e.id })}>{e.name}</button>;
        })}
      </div>
    </section>
  );
}
