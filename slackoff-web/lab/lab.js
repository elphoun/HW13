// Exercise lab UI: pick an exercise, do it, watch the count, the live signals and the thresholds, and tune them.
(() => {
  const $ = id => document.getElementById(id);
  const DEFS = Exercises.DEFS;
  const SERIES = [
    { k: 'roll', label: 'Roll: head tilt side to side (°)', min: -45, max: 45 },
    { k: 'pitch', label: 'Pitch: nod down (−) / up (+) (°)', min: -60, max: 60 },
    { k: 'yaw', label: 'Yaw: turning (°)', min: -90, max: 90 },
    { k: 'bend', label: 'Bend: forward lean (°)', min: -30, max: 100 },
    { k: 'mag', label: 'Head acceleration (g)', min: 0, max: 3 },
    { k: 'y', label: 'Up/down position, rough (m)', min: -0.3, max: 0.3 },
  ];
  const load = () => { try { return JSON.parse(localStorage.getItem('slackoffLabParams') || '{}'); } catch (_) { return {}; } };
  const saved = load();
  const params = {};                                       // id -> { key: value } (live, shared with the detector)
  DEFS.forEach(d => { params[d.id] = {}; for (const k in d.params) params[d.id][k] = (saved[d.id] || {})[k] ?? d.params[k].v; });
  const saveParams = () => { try { localStorage.setItem('slackoffLabParams', JSON.stringify(params)); } catch (_) {} };

  // ----- menu -----
  let cur = null, det = null, settle = 0, lastReps = 0, log = [];
  const menu = $('menu');
  ['Stretches', 'Activities'].forEach(g => {
    menu.insertAdjacentHTML('beforeend', `<h3>${g}</h3>`);
    DEFS.filter(d => d.group === g).forEach(d => {
      const b = document.createElement('button'); b.textContent = d.name; b.dataset.id = d.id; b.onclick = () => select(d.id); menu.appendChild(b);
    });
  });

  function select(id) {
    cur = DEFS.find(d => d.id === id); det = null; lastReps = 0; log = []; settle = 1.5;
    document.querySelectorAll('#menu button').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    $('empty').style.display = 'none'; $('main').style.display = 'block';
    $('name').textContent = cur.name; $('how').innerHTML = cur.how; $('reps').textContent = '0'; $('log').innerHTML = '';
    const box = $('params'); box.innerHTML = '';
    for (const k in cur.params) {
      const def = cur.params[k], row = document.createElement('label');
      row.innerHTML = `${def.label} <input type="range" min="${def.min}" max="${def.max}" step="${def.step}"><b></b>`;
      const inp = row.querySelector('input'), out = row.querySelector('b');
      inp.value = params[id][k]; out.textContent = params[id][k];
      inp.oninput = () => { params[id][k] = +inp.value; out.textContent = inp.value; saveParams(); };
      box.appendChild(row);
    }
  }
  $('reset').onclick = () => cur && select(cur.id);
  $('zero').onclick = () => Sensor.zero();
  $('flipUp').checked = Sensor.cfg.flipUp;
  $('flipUp').onchange = e => { Sensor.cfg.flipUp = e.target.checked; Sensor.saveCfg(); };

  // ----- sensor feed -----
  const hist = [];                                         // last ~10 s of samples for the charts
  Sensor.on(s => {
    hist.push(s); while (hist.length > 250) hist.shift();
    if (!cur) return;
    if (!det) {
      settle -= s.dt;
      if (settle <= 0) { Sensor.zero(); det = cur.make(params[cur.id]); }
      return;
    }
    det.update(s);
    if (det.reps > lastReps) {
      log.unshift(`${new Date().toLocaleTimeString()}  rep ${det.reps}`); if (log.length > 12) log.pop(); lastReps = det.reps;
      $('log').innerHTML = log.join('<br>');
    }
  });

  // ----- drawing -----
  const cv = $('charts'), c = cv.getContext('2d'), RH = 66, PAD = 18;
  cv.height = SERIES.length * RH;
  function draw() {
    requestAnimationFrame(draw);
    const ok = Sensor.connected();
    $('status').textContent = ok ? `AirPod data ✓ ${Sensor.st.rate.toFixed(0)} Hz` : 'No AirPod data. Is the streamer running?';
    $('status').className = ok ? 'ok' : 'bad';
    if (cur) {
      $('reps').textContent = det ? det.reps : 0;
      $('note').textContent = !ok ? 'Waiting for AirPod data…' : det ? det.note : `Hold still… ${Math.max(0, settle).toFixed(1)}`;
    }
    const W = cv.width; c.clearRect(0, 0, W, cv.height); c.font = '11px ui-monospace,Menlo,monospace';
    const marks = cur ? cur.marks(params[cur.id]) : [];
    SERIES.forEach((s, i) => {
      const top = i * RH + PAD, h = RH - PAD - 6, Y = v => top + h - (Math.max(s.min, Math.min(s.max, v)) - s.min) / (s.max - s.min) * h;
      const main = cur && cur.chart === s.k;
      c.fillStyle = main ? '#f0f' : '#7cc'; c.fillText(s.label + (hist.length ? '   ' + hist[hist.length - 1][s.k].toFixed(s.k === 'y' || s.k === 'mag' ? 2 : 0) : ''), 4, top - 5);
      c.strokeStyle = '#0ff3'; c.strokeRect(0.5, top, W - 1, h);
      c.beginPath(); c.moveTo(0, Y(0)); c.lineTo(W, Y(0)); c.setLineDash([2, 4]); c.stroke(); c.setLineDash([]);
      c.strokeStyle = '#fc0'; c.setLineDash([6, 4]);
      marks.filter(m => m.s === s.k).forEach(m => { c.beginPath(); c.moveTo(0, Y(m.v)); c.lineTo(W, Y(m.v)); c.stroke(); });
      c.setLineDash([]); c.strokeStyle = main ? '#f0f' : '#0ff'; c.lineWidth = main ? 2 : 1.2; c.beginPath();
      hist.forEach((p, j) => { const x = j / 249 * W; j ? c.lineTo(x, Y(p[s.k])) : c.moveTo(x, Y(p[s.k])); }); c.stroke(); c.lineWidth = 1;
    });
  }
  draw();
})();
