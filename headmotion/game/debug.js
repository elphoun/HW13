// Debug menu (toggle with the ` key). "Joystick view" plots the AirPod's live tilt in calibrated stick space:
// dead-zone circle, the four calibrated lean poses, the full-lean boundary, a short trail and the raw point.
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

  const S = 80, C = canvas.width / 2;                         // px per stick unit, center
  const px = (x, y) => [C + x * S, C - y * S];
  function draw() {
    requestAnimationFrame(draw);
    if (!opts.open) return;
    $('dbgDeadVal').textContent = Input.cfg.deadFrac.toFixed(2);
    $('dbgSensVal').textContent = Input.cfg.sens.toFixed(1);
    if (!opts.joystick) return;
    const s = Input.s, cal = Input.getCal(), W = canvas.width;
    ctx.clearRect(0, 0, W, W);
    ctx.font = '11px ui-monospace,Menlo,monospace';

    // axes + full-lean boundary (|x|,|y| = 1)
    ctx.strokeStyle = '#0ff3'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(C, 0); ctx.lineTo(C, W); ctx.moveTo(0, C); ctx.lineTo(W, C); ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#0ff8'; ctx.strokeRect(C - S, C - S, 2 * S, 2 * S); ctx.setLineDash([]);

    if (!cal) {
      ctx.fillStyle = '#9ff'; ctx.textAlign = 'center';
      ctx.fillText(Input.connected() ? 'not calibrated (press R)' : 'no AirPod data', C, C - 8);
      ctx.fillText(`g ${s.g.map(v => v.toFixed(2)).join(' ')}`, C, C + 10);
      ctx.textAlign = 'left'; return;
    }

    // dead zone
    const dz = Input.deadRadius(), jitter = Input.cfg.noiseK * cal.noise / (Math.min(cal.halfX, cal.halfY) * Input.cfg.sens);
    ctx.fillStyle = '#f0f2'; ctx.strokeStyle = '#f0f'; ctx.beginPath(); ctx.arc(C, C, dz * S, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ff08'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(C, C, Math.min(jitter, 1.5) * S, 0, 7); ctx.stroke(); ctx.setLineDash([]);

    // calibrated poses
    ctx.fillStyle = '#ff0';
    for (const [k, d] of Object.entries(cal.pts)) {
      const [x, y] = px(...Input.project(d));
      ctx.fillRect(x - 3, y - 3, 6, 6); ctx.fillText(k, x + 5, y - 5);
    }

    // trail + live raw tilt
    ctx.strokeStyle = '#0ff6'; ctx.beginPath();
    s.trail.forEach((p, i) => { const [x, y] = px(...p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    const inDead = Math.hypot(s.rx, s.ry) <= dz, [x, y] = px(s.rx, s.ry);
    ctx.strokeStyle = inDead ? '#888' : '#0f8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(C, C); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.lineWidth = 1;

    // readout
    const out = Input.stick();
    ctx.fillStyle = '#9ff';
    ctx.fillText(`raw ${s.rx.toFixed(2)} ${s.ry.toFixed(2)}  tilt ${s.tilt.toFixed(1)}°`, 4, 12);
    ctx.fillText(`out ${out.x.toFixed(2)} ${out.y.toFixed(2)}`, 4, 25);
    ctx.fillText(`dead ${dz.toFixed(2)} (jitter ${jitter.toFixed(2)})`, 4, W - 18);
    ctx.fillStyle = inDead ? '#f0f' : '#0f8';
    ctx.fillText(inDead ? 'IN DEAD ZONE: STOPPED' : 'MOVING', 4, W - 5);
  }
  requestAnimationFrame(draw);
})();
