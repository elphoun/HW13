// Tilt-joystick input from the AirPod IMU.
//   stick.x  -1..1   lean left / right
//   stick.y  -1..1   lean back / forward
// Tilt is read from the direction of gravity in the device frame, so it works for any grip.
// Calibration: hold neutral, then lean LEFT, RIGHT, FORWARD, BACK (each held ~0.5s).
// Dead zone: a circle around neutral where the stick reads exactly 0 (craft stands still). Its radius is
// the larger of cfg.deadFrac and the hand jitter measured while holding neutral (x cfg.noiseK).
// Jump: Space, an AirPod stem press (streamer run with --stem), or a physical LIFT of the AirPod.
// Lift is measured by X/Y motion tracking: user acceleration is split into world-vertical (Y) and sideways (X)
// using the gravity vector, bias-removed and double-integrated with a leak so drift returns to 0.
// A jump fires when Y rises past cfg.jumpLift (metres) while still moving up.
const Input = (() => {
  const SAVED = ['flipX', 'flipY', 'sens', 'deadFrac', 'physJump', 'jumpLift', 'liftFlip'];
  const cfg = Object.assign({
    sens: 1,          // <1 = more sensitive (less lean needed), >1 = less sensitive
    deadFrac: 0.2,    // minimum dead-zone radius as a fraction of your calibrated lean
    noiseK: 3,        // dead zone also covers this many times the jitter measured while holding neutral
    flipX: false, flipY: false,
    leanMin: 0.12,    // minimum tilt (unit-vector distance, ~7deg) that counts as a lean during calibration
    holdMs: 500,      // how long a pose must be held steady during calibration
    physJump: true,   // lifting the AirPod triggers a jump
    jumpLift: 0.15,   // metres of upward lift that count as a jump
    liftFlip: false,  // invert the vertical axis if lifting reads as negative Y
    leak: 1.0,        // seconds: X/Y position and velocity decay toward 0 with this time constant (kills drift)
    jumpBufferMs: 150 // a jump pressed slightly before landing still counts
  }, JSON.parse(localStorage.getItem('wipeoutCfg4') || '{}'));
  const save = () => localStorage.setItem('wipeoutCfg4', JSON.stringify(Object.fromEntries(SAVED.map(k => [k, cfg[k]]))));

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const norm = a => scale(a, 1 / (len(a) || 1));

  const STEPS = ['neutral', 'left', 'right', 'forward', 'back'];
  const s = { lastPacket: 0, x: 0, y: 0, rx: 0, ry: 0, dead: 0, tilt: 0, trail: [], calStep: null, calNote: '', calHint: '', events: [], keys: {}, win: [], lock: 0, g: [0, -1, 0],
             // X/Y motion: x sideways, y up (metres, leaky); hist for the debug plot; rec = recording or null
             m: { t: 0, x: 0, y: 0, vx: 0, vy: 0, bx: 0, by: 0, ax: 0, ay: 0, armed: true },
             hist: [], rec: null, jumpReq: -1e9, jumpSrc: '', lastJump: { src: '', t: -1e9 } };
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

  function requestJump(src) { s.jumpReq = performance.now(); s.jumpSrc = src; }

  // X/Y motion tracking from user acceleration (CoreMotion: g units, device frame, sign opposite to the true
  // acceleration). Up = -gravity; sideways = calibrated left/right axis flattened onto the horizontal plane.
  function trackMotion(d, g, now) {
    const m = s.m, dt = d.t - m.t; m.t = d.t;
    if (!(dt > 0 && dt < 0.2)) return;                       // first packet or a gap: just resync the clock
    const G = 9.81, ua = [d.ax, d.ay, d.az];
    const base = cal ? cal.axisX : [1, 0, 0], lat = norm(sub(base, scale(g, dot(base, g))));
    const rawY = dot(ua, g) * G * (cfg.liftFlip ? -1 : 1), rawX = -dot(ua, lat) * G;
    const kb = 1 - Math.exp(-dt / 2);                        // slow bias estimate (2 s) so a sensor offset doesn't integrate
    m.bx += (rawX - m.bx) * kb; m.by += (rawY - m.by) * kb;
    m.ax = rawX - m.bx; m.ay = rawY - m.by;
    const lk = Math.exp(-dt / cfg.leak);
    m.vx = (m.vx + m.ax * dt) * lk; m.vy = (m.vy + m.ay * dt) * lk;
    m.x = (m.x + m.vx * dt) * lk;   m.y = (m.y + m.vy * dt) * lk;
    let jump = 0;
    if (cfg.physJump && !s.calStep && m.armed && m.y > cfg.jumpLift && m.vy > 0) { requestJump('lift'); m.armed = false; jump = 1; }
    if (!m.armed && m.y < cfg.jumpLift * 0.4) m.armed = true;   // re-arm once the AirPod comes back down
    s.hist.push({ t: now, x: m.x, y: m.y, jump }); while (s.hist.length && now - s.hist[0].t > 5000) s.hist.shift();
    if (s.rec) s.rec.push([d.t, m.ax, m.ay, m.vx, m.vy, m.x, m.y, jump]);
  }

  function onSample(d) {
    const now = performance.now(); s.lastPacket = now;
    if (d.type === 'button') return requestJump('stem');     // AirPod stem press (streamer --stem)
    if (d.gx === undefined) return;                          // old streamer build: restart it
    const g = norm([d.gx, d.gy, d.gz]); s.g = g;
    trackMotion(d, g, now);
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
    if (e.code === 'Space') { requestJump('key'); e.preventDefault(); }
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', e => { s.keys[e.code] = false; });

  return { s, cfg, save, stick, connected, getTmp: () => tmp, planeOf, hasCal: () => !!cal, getCal: () => cal, project, deadRadius, recenter, STEPS,
           beginCalibration() { s.calStep = 'neutral'; s.calNote = ''; s.win = []; s.lock = performance.now() + 600; tmp = {}; s.events.length = 0; },
           cancelCalibration() { s.calStep = null; },
           takeEvents: () => s.events.splice(0),
           // Consume a pending jump (only call when the craft can jump). Presses older than the buffer are dropped.
           takeJump() {
             const now = performance.now();
             if (now - s.jumpReq > cfg.jumpBufferMs) return false;
             s.jumpReq = -1e9; s.lastJump = { src: s.jumpSrc, t: now }; return true;
           },
           startRecording() { s.rec = []; },
           // Stop and return the X/Y recording as CSV text.
           stopRecording() {
             const rows = s.rec || []; s.rec = null;
             return 't,ax,ay,vx,vy,x,y,jump\n' + rows.map(r => r.map((v, i) => i === 7 ? v : v.toFixed(4)).join(',')).join('\n') + '\n';
           } };
})();
