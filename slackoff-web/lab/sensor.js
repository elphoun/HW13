// AirPod motion for the exercise lab. No calibration: zero() makes your current pose neutral and everything is measured from it.
// Each packet becomes a sample, handed to subscribers (Sensor.on):
//   roll, pitch, yaw  degrees from the zeroed pose (roll = ear toward shoulder, pitch = nod, yaw = turn)
//   tilt              degrees between your head's current "up" and the zeroed one (works at any bend, no gimbal problems)
//   bend              tilt, positive when bent forward (nod down) and negative when leaning back
//   up                head acceleration along vertical (g, positive = accelerating up; Sensor.cfg.flipUp inverts)
//   mag               size of the head acceleration (g), any direction
//   y, vy             leaky double-integral of `up` (metres, m/s), relative to where you were ~1 s ago
//   dt                seconds since the previous sample
const Sensor = (() => {
  const PLAYER = Math.max(1, parseInt(new URLSearchParams(location.search).get('p'), 10) || 1);
  const cfg = Object.assign({ flipUp: false, leak: 1.0 }, JSON.parse(localStorage.getItem('slackoffSensor') || '{}'));
  const saveCfg = () => localStorage.setItem('slackoffSensor', JSON.stringify(cfg));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const DEG = 180 / Math.PI;

  const st = { lastPacket: 0, rate: 0, count: 0, cur: null };
  const subs = [];
  let win = [], base = null, prevT = 0, by = 0, vy = 0, y = 0, rateT = 0, rateN = 0;

  function zero() {
    if (!win.length) return false;
    const avg = k => Math.atan2(win.reduce((a, p) => a + Math.sin(p[k]), 0), win.reduce((a, p) => a + Math.cos(p[k]), 0));
    base = { roll: avg('roll'), pitch: avg('pitch'), yaw: avg('yaw'), g: norm(win.reduce((a, p) => [a[0] + p.g[0], a[1] + p.g[1], a[2] + p.g[2]], [0, 0, 0])) };
    y = vy = 0; return true;
  }

  function onSample(d) {
    if ((d.p || 1) !== PLAYER || d.type === 'button' || d.gx === undefined) return;
    const now = performance.now(); st.lastPacket = now; st.count++;
    rateN++; if (now - rateT > 1000) { st.rate = rateN * 1000 / (now - rateT); rateN = 0; rateT = now; }
    const g = norm([d.gx, d.gy, d.gz]);
    win.push({ t: now, roll: d.roll, pitch: d.pitch, yaw: d.yaw, g }); win = win.filter(p => now - p.t < 250);
    if (!base) zero();
    let dt = d.t - prevT; prevT = d.t; if (!(dt > 0 && dt < 0.2)) dt = 0.04;
    const roll = wrap(d.roll - base.roll) * DEG, pitch = wrap(d.pitch - base.pitch) * DEG, yaw = wrap(d.yaw - base.yaw) * DEG;
    const tilt = Math.acos(Math.max(-1, Math.min(1, dot(g, base.g)))) * DEG;
    const bend = pitch <= 0 ? tilt : -tilt;
    const ua = [d.ax, d.ay, d.az], up = dot(ua, g) * (cfg.flipUp ? -1 : 1), mag = len(ua);
    const rawY = up * 9.81, lk = Math.exp(-dt / cfg.leak);
    by += (rawY - by) * (1 - Math.exp(-dt / 2));                 // slow bias estimate so a sensor offset doesn't integrate
    vy = (vy + (rawY - by) * dt) * lk; y = (y + vy * dt) * lk;
    const s = st.cur = { t: now, dt, roll, pitch, yaw, tilt, bend, up, mag, y, vy };
    subs.forEach(f => f(s));
  }

  const connected = () => performance.now() - st.lastPacket < 600;
  const es = new EventSource('/events');
  es.onmessage = e => { try { onSample(JSON.parse(e.data)); } catch (_) {} };
  addEventListener('keydown', e => { if (e.code === 'KeyC' && !e.repeat) zero(); });

  return { player: PLAYER, cfg, saveCfg, st, zero, connected, on: f => subs.push(f), onSample };
})();
