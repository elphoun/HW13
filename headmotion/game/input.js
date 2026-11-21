// Tilt-joystick input from the AirPod IMU.
//   stick.x  -1..1   lean left / right
//   stick.y  -1..1   lean back / forward
// Tilt is read from the direction of gravity in the device frame, so it works for any grip.
// Calibration: hold neutral, then lean LEFT, RIGHT, FORWARD, BACK (each held ~0.5s).
const Input = (() => {
  const SAVED = ['flipX', 'flipY', 'sens'];
  const cfg = Object.assign({
    sens: 1,          // <1 = more sensitive (less lean needed), >1 = less sensitive
    deadFrac: 0.15,   // dead zone as a fraction of your calibrated lean
    flipX: false, flipY: false,
    leanMin: 0.18,    // minimum tilt (unit-vector distance, ~10deg) that counts as a lean during calibration
    holdMs: 500,      // how long a pose must be held steady during calibration
  }, JSON.parse(localStorage.getItem('wipeoutCfg4') || '{}'));
  const save = () => localStorage.setItem('wipeoutCfg4', JSON.stringify(Object.fromEntries(SAVED.map(k => [k, cfg[k]]))));

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const norm = a => scale(a, 1 / (len(a) || 1));

  const STEPS = ['neutral', 'left', 'right', 'forward', 'back'];
  const s = { lastPacket: 0, x: 0, y: 0, calStep: null, calNote: '', events: [], keys: {}, win: [], lock: 0, g: [0, -1, 0] };
  let cal = null;      // { neutral, axisX, axisY, halfX, halfY }
  let tmp = {};        // calibration scratch: captured lean vectors

  function stable(now) {
    s.win = s.win.filter(p => now - p.t < cfg.holdMs);
    if (s.win.length < 8 || now - s.win[0].t < cfg.holdMs * 0.8) return null;
    const m = scale(s.win.reduce((a, p) => [a[0] + p.g[0], a[1] + p.g[1], a[2] + p.g[2]], [0, 0, 0]), 1 / s.win.length);
    return s.win.every(p => len(sub(p.g, m)) < 0.05) ? m : null;
  }

  function calibrateSample(now) {
    if (now < s.lock) return;
    const m = stable(now); if (!m) return;
    const step = s.calStep, accept = () => { s.win = []; s.lock = now + 900; s.calNote = ''; s.events.push('calstep'); };
    if (step === 'neutral') { tmp.neutral = m; s.calStep = 'left'; return accept(); }
    const d = sub(m, tmp.neutral);
    if (len(d) < cfg.leanMin) return;                        // not leaning far enough yet
    const u = norm(d);
    if (step === 'left') { tmp.L = d; s.calStep = 'right'; return accept(); }
    if (step === 'right') { if (dot(u, norm(tmp.L)) > -0.3) return; tmp.R = d; s.calStep = 'forward'; return accept(); }
    const ax = norm(sub(tmp.R, tmp.L));
    if (Math.abs(dot(u, ax)) > 0.6) return;                  // forward/back lean should not be sideways
    if (step === 'forward') { tmp.F = d; s.calStep = 'back'; return accept(); }
    if (dot(u, norm(tmp.F)) > -0.3) return;                  // back must be opposite to forward
    tmp.B = d;
    const axisX = norm(sub(tmp.R, tmp.L));
    let fb = sub(tmp.F, tmp.B); fb = sub(fb, scale(axisX, dot(fb, axisX)));
    cal = { neutral: tmp.neutral, axisX, axisY: norm(fb), halfX: len(sub(tmp.R, tmp.L)) / 2, halfY: len(fb) / 2 };
    s.calStep = null; s.win = []; s.events.push('calibrated');
  }

  function onSample(d) {
    const now = performance.now(); s.lastPacket = now;
    if (d.gx === undefined) return;                          // old streamer build: restart it
    const g = norm([d.gx, d.gy, d.gz]); s.g = g;
    s.win.push({ t: now, g });
    if (s.calStep) return calibrateSample(now);
    if (!cal) return;
    const dd = sub(g, cal.neutral), ramp = (v, h) => {
      const a = Math.abs(v) / (h * cfg.sens), dead = cfg.deadFrac;
      return Math.sign(v) * Math.min(1, Math.max(0, (a - dead) / (1 - dead)));
    };
    s.x = ramp(dot(dd, cal.axisX), cal.halfX) * (cfg.flipX ? -1 : 1);
    s.y = ramp(dot(dd, cal.axisY), cal.halfY) * (cfg.flipY ? -1 : 1);
  }

  const connected = () => performance.now() - s.lastPacket < 600;
  const es = new EventSource('/events');
  es.onmessage = e => { try { onSample(JSON.parse(e.data)); } catch (_) {} };

  // Final stick value = AirPod tilt, overridden by the keyboard when keys are held.
  function stick() {
    let x = connected() ? s.x : 0, y = connected() ? s.y : 0;
    const k = s.keys;
    if (k.ArrowLeft || k.KeyA) x = -1; if (k.ArrowRight || k.KeyD) x = 1;
    if (k.ArrowUp || k.KeyW) y = 1; if (k.ArrowDown || k.KeyS) y = -1;
    return { x, y };
  }

  addEventListener('keydown', e => {
    s.keys[e.code] = true;
    if (e.repeat) return;
    if (e.code === 'KeyF') { cfg.flipX = !cfg.flipX; save(); }
    if (e.code === 'KeyG') { cfg.flipY = !cfg.flipY; save(); }
    if (e.code === 'Comma') { cfg.sens = Math.max(0.4, +(cfg.sens - 0.1).toFixed(2)); save(); }    // more sensitive
    if (e.code === 'Period') { cfg.sens = Math.min(2.5, +(cfg.sens + 0.1).toFixed(2)); save(); }   // less sensitive
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', e => { s.keys[e.code] = false; });

  return { s, cfg, stick, connected, hasCal: () => !!cal, STEPS,
           beginCalibration() { s.calStep = 'neutral'; s.calNote = ''; s.win = []; s.lock = performance.now() + 600; tmp = {}; s.events.length = 0; },
           cancelCalibration() { s.calStep = null; },
           takeEvents: () => s.events.splice(0) };
})();
