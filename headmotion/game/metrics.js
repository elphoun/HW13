// Run metrics from head movement (AirPods in your ears). Counts head tilts left/right, nods forward/back and jumps,
// plus time spent leaning and your biggest tilt. Uses the same calibrated stick as the game, so it works the same
// whether you hold the AirPod or wear it. Live HUD while playing, summary on the game-over screen, lifetime totals saved.
(() => {
  const $ = id => document.getElementById(id);
  const ON = 0.5, OFF = 0.2;                                   // stick level that counts as a tilt / re-arms it
  const DIRS = [['left', '◀', 'x', -1], ['right', '▶', 'x', 1], ['fwd', '▲', 'y', 1], ['back', '▼', 'y', -1]];
  const KEY = 'wipeoutMetrics';
  const blank = () => ({ secs: 0, jumps: 0, maxTilt: 0, tilts: { left: 0, right: 0, fwd: 0, back: 0 }, held: { left: 0, right: 0, fwd: 0, back: 0 } });
  let run = blank(), armed = { left: true, right: true, fwd: true, back: true }, prevMode = '', lastJumpT = 0, shown = false;
  let life = Object.assign(blank(), { runs: 0 });
  try { life = Object.assign(life, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  const saveLife = () => { try { localStorage.setItem(KEY, JSON.stringify(life)); } catch (_) {} };

  const hud = document.createElement('div');
  hud.id = 'metrics';
  document.getElementById('hud').appendChild(hud);

  const sum = o => o.tilts.left + o.tilts.right + o.tilts.fwd + o.tilts.back;
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function update(sx, sy, dt, tilt, lastJump) {
    run.secs += dt;
    for (const [name, , axis, sign] of DIRS) {
      const v = (axis === 'x' ? sx : sy) * sign;
      if (v > ON && armed[name]) { armed[name] = false; run.tilts[name]++; }
      if (v < OFF) armed[name] = true;
      if (v > OFF) run.held[name] += dt;
    }
    run.maxTilt = Math.max(run.maxTilt, tilt || 0);
    if (lastJump && lastJump.t !== lastJumpT) { lastJumpT = lastJump.t; run.jumps++; }
  }

  function summary() {
    const mins = Math.max(run.secs / 60, 1 / 60), t = run.tilts;
    return `<div id="msum"><b>HEAD METRICS</b><br>
      Tilts: ◀ ${t.left} · ▶ ${t.right} · nod ▲ ${t.fwd} · ▼ ${t.back}<br>
      Jumps: ${run.jumps} · Total moves: ${sum(run) + run.jumps} (${((sum(run) + run.jumps) / mins).toFixed(1)}/min)<br>
      Biggest tilt: ${run.maxTilt.toFixed(0)}° · Time ${mmss(run.secs)}<br>
      Leaning: ◀ ${run.held.left.toFixed(0)}s ▶ ${run.held.right.toFixed(0)}s ▲ ${run.held.fwd.toFixed(0)}s ▼ ${run.held.back.toFixed(0)}s<br>
      <small>All time: ${life.runs} runs · ${sum(life) + life.jumps} moves · ${life.jumps} jumps</small></div>`;
  }

  function endRun() {
    life.runs++; life.secs += run.secs; life.jumps += run.jumps; life.maxTilt = Math.max(life.maxTilt, run.maxTilt);
    for (const k in run.tilts) { life.tilts[k] += run.tilts[k]; life.held[k] += run.held[k]; }
    saveLife();
    const m = $('msg'); if (m) m.insertAdjacentHTML('beforeend', '<br>' + summary());
  }

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const mode = Game.mode;
    if (mode === 'playing' && prevMode !== 'playing' && prevMode !== 'paused') {   // a fresh run starts
      run = blank(); armed = { left: true, right: true, fwd: true, back: true }; lastJumpT = Input.s.lastJump.t; shown = false;
    }
    if (mode === 'playing') update(Input.s.x || 0, Input.s.y || 0, dt, Input.s.tilt, Input.s.lastJump);
    if (mode === 'over' && !shown) { shown = true; endRun(); }
    prevMode = mode;
    const t = run.tilts;
    hud.style.display = mode === 'playing' || mode === 'paused' ? 'block' : 'none';
    hud.innerHTML = `◀ ${t.left} ▶ ${t.right} ▲ ${t.fwd} ▼ ${t.back} · ⤒ ${run.jumps}`;
  }
  requestAnimationFrame(loop);
  window.Metrics = { get run() { return run; }, get life() { return life; }, summary };
})();
