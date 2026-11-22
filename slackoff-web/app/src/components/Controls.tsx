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

export const PRESETS = [
  { name: '🍅 Classic (25 / 5 min)', w: 25 * 60, e: 5 * 60 },
  { name: '🌿 Gentle (50 / 10 min)', w: 50 * 60, e: 10 * 60 },
  { name: '⚡ Demo (30s / 15s)', w: 30, e: 15 },
];
