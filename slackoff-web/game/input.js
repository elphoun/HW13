// Head-tilt input from AirPods worn in your ears.
//   stick.x  -1..1   tilt head left / right (ear toward shoulder, attitude roll)
//   stick.y  -1..1   nod head back / forward (attitude pitch)
// No calibration: whatever pose your head is in when a run starts becomes neutral (zero()), and the stick reads the
// tilt relative to it. cfg.fullDeg of tilt = full stick. C (or the next/previous media key) re-zeros mid-run.
// Dead zone: a circle of radius cfg.deadFrac around neutral where the stick reads exactly 0 (craft stands still).
// Jump: Space, an AirPod stem press (streamer run with --stem), or a physical hop (head moves up quickly).
// The hop is measured by X/Y motion tracking: user acceleration is split into world-vertical (Y) and sideways (X)
// using the gravity vector, bias-removed and double-integrated with a leak so drift returns to 0.
// A jump fires when Y rises past cfg.jumpLift (metres) while still moving up.
const Input = (() => {
  // Which player this page is. Open the game with ?p=2 (etc.) on another laptop; each streamer tags its packets with --player N.
  const PLAYER = Math.max(1, parseInt(new URLSearchParams(location.search).get('p'), 10) || 1);
  const SAVED = ['flipX', 'flipY', 'sens', 'deadFrac', 'fullDeg', 'physJump', 'jumpLift', 'liftFlip'];
  const cfg = Object.assign({
    sens: 1,          // <1 = more sensitive (less tilt needed), >1 = less sensitive
    deadFrac: 0.2,    // dead-zone radius as a fraction of full tilt
    fullDeg: 25,      // head tilt (degrees from neutral) that gives full stick
    flipX: false, flipY: false,
    physJump: true,   // a quick upward head movement triggers a jump
    jumpLift: 0.15,   // metres of upward movement that count as a jump
    liftFlip: false,  // invert the vertical axis if moving up reads as negative Y
    leak: 1.0,        // seconds: X/Y position and velocity decay toward 0 with this time constant (kills drift)
    jumpBufferMs: 150 // a jump pressed slightly before landing still counts
  }, JSON.parse(localStorage.getItem('wipeoutCfg5') || '{}'));
  const save = () => localStorage.setItem('wipeoutCfg5', JSON.stringify(Object.fromEntries(SAVED.map(k => [k, cfg[k]]))));

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const norm = a => scale(a, 1 / (len(a) || 1));
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));   // angle difference folded into -pi..pi

  const s = { lastPacket: 0, x: 0, y: 0, rx: 0, ry: 0, dead: 0, tilt: 0, trail: [], keys: {}, win: [], g: [0, -1, 0],
             // X/Y motion: x sideways, y up (metres, leaky); hist for the debug plot; rec = recording or null
             m: { t: 0, x: 0, y: 0, vx: 0, vy: 0, bx: 0, by: 0, ax: 0, ay: 0, armed: true },
             hist: [], rec: null, jumpReq: -1e9, jumpSrc: '', lastJump: { src: '', t: -1e9 } };
  let base = null;         // { roll, pitch } neutral pose, set by zero()
  let zeroPending = false; // zero() was called before any sample arrived: use the next one

  // Head tilt (radians from neutral) -> raw stick, where +-1 = cfg.fullDeg of tilt. No dead zone applied.
  function project(dRoll, dPitch) {
    const full = cfg.fullDeg * Math.PI / 180 * cfg.sens;
    return [dRoll / full * (cfg.flipX ? -1 : 1), -dPitch / full * (cfg.flipY ? -1 : 1)];   // nodding forward = pitch down = stick up
  }
  const deadRadius = () => cfg.deadFrac;

  function requestJump(src) { s.jumpReq = performance.now(); s.jumpSrc = src; }

  // X/Y motion tracking from user acceleration (CoreMotion: g units, device frame, sign opposite to the true
  // acceleration). Up = -gravity; sideways = the device x axis flattened onto the horizontal plane.
  function trackMotion(d, g, now) {
    const m = s.m, dt = d.t - m.t; m.t = d.t;
    if (!(dt > 0 && dt < 0.2)) return;                       // first packet or a gap: just resync the clock
    const G = 9.81, ua = [d.ax, d.ay, d.az], ref = [1, 0, 0];
    const lat = norm(sub(ref, scale(g, dot(ref, g))));
    const rawY = dot(ua, g) * G * (cfg.liftFlip ? -1 : 1), rawX = -dot(ua, lat) * G;
    const kb = 1 - Math.exp(-dt / 2);                        // slow bias estimate (2 s) so a sensor offset doesn't integrate
    m.bx += (rawX - m.bx) * kb; m.by += (rawY - m.by) * kb;
    m.ax = rawX - m.bx; m.ay = rawY - m.by;
    const lk = Math.exp(-dt / cfg.leak);
    m.vx = (m.vx + m.ax * dt) * lk; m.vy = (m.vy + m.ay * dt) * lk;
    m.x = (m.x + m.vx * dt) * lk;   m.y = (m.y + m.vy * dt) * lk;
    let jump = 0;
    if (cfg.physJump && m.armed && m.y > cfg.jumpLift && m.vy > 0) { requestJump('lift'); m.armed = false; jump = 1; }
    if (!m.armed && m.y < cfg.jumpLift * 0.4) m.armed = true;   // re-arm once the head comes back down
    s.hist.push({ t: now, x: m.x, y: m.y, jump }); while (s.hist.length && now - s.hist[0].t > 5000) s.hist.shift();
    if (s.rec) s.rec.push([d.t, m.ax, m.ay, m.vx, m.vy, m.x, m.y, jump]);
  }

  function onSample(d) {
    if ((d.p || 1) !== PLAYER) return;                       // another player's AirPod: not ours
    const now = performance.now(); s.lastPacket = now;
    if (d.type === 'button') return requestJump('stem');     // AirPod stem press (streamer --stem)
    if (d.gx === undefined) return;                          // old streamer build: restart it
    const g = norm([d.gx, d.gy, d.gz]); s.g = g;
    trackMotion(d, g, now);
    s.win.push({ t: now, roll: d.roll, pitch: d.pitch });
    s.win = s.win.filter(p => now - p.t < 250);
    if (zeroPending) zero();
    if (!base) return;
    const dRoll = wrap(d.roll - base.roll), dPitch = wrap(d.pitch - base.pitch);
    const [rx, ry] = project(dRoll, dPitch), r = Math.hypot(rx, ry), dz = deadRadius();
    s.rx = rx; s.ry = ry; s.dead = dz;
    s.tilt = Math.hypot(dRoll, dPitch) * 180 / Math.PI;
    s.trail.push([rx, ry]); if (s.trail.length > 90) s.trail.shift();
    if (r <= dz) { s.x = s.y = 0; return; }                  // inside the dead zone: stand still
    const k = Math.min(1, (r - dz) / (1 - dz)) / r;          // scaled radial: 0 at the edge, 1 at full tilt
    const clamp = v => Math.max(-1, Math.min(1, v));
    s.x = clamp(rx * k); s.y = clamp(ry * k);
  }

  // Make the current head pose neutral (average of the last 250 ms). Called at the start of every run, and by C.
  // With no recent samples, the next sample that arrives becomes neutral.
  function zero() {
    const w = s.win;
    if (!w.length) { zeroPending = true; return false; }
    const avg = k => Math.atan2(w.reduce((a, p) => a + Math.sin(p[k]), 0), w.reduce((a, p) => a + Math.cos(p[k]), 0));
    base = { roll: avg('roll'), pitch: avg('pitch') };
    zeroPending = false; s.x = s.y = 0; s.trail = []; return true;
  }

  const connected = () => performance.now() - s.lastPacket < 600;
  const es = new EventSource('/events');
  es.onmessage = e => { try { onSample(JSON.parse(e.data)); } catch (_) {} };

  // Final stick value = head tilt, overridden by the keyboard when keys are held.
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
    if (e.code === 'KeyC') zero();
    if (e.code === 'Space') { requestJump('key'); e.preventDefault(); }
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', e => { s.keys[e.code] = false; });

  return { player: PLAYER, s, cfg, save, stick, connected, deadRadius, zero, recenter: zero, isZeroed: () => !!base,
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
