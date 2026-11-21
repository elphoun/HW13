// Debug menu (toggle with the ` key). "Joystick view" shows direction, not numbers:
//  - while calibrating: a tilt compass with each captured lean (LEFT/RIGHT/FORWARD/BACK) drawn as an arrow from neutral
//  - once calibrated: the stick position, dead zone, lit direction arrows and a word for the current direction
(() => {
  const $ = id => document.getElementById(id);
  const load = () => { try { return JSON.parse(localStorage.getItem('wipeoutDebug') || '{}'); } catch (_) { return {}; } };
  const opts = Object.assign({ open: false, joystick: true }, load());
  const saveOpts = () => { try { localStorage.setItem('wipeoutDebug', JSON.stringify(opts)); } catch (_) {} };

  const panel = $('debug'), canvas = $('joy'), ctx = canvas.getContext('2d');
  const cb = $('dbgJoy'), dead = $('dbgDead'), sens = $('dbgSens');
  const sync = () => {
    panel.style.display = opts.open ? 'block' : 'none';
    canvas.style.display = opts.joystick ? 'block' : 'none';
    cb.checked = opts.joystick; dead.value = Input.cfg.deadFrac; sens.value = Input.cfg.sens;
  };
  sync();

  cb.addEventListener('change', () => { opts.joystick = cb.checked; saveOpts(); sync(); cb.blur(); });
  dead.addEventListener('input', () => { Input.cfg.deadFrac = +dead.value; Input.save(); });
  sens.addEventListener('input', () => { Input.cfg.sens = +sens.value; Input.save(); });
  [dead, sens].forEach(el => el.addEventListener('change', () => el.blur()));   // give arrow keys back to the game
  $('dbgCenter').addEventListener('click', e => { Input.recenter(); e.target.blur(); });
  addEventListener('keydown', e => {
    if (e.code === 'Backquote' && !e.repeat) { opts.open = !opts.open; saveOpts(); sync(); }
    if (e.code === 'Comma' || e.code === 'Period') sens.value = Input.cfg.sens;
  });

  const W = canvas.width, C = W / 2, S = 80;                  // canvas size, center, px per stick unit
  const px = (x, y) => [C + x * S, C - y * S];
  const COL = { L: '#4af', R: '#fa4', F: '#4f8', B: '#f4a' };
  const NAME = { L: 'LEFT', R: 'RIGHT', F: 'FORWARD', B: 'BACK' };
  const ARROW = { L: '◀', R: '▶', F: '▲', B: '▼' };

  function arrowsAt(active) {                                  // four direction arrows, lit when that direction is active
    const spots = { F: [C, 16], B: [C, W - 16], L: [16, C], R: [W - 16, C] };
    ctx.font = '22px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const k in spots) { ctx.fillStyle = active[k] ? COL[k] : '#ffffff22'; ctx.fillText(ARROW[k], ...spots[k]); }
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  }
  const words = ks => ks.length ? ks.map(k => NAME[k]).join(' + ') : 'STOPPED';

  function drawCalibrated(cal) {
    const s = Input.s, dz = Input.deadRadius(), out = Input.stick();
    ctx.strokeStyle = '#0ff3'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(C, 28); ctx.lineTo(C, W - 28); ctx.moveTo(28, C); ctx.lineTo(W - 28, C); ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#0ff8'; ctx.strokeRect(C - S, C - S, 2 * S, 2 * S); ctx.setLineDash([]);
    ctx.fillStyle = '#f0f2'; ctx.strokeStyle = '#f0f'; ctx.beginPath(); ctx.arc(C, C, dz * S, 0, 7); ctx.fill(); ctx.stroke();   // dead zone
    for (const [k, d] of Object.entries(cal.pts)) {            // where you leaned during calibration
      const [x, y] = px(...Input.project(d)); ctx.fillStyle = COL[k]; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      ctx.fillText(k, x + 6, y - 6);
    }
    ctx.strokeStyle = '#0ff6'; ctx.beginPath();
    s.trail.forEach((p, i) => { const [x, y] = px(...p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    const inDead = Math.hypot(s.rx, s.ry) <= dz, [x, y] = px(s.rx, s.ry);
    ctx.strokeStyle = inDead ? '#888' : '#0f8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(C, C); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.lineWidth = 1;
    const act = { L: out.x < -0.05, R: out.x > 0.05, F: out.y > 0.05, B: out.y < -0.05 };
    arrowsAt(act);
    const ks = ['F', 'B', 'L', 'R'].filter(k => act[k]);
    ctx.font = '13px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = ks.length ? '#0f8' : '#f0f'; ctx.fillText(words(ks), C, W - 34); ctx.textAlign = 'left';
  }

  // Before/while calibrating: raw tilt direction in the plane perpendicular to your neutral pose,
  // rotated so your LEFT lean points left and your FORWARD lean points up. Shows where each captured lean really went.
  function drawRaw() {
    const s = Input.s, tmp = Input.getTmp(), cal = Input.getCal();
    const pts = cal ? cal.pts : { L: tmp.L, R: tmp.R, F: tmp.F, B: tmp.B };
    const ref = cal ? cal.neutral : tmp.neutral || s.g;
    ctx.strokeStyle = '#0ff3'; ctx.beginPath(); ctx.moveTo(C, 28); ctx.lineTo(C, W - 28); ctx.moveTo(28, C); ctx.lineTo(W - 28, C); ctx.stroke();
    if (!tmp.neutral && !cal) {
      ctx.fillStyle = '#9ff'; ctx.textAlign = 'center';
      ctx.fillText(Input.connected() ? 'hold still to set neutral' : 'no AirPod data', C, C); ctx.textAlign = 'left'; return;
    }
    const P = d => Input.planeOf(d, ref);
    let rot = 0, flip = 1;
    if (pts.L) { const [lx, ly] = P(pts.L); rot = Math.PI - Math.atan2(ly, lx); }
    const R2 = ([x, y]) => [x * Math.cos(rot) - y * Math.sin(rot), (x * Math.sin(rot) + y * Math.cos(rot))];
    if (pts.F) flip = R2(P(pts.F))[1] < 0 ? -1 : 1;
    const to = d => { const [x, y] = R2(P(d)); return [C + x * 150, C - y * 150 * flip]; };
    const mags = Object.values(pts).filter(Boolean).map(d => Math.hypot(...P(d)));
    const live = (() => { const d = [0, 1, 2].map(i => s.g[i] - ref[i]); return d; })();
    // captured leans
    for (const k of ['L', 'R', 'F', 'B']) if (pts[k]) {
      const [x, y] = to(pts[k]); ctx.strokeStyle = COL[k]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(C, C); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = COL[k]; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
      ctx.font = '12px ui-monospace,Menlo,monospace'; ctx.fillText(NAME[k], x + 7, y - 6);
    }
    ctx.lineWidth = 1;
    const [lx, ly] = to(live), dist = Math.hypot(lx - C, ly - C);
    ctx.strokeStyle = '#fff8'; ctx.beginPath(); ctx.moveTo(C, C); ctx.lineTo(lx, ly); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lx, ly, 5, 0, 7); ctx.fill();
    // which captured lean is the live tilt pointing at?
    let near = null, best = 0.8;
    if (dist > 12) for (const k in pts) if (pts[k]) { const [x, y] = to(pts[k]), c = ((x - C) * (lx - C) + (y - C) * (ly - C)) / (Math.hypot(x - C, y - C) * dist || 1); if (c > best) { best = c; near = k; } }
    ctx.font = '13px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = near ? COL[near] : '#9ff';
    ctx.fillText(dist <= 12 ? 'NEUTRAL' : near ? 'pointing ' + NAME[near] : 'tilted (between poses)', C, W - 34);
    ctx.textAlign = 'left';
  }

  function draw() {
    requestAnimationFrame(draw);
    if (!opts.open) return;
    $('dbgDeadVal').textContent = Input.cfg.deadFrac.toFixed(2);
    $('dbgSensVal').textContent = Input.cfg.sens.toFixed(1);
    if (!opts.joystick) return;
    ctx.clearRect(0, 0, W, W); ctx.font = '11px ui-monospace,Menlo,monospace';
    const cal = Input.getCal();
    if (cal && !Input.s.calStep) drawCalibrated(cal); else drawRaw();
  }
  requestAnimationFrame(draw);
})();
