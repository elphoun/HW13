// Debug menu (toggle with the ` key). "Joystick view" shows the head-tilt stick relative to the neutral pose taken at
// the start of the run: stick position, dead zone, full-tilt box, lit direction arrows and a word for the current direction.
(() => {
  const $ = id => document.getElementById(id);
  const load = () => { try { return JSON.parse(localStorage.getItem('wipeoutDebug') || '{}'); } catch (_) { return {}; } };
  const opts = Object.assign({ open: false, joystick: true }, load());
  const saveOpts = () => { try { localStorage.setItem('wipeoutDebug', JSON.stringify(opts)); } catch (_) {} };

  const panel = $('debug'), canvas = $('joy'), ctx = canvas.getContext('2d');
  const cb = $('dbgJoy'), dead = $('dbgDead'), sens = $('dbgSens');
  const phys = $('dbgPhys'), lift = $('dbgLift'), liftFlip = $('dbgLiftFlip'), rec = $('dbgRec'), xy = $('xy'), xctx = xy.getContext('2d');
  const sync = () => {
    panel.style.display = opts.open ? 'block' : 'none';
    canvas.style.display = opts.joystick ? 'block' : 'none';
    cb.checked = opts.joystick; dead.value = Input.cfg.deadFrac; sens.value = Input.cfg.sens;
    phys.checked = Input.cfg.physJump; liftFlip.checked = Input.cfg.liftFlip; lift.value = Input.cfg.jumpLift;
  };
  sync();

  cb.addEventListener('change', () => { opts.joystick = cb.checked; saveOpts(); sync(); cb.blur(); });
  dead.addEventListener('input', () => { Input.cfg.deadFrac = +dead.value; Input.save(); });
  sens.addEventListener('input', () => { Input.cfg.sens = +sens.value; Input.save(); });
  phys.addEventListener('change', () => { Input.cfg.physJump = phys.checked; Input.save(); phys.blur(); });
  liftFlip.addEventListener('change', () => { Input.cfg.liftFlip = liftFlip.checked; Input.save(); liftFlip.blur(); });
  lift.addEventListener('input', () => { Input.cfg.jumpLift = +lift.value; Input.save(); });
  [dead, sens, lift].forEach(el => el.addEventListener('change', () => el.blur()));   // give arrow keys back to the game
  // Record X/Y: click to start, click again to stop and download a CSV (t, accel, velocity, position, jump flag).
  rec.addEventListener('click', () => {
    rec.blur();
    if (!Input.s.rec) { Input.startRecording(); rec.textContent = '■ Stop & save'; return; }
    const csv = Input.stopRecording(), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'xy-recording-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    rec.textContent = '● Record X/Y';
  });
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

  function drawStick() {
    const s = Input.s, dz = Input.deadRadius(), out = Input.stick();
    ctx.strokeStyle = '#0ff3'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(C, 28); ctx.lineTo(C, W - 28); ctx.moveTo(28, C); ctx.lineTo(W - 28, C); ctx.stroke();
    if (!Input.isZeroed()) {
      ctx.fillStyle = '#9ff'; ctx.textAlign = 'center';
      ctx.fillText(Input.connected() ? 'press Enter (or C) to zero' : 'no AirPod data', C, C - 8); ctx.textAlign = 'left'; return;
    }
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#0ff8'; ctx.strokeRect(C - S, C - S, 2 * S, 2 * S); ctx.setLineDash([]);   // full tilt
    ctx.fillStyle = '#f0f2'; ctx.strokeStyle = '#f0f'; ctx.beginPath(); ctx.arc(C, C, dz * S, 0, 7); ctx.fill(); ctx.stroke();   // dead zone
    ctx.strokeStyle = '#0ff6'; ctx.beginPath();
    s.trail.forEach((p, i) => { const [x, y] = px(...p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    const inDead = Math.hypot(s.rx, s.ry) <= dz, [x, y] = px(Math.max(-1.4, Math.min(1.4, s.rx)), Math.max(-1.4, Math.min(1.4, s.ry)));
    ctx.strokeStyle = inDead ? '#888' : '#0f8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(C, C); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.lineWidth = 1;
    const act = { L: out.x < -0.05, R: out.x > 0.05, F: out.y > 0.05, B: out.y < -0.05 };
    arrowsAt(act);
    const ks = ['F', 'B', 'L', 'R'].filter(k => act[k]);
    ctx.font = '13px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = ks.length ? '#0f8' : '#f0f'; ctx.fillText(words(ks) + ` · ${s.tilt.toFixed(0)}°`, C, W - 34); ctx.textAlign = 'left';
  }

  // Scrolling X/Y motion plot (last 5 s): Y = up (green), X = sideways (blue), dashed line = jump threshold,
  // magenta ticks = jumps fired by lifting. Use it to pick the "Lift needed" value: a real lift should cross the line, steering shouldn't.
  function drawXY() {
    const H = xy.height, mid = H / 2, s = Input.s, now = performance.now(), m = Input.s.m;
    const yMax = Math.max(0.15, Input.cfg.jumpLift * 1.6), py = v => mid - v / yMax * (mid - 6), tx = t => W - (now - t) / 5000 * W;
    xctx.clearRect(0, 0, W, H);
    xctx.strokeStyle = '#0ff3'; xctx.beginPath(); xctx.moveTo(0, mid); xctx.lineTo(W, mid); xctx.stroke();
    xctx.setLineDash([4, 4]); xctx.strokeStyle = '#fc0'; xctx.beginPath(); xctx.moveTo(0, py(Input.cfg.jumpLift)); xctx.lineTo(W, py(Input.cfg.jumpLift)); xctx.stroke(); xctx.setLineDash([]);
    for (const [k, col] of [['x', '#4af'], ['y', '#4f8']]) {
      xctx.strokeStyle = col; xctx.lineWidth = k === 'y' ? 2 : 1; xctx.beginPath();
      s.hist.forEach((p, i) => { const X = tx(p.t), Y = py(p[k]); i ? xctx.lineTo(X, Y) : xctx.moveTo(X, Y); }); xctx.stroke();
    }
    xctx.lineWidth = 1; xctx.fillStyle = '#f0f';
    for (const p of s.hist) if (p.jump) xctx.fillRect(tx(p.t) - 1, 0, 2, H);
    const peak = s.hist.reduce((a, p) => Math.max(a, p.y), 0);
    xctx.font = '11px ui-monospace,Menlo,monospace'; xctx.fillStyle = '#9ff';
    xctx.fillText(`X ${(m.x * 100).toFixed(1)}cm  Y ${(m.y * 100).toFixed(1)}cm  peak ${(peak * 100).toFixed(1)}cm`, 4, 12);
    xctx.fillStyle = '#fc0'; xctx.fillText(`jump ${(Input.cfg.jumpLift * 100).toFixed(1)}cm${Input.cfg.physJump ? '' : ' (off)'}`, 4, H - 4);
    $('dbgRecInfo').textContent = s.rec ? `REC ${s.rec.length} samples` : '';
  }

  function draw() {
    requestAnimationFrame(draw);
    if (!opts.open) return;
    $('dbgDeadVal').textContent = Input.cfg.deadFrac.toFixed(2);
    $('dbgSensVal').textContent = Input.cfg.sens.toFixed(1);
    $('dbgLiftVal').textContent = (Input.cfg.jumpLift * 100).toFixed(1) + ' cm';
    drawXY();
    if (!opts.joystick) return;
    ctx.clearRect(0, 0, W, W); ctx.font = '11px ui-monospace,Menlo,monospace';
    drawStick();
  }
  requestAnimationFrame(draw);
})();
