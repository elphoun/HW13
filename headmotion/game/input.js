// Tilt-joystick input from the AirPod IMU.
//   stick.x  -1..1   lean left / right
//   stick.y  -1..1   lean back / forward
// Tilt is read from the direction of gravity in the device frame, so it works for any grip.
// Calibration: hold neutral, then lean LEFT, RIGHT, FORWARD, BACK (each held ~0.5s).
// Dead zone: a circle around neutral where the stick reads exactly 0 (craft stands still). Its radius is
// the larger of cfg.deadFrac and the hand jitter measured while holding neutral (x cfg.noiseK).
const Input = (() => {
  const SAVED = ['flipX', 'flipY', 'sens', 'deadFrac'];
  const cfg = Object.assign({
    sens: 1,          // <1 = more sensitive (less lean needed), >1 = less sensitive
    deadFrac: 0.2,    // minimum dead-zone radius as a fraction of your calibrated lean
    noiseK: 3,        // dead zone also covers this many times the jitter measured while holding neutral
    flipX: false, flipY: false,
    leanMin: 0.12,    // minimum tilt (unit-vector distance, ~7deg) that counts as a lean during calibration
    holdMs: 500,      // how long a pose must be held steady during calibration
  }, JSON.parse(localStorage.getItem('wipeoutCfg4') || '{}'));
  const save = () => localStorage.setItem('wipeoutCfg4', JSON.stringify(Object.fromEntries(SAVED.map(k => [k, cfg[k]]))));

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const norm = a => scale(a, 1 / (len(a) || 1));

  const STEPS = ['neutral', 'left', 'right', 'forward', 'back'];
  const s = { lastPacket: 0, x: 0, y: 0, rx: 0, ry: 0, dead: 0, tilt: 0, trail: [], calStep: null, calNote: '', calHint: '', events: [], keys: {}, win: [], lock: 0, g: [0, -1, 0] };
  let cal = null;      // { neutral, axisX, axisY, halfX, halfY, noise, pts }
  let tmp = {};        // calibration scratch: captured lean vectors

  function stable(now) {
    s.win = s.win.filter(p => now - p.t < cfg.holdMs);
    if (s.win.length < 8 || now - s.win[0].t < cfg.holdMs * 0.8) return null;
    const m = scale(s.win.reduce((a, p) => [a[0] + p.g[0], a[1] + p.g[1], a[2] + p.g[2]], [0, 0, 0]), 1 / s.win.length);
    return s.win.every(p => len(sub(p.g, m)) < 0.05) ? m : null;
  }

  function calibrateSample(now) {
    if (now < s.lock) return;
    const m = stable(now);
    if (!m) { s.calHint = s.win.length > 3 ? 'Hold steady…' : ''; return; }
    const step = s.calStep, accept = () => { s.win = []; s.lock = now + 900; s.calNote = ''; s.calHint = ''; s.events.push('calstep'); };
    if (step === 'neutral') {
      tmp.neutral = m; tmp.noise = Math.max(...s.win.map(p => len(sub(p.g, m))));
      s.calStep = 'left'; return accept();
    }
    const d = sub(m, tmp.neutral);
    if (len(d) < cfg.leanMin) { s.calHint = 'Lean a bit further'; return; }   // not leaning far enough yet
    const u = norm(d);
    if (step === 'left') { tmp.L = d; s.calStep = 'right'; return accept(); }
    if (step === 'right') {
      if (len(sub(d, tmp.L)) < 0.2) { s.calHint = 'Too close to your LEFT lean. Lean further to the RIGHT.'; return; }
      tmp.R = d; s.calStep = 'forward'; return accept();
    }
    const ax = norm(sub(tmp.R, tmp.L));
    if (Math.abs(dot(u, ax)) > 0.6) { s.calHint = 'Lean straight ' + step + ', not sideways.'; return; }   // forward/back should not be sideways
    for (const k of ['L', 'R']) if (len(sub(d, tmp[k])) < 0.2) { s.calHint = `Too close to your ${k === 'L' ? 'LEFT' : 'RIGHT'} lean. Lean straight ${step}.`; return; }
    if (step === 'forward') { tmp.F = d; s.calStep = 'back'; return accept(); }
    if (len(sub(d, tmp.F)) < 0.2) { s.calHint = 'Too close to your FORWARD lean. Lean further BACK.'; return; }   // back must differ from forward
    tmp.B = d;
    const axisX = norm(sub(tmp.R, tmp.L));
    let fb = sub(tmp.F, tmp.B); fb = sub(fb, scale(axisX, dot(fb, axisX)));
    const axisY = norm(fb), lim = v => Math.max(0.06, v);
    // Fit one linear map (stick = M . tiltOffset) that sends YOUR four calibrated leans to their own points:
    // left->(-1,0) right->(1,0) forward->(0,1) back->(0,-1). Least squares, so skewed or uneven leans still map cleanly,
    // and a left lean no longer reads as forward just because your motion wasn't perfectly perpendicular.
    const P = [tmp.L, tmp.R, tmp.F, tmp.B];
    const fit = T => {
      const A = [[1e-4, 0, 0], [0, 1e-4, 0], [0, 0, 1e-4]], bv = [0, 0, 0];
      P.forEach((p, k) => { for (let r = 0; r < 3; r++) { bv[r] += T[k] * p[r]; for (let c = 0; c < 3; c++) A[r][c] += p[r] * p[c]; } });
      return solve3(A, bv);
    };
    const mx = fit([-1, 1, 0, 0]), my = fit([0, 0, 1, -1]);
    // Then scale each direction to how far YOU leaned that way, so a smaller lean on one side still reaches full (+-1).
    const ext = v => Math.max(0.05, v);
    const xL = ext(-dot(mx, tmp.L)), xR = ext(dot(mx, tmp.R)), yB = ext(-dot(my, tmp.B)), yF = ext(dot(my, tmp.F));
    cal = { neutral: tmp.neutral, noise: tmp.noise, axisX, axisY, halfX: len(sub(tmp.R, tmp.L)) / 2, halfY: len(fb) / 2,
            mx, my, xL, xR, yB, yF, gain: Math.max(len(mx) / Math.min(xL, xR), len(my) / Math.min(yB, yF)),
            pts: { L: tmp.L, R: tmp.R, F: tmp.F, B: tmp.B } };
    s.calStep = null; s.win = []; s.events.push('calibrated');
  }

  function solve3(A, b) {                                  // solve a 3x3 linear system (Cramer's rule)
    const det3 = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det3(A) || 1e-9;
    return [0, 1, 2].map(c => det3(A.map((row, r) => row.map((v, k) => k === c ? b[r] : v))) / D);
  }
  // Tilt offset (from neutral) -> raw stick, where +-1 = your calibrated full lean. No dead zone applied.
  function project(d) {
    const cx = dot(cal.mx, d), cy = dot(cal.my, d);
    return [cx / (cx < 0 ? cal.xL : cal.xR) / cfg.sens * (cfg.flipX ? -1 : 1),
            cy / (cy < 0 ? cal.yB : cal.yF) / cfg.sens * (cfg.flipY ? -1 : 1)];
  }
  // Dead-zone radius in raw stick units (hand jitter measured at neutral, converted to stick units).
  const deadRadius = () => !cal ? cfg.deadFrac :
    Math.min(0.6, Math.max(cfg.deadFrac, cfg.noiseK * cal.noise * cal.gain / cfg.sens));

  function onSample(d) {
    const now = performance.now(); s.lastPacket = now;
    if (d.gx === undefined) return;                          // old streamer build: restart it
    const g = norm([d.gx, d.gy, d.gz]); s.g = g;
    s.win.push({ t: now, g });
    if (s.calStep) return calibrateSample(now);
    s.win = s.win.filter(p => now - p.t < cfg.holdMs);
    if (!cal) return;
    const [rx, ry] = project(sub(g, cal.neutral)), r = Math.hypot(rx, ry), dz = deadRadius();
    s.rx = rx; s.ry = ry; s.dead = dz;
    s.tilt = Math.acos(Math.max(-1, Math.min(1, dot(g, cal.neutral)))) * 180 / Math.PI;
    s.trail.push([rx, ry]); if (s.trail.length > 90) s.trail.shift();
    if (r <= dz) { s.x = s.y = 0; return; }                  // inside the dead zone: stand still
    const k = Math.min(1, (r - dz) / (1 - dz)) / r;          // scaled radial: 0 at the edge, 1 at full lean
    const clamp = v => Math.max(-1, Math.min(1, v));
    s.x = clamp(rx * k); s.y = clamp(ry * k);
  }

  // Re-zero neutral to the current pose (fixes drift without a full recalibration).
  function recenter() {
    const now = performance.now(), w = s.win.filter(p => now - p.t < 250);
    if (!cal || !w.length) return false;
    cal.neutral = norm(scale(w.reduce((a, p) => [a[0] + p.g[0], a[1] + p.g[1], a[2] + p.g[2]], [0, 0, 0]), 1 / w.length));
    s.trail = []; return true;
  }

  // 2D view of a tilt offset d (from a reference pose) in the plane perpendicular to that pose. Used by the debug menu.
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function planeBasis(r) { const h = Math.abs(r[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], u = norm(cross(h, r)); return [u, cross(r, u)]; }
  const planeOf = (d, r) => { const [u, v] = planeBasis(r); return [dot(d, u), dot(d, v)]; };

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
    if (e.code === 'KeyC') recenter();
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', e => { s.keys[e.code] = false; });

  return { s, cfg, save, stick, connected, getTmp: () => tmp, planeOf, hasCal: () => !!cal, getCal: () => cal, project, deadRadius, recenter, STEPS,
           beginCalibration() { s.calStep = 'neutral'; s.calNote = ''; s.win = []; s.lock = performance.now() + 600; tmp = {}; s.events.length = 0; },
           cancelCalibration() { s.calStep = null; },
           takeEvents: () => s.events.splice(0) };
})();
