// Tiny synthesized sound effects (no audio files needed). Browsers require a user gesture before audio starts,
// which is always true by the time anything here plays except the timer chime, which gracefully no-ops if blocked.
let ctx: AudioContext | null = null;
let enabled = true;
export const setSoundEnabled = (v: boolean) => { enabled = v; };

function ac(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.18, slideTo?: number) {
  const c = ac(); if (!c || !enabled) return;
  const t0 = c.currentTime + start, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}

export const sfx = {
  /** Arm the audio context from a click so later timer chimes can play. */
  unlock() { ac(); },
  tick(i = 0) { tone(520 + i * 70, 0, 0.12, 'triangle', 0.2); },
  chime() { [659, 784, 988].forEach((f, i) => tone(f, i * 0.14, 0.4, 'sine', 0.2)); },
  breakOver() { [988, 784, 659].forEach((f, i) => tone(f, i * 0.14, 0.4, 'sine', 0.2)); },
  success() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.2)); },
  jump() { tone(280, 0, 0.25, 'square', 0.1, 760); },
  duck() { tone(520, 0, 0.22, 'square', 0.1, 200); },
  collect() { tone(880, 0, 0.1, 'sine', 0.2); tone(1320, 0.08, 0.18, 'sine', 0.2); },
  run() { tone(330, 0, 0.12, 'square', 0.08, 440); },
  hit() { tone(180, 0, 0.35, 'sawtooth', 0.2, 60); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.22)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.35, 'sawtooth', 0.12)); },
  unlock_badge() { [784, 988, 1175].forEach((f, i) => tone(f, i * 0.08, 0.25, 'sine', 0.2)); },
};
