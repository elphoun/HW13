// Wipeout-style hover racer, controlled like a joystick:
// lean left/right = steer, lean forward = move forward, lean back = move backward. Dodge the walls.
// Jump (Space / AirPod stem press / lift the AirPod) over the low orange barriers that span the whole track.
(() => {
  const TRACK_W = 12, HALF = TRACK_W / 2, AHEAD = 260;
  const MAX_FWD = 24, MAX_BACK = 10;
  const JUMP_V = 8.5, GRAV = 16;                 // ~2.3 units high, ~1.05 s airtime
  const BAR_H = 1.0, BAR_CHANCE = 0.3;           // jump barriers: height and share of spawns
  const $ = id => document.getElementById(id);

  // Shared track: all players fetch the same seed from the bridge, so every laptop spawns identical obstacles.
  let SEED = 12345, rng = () => Math.random();
  const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  rng = mulberry32(SEED);
  let joinUrl = '';
  if (typeof fetch !== 'undefined') {
    fetch('/seed').then(r => r.json()).then(j => { SEED = j.seed; rng = mulberry32(SEED); }).catch(() => {});
    fetch('/info').then(r => r.json()).then(j => { if (j.ips && j.ips[0]) joinUrl = `http://${j.ips[0]}:${j.port}/?p=2`; }).catch(() => {});
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060f);
  scene.fog = new THREE.Fog(0x05060f, 40, AHEAD);
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 500);
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  scene.add(new THREE.AmbientLight(0x6677aa, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(-4, 10, 6); scene.add(sun);

  // Road: grid texture anchored to the world
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#080a1c'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#0ff'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128);
  g.strokeStyle = '#306'; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.stroke();
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(TRACK_W / 4, AHEAD * 2 / 4);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W, AHEAD * 2), new THREE.MeshBasicMaterial({ map: tex }));
  road.rotation.x = -Math.PI / 2; scene.add(road);
  const railMat = new THREE.MeshBasicMaterial({ color: 0xff00cc });
  const rails = [-1, 1].map(sx => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, AHEAD * 2), railMat); m.position.set(sx * (HALF + 0.15), 0.2, 0); scene.add(m); return m; });
  const posts = [];
  for (let i = 0; i < 24; i++) for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
    m.position.set(sx * (HALF + 1.5), 2, -i * 20); scene.add(m); posts.push(m);
  }

  // Craft
  const craft = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.2, 4), new THREE.MeshStandardMaterial({ color: 0xeeeeff, emissive: 0x2233aa }));
  hull.rotation.x = -Math.PI / 2; hull.scale.set(1.4, 1, 0.5); craft.add(hull);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.8), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
  glow.position.set(0, -0.15, 0.6); craft.add(glow);
  scene.add(craft);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

  // Obstacles: tall purple walls at random positions (steer around), or low orange barriers across the whole track (jump)
  let obstacles = [];
  const barMat = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff6600, emissiveIntensity: 0.6 });
  const barTopMat = new THREE.MeshBasicMaterial({ color: 0xffee66 });
  function spawn(z) {
    if (z < -60 && rng() < BAR_CHANCE) {
      const mesh = new THREE.Group(), depth = 0.6;
      const body = new THREE.Mesh(new THREE.BoxGeometry(TRACK_W, BAR_H, depth), barMat); body.position.y = BAR_H / 2; mesh.add(body);
      const top = new THREE.Mesh(new THREE.BoxGeometry(TRACK_W, 0.08, depth + 0.05), barTopMat); top.position.y = BAR_H; mesh.add(top);
      mesh.position.set(0, 0, z); scene.add(mesh);
      obstacles.push({ mesh, x: 0, w: TRACK_W, depth, z, h: BAR_H, kind: 'bar' });
      return;
    }
    const w = 2.5 + rng() * 2.5, h = 3, depth = 1.2;
    const x = (rng() * 2 - 1) * (HALF - w / 2);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), new THREE.MeshStandardMaterial({ color: 0x8844ff, emissive: 0x8844ff, emissiveIntensity: 0.5 }));
    mesh.position.set(x, h / 2, z); scene.add(mesh);
    obstacles.push({ mesh, x, w, depth, z, h, kind: 'wall' });
  }

  let st;
  window.Game = { get mode() { return st && st.mode; } };
  function reset() {
    obstacles.forEach(o => scene.remove(o.mesh)); obstacles = [];
    rng = mulberry32(SEED);                                  // same sequence of obstacles every run, on every laptop
    st = { z: 0, x: 0, vx: 0, h: 0, vh: 0, speed: 0, maxDist: 0, shield: 3, invuln: 0, nextSpawn: -50, mode: 'ready', best: st ? st.best : 0 };
    craft.visible = true;
  }
  reset();
  const flash = t => { const el = $('gesture'); el.textContent = t; el.style.opacity = 1; setTimeout(() => el.style.opacity = 0, 350); };

  function showMsg() {
    const m = $('msg');
    if (st.mode === 'playing') { m.style.display = 'none'; return; }
    m.style.display = 'flex';
    if (st.mode === 'paused') { m.innerHTML = `<h1>PAUSED</h1>Press <b>Esc</b> (or <b>P</b>) to resume.`; return; }
    if (st.mode === 'ready') m.innerHTML = `<h1>AIRPOD WIPEOUT <small style="font-size:16px">(you are P${Input.player})</small></h1>Wear your AirPods, look straight ahead and press <b>Enter</b>. That pose becomes neutral.<br><br>
      <b>Tilt head left / right</b> steer &nbsp;·&nbsp; <b>Nod forward</b> move forward &nbsp;·&nbsp; <b>Tilt head back</b> move backward<br>
      <b>Jump</b> Space · AirPod stem press · hop<br>
      Dodge the purple walls, jump the orange barriers. Level = stopped.<br><br>
      Keyboard: A/D or ←/→ steer · W/S or ↑/↓ forward/back · Space jump<br>
      ${joinUrl ? `<b>2 players:</b> friend opens <b>${joinUrl}</b> on their laptop<br>` : ''}
      Tuning: F flip left/right · G flip forward/back · , . sensitivity · C re-zero · \` debug menu`;
    else m.innerHTML = `<h1>WIPEOUT</h1>Distance: ${Math.floor(st.maxDist)} m<br>Best: ${Math.floor(st.best)} m<br><br>Look straight ahead and press <b>Enter</b> to race again`;
  }
  showMsg();
  // Pause: squeeze the AirPod stem (sent to the Mac as a media play/pause key) or press P.
  // A silent audio track makes this page the "now playing" app so the browser receives the AirPod media keys.
  const togglePause = () => {
    if (st.mode === 'playing') { st.mode = 'paused'; showMsg(); }
    else if (st.mode === 'paused') { st.mode = 'playing'; showMsg(); }
  };
  let mediaReady = false, mediaState = 'off (press any key to arm)', mediaHits = 0;
  function initMedia() {                                          // needs a user gesture, so call from the first keypress
    if (mediaReady || typeof Audio === 'undefined' || typeof navigator === 'undefined' || !navigator.mediaSession) return;
    mediaReady = true; mediaState = 'arming…';
    try {
      const rate = 8000, n = rate * 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
      const w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
      v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      w(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, i % 2 ? 1 : -1, true);   // +-1 LSB: inaudible, but not digital silence
      const a = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))); a.loop = true; a.volume = 1;
      a.play().then(() => {
        const ms = navigator.mediaSession;
        ms.metadata = new MediaMetadata({ title: 'AirPod Wipeout', artist: 'Squeeze to pause' });
        mediaState = 'armed, waiting for a squeeze';
        const toggle = () => { mediaHits++; mediaState = `got ${mediaHits} media key press(es)`; flash('MEDIA KEY'); togglePause(); ms.playbackState = 'playing'; if (a.paused) a.play(); };   // keep the session "playing" so every squeeze sends an event
        ms.setActionHandler('play', toggle); ms.setActionHandler('pause', toggle);
        ms.setActionHandler('nexttrack', () => Input.recenter()); ms.setActionHandler('previoustrack', () => Input.recenter());
        ms.playbackState = 'playing';
      }).catch(e => { mediaReady = false; mediaState = 'blocked: ' + (e && e.name || 'play() failed') + ' (press a key)'; });
    } catch (_) { mediaReady = false; mediaState = 'error'; }
  }
  const startRun = () => { const best = st.best; reset(); st.best = best; Input.zero(); st.mode = 'playing'; showMsg(); };   // current head pose = neutral for this run
  addEventListener('keydown', e => {
    if (e.repeat) return;
    initMedia();
    if (e.code === 'KeyP' || (e.code === 'Escape' && (st.mode === 'playing' || st.mode === 'paused'))) togglePause();
    if (e.code === 'Enter' && (st.mode === 'ready' || st.mode === 'over')) startRun();
  });

  // ---- Multiplayer ----
  // Other laptops open this page with ?p=2 (etc.). Each page runs its own game and shares its craft position through the bridge;
  // everyone else shows up here as a ghost craft on the same track.
  const ME = Input.player, peers = {};
  const GHOST = { 1: [0x2255ff, 0x00ffff], 2: [0xaa1166, 0xff44cc], 3: [0x226611, 0x66ff44], 4: [0x886600, 0xffcc33] };
  function makeGhost(id) {
    const [em, gl] = GHOST[id] || GHOST[2], grp = new THREE.Group();
    const hullG = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.2, 4), new THREE.MeshStandardMaterial({ color: 0xeeeeff, emissive: em, transparent: true, opacity: 0.8 }));
    hullG.rotation.x = -Math.PI / 2; hullG.scale.set(1.4, 1, 0.5); grp.add(hullG);
    const glowG = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.8), new THREE.MeshBasicMaterial({ color: gl }));
    glowG.position.set(0, -0.15, 0.6); grp.add(glowG);
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 48;
    const cg = cv.getContext('2d'); cg.font = 'bold 34px monospace'; cg.textAlign = 'center'; cg.fillStyle = '#' + gl.toString(16).padStart(6, '0'); cg.fillText('P' + id, 64, 36);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
    label.scale.set(2.4, 0.9, 1); label.position.y = 1.4; grp.add(label);
    scene.add(grp); return grp;
  }
  if (typeof EventSource !== 'undefined') {
    const net = new EventSource('/events');
    net.addEventListener('state', e => {
      let d; try { d = JSON.parse(e.data); } catch (_) { return; }
      if (d.p === ME) return;
      const pe = peers[d.p] || (peers[d.p] = { mesh: makeGhost(d.p), dx: d.x, dz: d.z, dh: d.h });
      Object.assign(pe, { x: d.x, z: d.z, h: d.h, speed: d.speed, shield: d.shield, dist: d.dist, mode: d.mode, seen: performance.now() });
    });
  }
  let lastSend = 0;
  function netSend(now) {
    if (typeof fetch === 'undefined' || now - lastSend < 66) return;      // ~15 updates per second
    lastSend = now;
    fetch('/state', { method: 'POST', keepalive: true, body: JSON.stringify({ p: ME, x: st.x, z: st.z, h: st.h, speed: st.speed, shield: st.shield, dist: st.maxDist, mode: st.mode }) }).catch(() => {});
  }
  function updatePeers(dt, now) {
    const lines = [];
    for (const id in peers) {
      const pe = peers[id], age = now - pe.seen;
      if (age > 3000) { pe.mesh.visible = false; continue; }              // that player left
      const k = Math.min(1, dt * 12), lead = Math.min(age, 300) / 1000;   // glide toward the last known spot, nudged ahead by its speed
      pe.dx += (pe.x - pe.dx) * k; pe.dz += (pe.z - lead * pe.speed - pe.dz) * k; pe.dh += (pe.h - pe.dh) * k;
      pe.mesh.visible = pe.mode === 'playing' || pe.mode === 'paused';
      pe.mesh.position.set(pe.dx, 0.5 + pe.dh, pe.dz);
      const gap = pe.dist - st.maxDist;
      lines.push(`P${id}: ${Math.floor(pe.dist)} m · ${'▮'.repeat(Math.max(0, pe.shield))}${pe.mode === 'over' ? ' OUT' : ''} · ${Math.abs(gap) < 1 ? 'level' : Math.floor(Math.abs(gap)) + ' m ' + (gap > 0 ? 'AHEAD ▲' : 'behind ▼')}`);
    }
    $('rival').innerHTML = lines.length ? lines.join('<br>') : `you are P${ME} · waiting for another player…`;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (st.mode === 'playing') step(dt);
    render();
    updatePeers(dt, performance.now()); netSend(performance.now());
    requestAnimationFrame(frame);
  }

  function step(dt) {
    const { x: sx, y: sy } = Input.stick();
    const target = sy > 0 ? sy * MAX_FWD : sy * MAX_BACK;                 // level = stopped
    st.speed += (target - st.speed) * Math.min(1, dt * 4);
    if (target === 0 && Math.abs(st.speed) < 0.5) st.speed = 0;            // settle fully: no creeping in the dead zone
    st.z -= st.speed * dt;
    if (st.z > 0) { st.z = 0; st.speed = Math.max(0, st.speed); }          // can't back up past the start line
    st.maxDist = Math.max(st.maxDist, -st.z);
    st.vx += (sx * 14 - st.vx) * Math.min(1, dt * 8);
    if (sx === 0 && Math.abs(st.vx) < 0.2) st.vx = 0;
    st.x = Math.max(-HALF + 0.8, Math.min(HALF - 0.8, st.x + st.vx * dt));
    st.invuln = Math.max(0, st.invuln - dt);
    if (st.h <= 0 && Input.takeJump()) st.vh = JUMP_V;
    if (st.h > 0 || st.vh > 0) { st.vh -= GRAV * dt; st.h += st.vh * dt; if (st.h <= 0) { st.h = 0; st.vh = 0; } }

    while (st.nextSpawn > -st.maxDist - AHEAD + 20) { spawn(st.nextSpawn); st.nextSpawn -= 22 + rng() * 14; }
    obstacles = obstacles.filter(o => { if (o.z > st.z + 30) { scene.remove(o.mesh); return false; } return true; });

    for (const o of obstacles) {
      // craft underside sits ~0.2 above st.h, so it clears an obstacle once st.h > o.h - 0.2
      if (Math.abs(o.z - st.z) < o.depth / 2 + 0.9 && Math.abs(o.x - st.x) < o.w / 2 + 0.7 && st.h < o.h - 0.2) {
        scene.remove(o.mesh); obstacles.splice(obstacles.indexOf(o), 1);
        if (st.invuln <= 0) {
          st.shield--; st.invuln = 1.2; st.speed *= 0.3; flash(o.kind === 'bar' ? 'JUMP!' : 'HIT');
          if (st.shield <= 0) { st.mode = 'over'; st.best = Math.max(st.best, st.maxDist); showMsg(); }
        }
        break;
      }
    }
  }

  function render() {
    const stick = Input.stick();
    craft.position.set(st.x, 0.5 + st.h, st.z);
    craft.rotation.z = -st.vx * 0.04; craft.rotation.x = -st.speed * 0.004 + st.vh * 0.03;
    shadow.position.set(st.x, 0.02, st.z); shadow.scale.setScalar(1 / (1 + st.h * 0.4)); shadow.material.opacity = 0.5 / (1 + st.h * 0.6);
    craft.visible = st.invuln <= 0 || Math.floor(performance.now() / 80) % 2 === 0;
    camera.position.set(st.x * 0.6, 3.2 + st.h * 0.5, st.z + 7.5);
    camera.lookAt(st.x * 0.8, 1 + st.h * 0.3, st.z - 12);
    camera.fov += ((68 + Math.abs(st.speed) * 0.3) - camera.fov) * 0.1; camera.updateProjectionMatrix();

    const cz = st.z - AHEAD + 40;
    road.position.set(0, 0, cz); tex.offset.y = -cz / 4 - (AHEAD * 2) / 8;
    rails.forEach(r => r.position.z = cz);
    for (const p of posts) {
      while (p.position.z > st.z + 15) p.position.z -= 480;
      while (p.position.z < st.z - 465) p.position.z += 480;
    }

    $('speed').textContent = Math.round(st.speed * 4) + ' km/h';
    $('dist').textContent = Math.floor(st.maxDist) + ' m';
    $('shield').textContent = 'SHIELD ' + '▮'.repeat(Math.max(0, st.shield)) + '▯'.repeat(3 - Math.max(0, st.shield));
    $('dot').style.left = (50 + stick.x * 40) + '%'; $('dot').style.top = (50 - stick.y * 40) + '%';
    const lj = Input.s.lastJump, jumpNote = performance.now() - lj.t < 1200 ? ` · JUMP (${{ key: 'space', stem: 'stem press', lift: 'lift' }[lj.src] || lj.src})` : '';
    $('status').innerHTML = (Input.connected() ? '● AirPod streaming' : '○ no AirPod data (keyboard works)') + jumpNote +
      `<br>media keys: ${mediaState}<br>stick x ${stick.x.toFixed(2)} y ${stick.y.toFixed(2)} &nbsp;sensitivity ${Input.cfg.sens} (, more · . less) · Space jump · F/G flip · C re-zero · \` debug`;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
})();
