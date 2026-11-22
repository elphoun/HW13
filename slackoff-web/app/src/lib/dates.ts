export const DAY_MS = 86_400_000;
export const startOfDay = (t: number | Date) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Monday 00:00 local time of the week containing t. */
export const startOfWeek = (t: number | Date) => { const d = new Date(startOfDay(t)); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.getTime(); };
export const addDays = (t: number, n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const fmtClock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
export const fmtDuration = (sec: number) => {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60); if (m < 60) return `${m}m ${sec % 60 ? (sec % 60) + 's' : ''}`.trim();
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const nextResetLabel = (ms: number) => { const h = Math.floor(ms / 3_600_000); return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`; };
/** Next Monday 00:00 local time, when the weekly leaderboard starts over. */
export const nextResetMs = (now: number) => addDays(startOfWeek(now), 7);
