// Wipeout-style hover racer, controlled like a joystick:
// lean left/right = steer, lean forward = move forward, lean back = move backward. Dodge the walls.
(() => {
  const TRACK_W = 12, HALF = TRACK_W / 2, AHEAD = 260;
  const MAX_FWD = 24, MAX_BACK = 10;
  const $ = id => document.getElementById(id);

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

  // Obstacles: purple walls at random positions across the track
  let obstacles = [];
  function spawn(z) {
    const w = 2.5 + Math.random() * 2.5, h = 3, depth = 1.2;
    const x = (Math.random() * 2 - 1) * (HALF - w / 2);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), new THREE.MeshStandardMaterial({ color: 0x8844ff, emissive: 0x8844ff, emissiveIntensity: 0.5 }));
    mesh.position.set(x, h / 2, z); scene.add(mesh);
    obstacles.push({ mesh, x, w, depth, z });
  }

  let st;
  function reset() {
    obstacles.forEach(o => scene.remove(o.mesh)); obstacles = [];
    st = { z: 0, x: 0, vx: 0, speed: 0, maxDist: 0, shield: 3, invuln: 0, nextSpawn: -50, mode: 'ready', best: st ? st.best : 0 };
    craft.visible = true;
  }
  reset();
  const flash = t => { const el = $('gesture'); el.textContent = t; el.style.opacity = 1; setTimeout(() => el.style.opacity = 0, 350); };

  const CAL = {
    neutral: ['Hold the AirPod <b>still</b> in a comfortable neutral position', '● HOLD STILL ●'],
    left: ['Now lean it to the left and <b>hold</b>', '◀ LEAN LEFT'],
    right: ['Now lean it to the right and <b>hold</b>', 'LEAN RIGHT ▶'],
    forward: ['Now lean it forward and <b>hold</b>', '▲ LEAN FORWARD'],
    back: ['Now lean it back and <b>hold</b>', '▼ LEAN BACK'],
  };
  function showMsg() {
    const m = $('msg');
    if (st.mode === 'playing') { m.style.display = 'none'; return; }
    m.style.display = 'flex';
    if (st.mode === 'calibrate') {
      const step = Input.s.calStep, [text, label] = CAL[step];
      m.innerHTML = `<h1>CALIBRATE</h1>Step ${Input.STEPS.indexOf(step) + 1} of 5<br><br>${text}<br><br><span style="font-size:44px;color:#f0f">${label}</span><br><br><small>Hold the pose until the next step appears · Esc to skip and use the keyboard</small>`;
    } else if (st.mode === 'calibrated') m.innerHTML = `<h1>CALIBRATED ✓</h1>Lean to steer and move. The small circle (bottom right) shows your stick.<br><br>Press <b>Enter</b> to start.<br><br><small>R to calibrate again</small>`;
    else if (st.mode === 'ready') m.innerHTML = `<h1>AIRPOD WIPEOUT</h1>Press <b>Enter</b> to calibrate your AirPod joystick, then start.<br><br>
      <b>Lean left / right</b> steer &nbsp;·&nbsp; <b>Lean forward</b> move forward &nbsp;·&nbsp; <b>Lean back</b> move backward<br>
      Dodge the purple walls. Level = stopped.<br><br>
      Keyboard: A/D or ←/→ steer · W/S or ↑/↓ forward/back<br>
      Tuning: F flip left/right · G flip forward/back · , . sensitivity · R recalibrate`;
    else m.innerHTML = `<h1>WIPEOUT</h1>Distance: ${Math.floor(st.maxDist)} m<br>Best: ${Math.floor(st.best)} m<br><br>Press <b>Enter</b> to race again`;
  }
  showMsg();
  const startRun = () => { const best = st.best; reset(); st.best = best; st.mode = 'playing'; showMsg(); };
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'Escape' && st.mode === 'calibrate') { Input.cancelCalibration(); st.mode = 'ready'; showMsg(); }
    if (e.code === 'KeyR' && st.mode !== 'playing' && st.mode !== 'calibrate') { Input.beginCalibration(); st.mode = 'calibrate'; showMsg(); }
    if (e.code === 'Enter' && (st.mode === 'ready' || st.mode === 'over' || st.mode === 'calibrated')) {
      if (Input.connected() && !Input.hasCal()) { Input.beginCalibration(); st.mode = 'calibrate'; showMsg(); } else startRun();
    }
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const ev = Input.takeEvents();
    if (st.mode === 'calibrate' && ev.includes('calibrated')) { st.mode = 'calibrated'; showMsg(); }
    else if (st.mode === 'calibrate' && ev.includes('calstep')) showMsg();
    else if (st.mode === 'playing') step(dt);
    render();
    requestAnimationFrame(frame);
  }

  function step(dt) {
    const { x: sx, y: sy } = Input.stick();
    const target = sy > 0 ? sy * MAX_FWD : sy * MAX_BACK;                 // level = stopped
    st.speed += (target - st.speed) * Math.min(1, dt * 4);
    st.z -= st.speed * dt;
    if (st.z > 0) { st.z = 0; st.speed = Math.max(0, st.speed); }          // can't back up past the start line
    st.maxDist = Math.max(st.maxDist, -st.z);
    st.vx += (sx * 14 - st.vx) * Math.min(1, dt * 8);
    st.x = Math.max(-HALF + 0.8, Math.min(HALF - 0.8, st.x + st.vx * dt));
    st.invuln = Math.max(0, st.invuln - dt);

    while (st.nextSpawn > -st.maxDist - AHEAD + 20) { spawn(st.nextSpawn); st.nextSpawn -= 22 + Math.random() * 14; }
    obstacles = obstacles.filter(o => { if (o.z > st.z + 30) { scene.remove(o.mesh); return false; } return true; });

    for (const o of obstacles) {
      if (Math.abs(o.z - st.z) < o.depth / 2 + 0.9 && Math.abs(o.x - st.x) < o.w / 2 + 0.7) {
        scene.remove(o.mesh); obstacles.splice(obstacles.indexOf(o), 1);
        if (st.invuln <= 0) {
          st.shield--; st.invuln = 1.2; st.speed *= 0.3; flash('HIT');
          if (st.shield <= 0) { st.mode = 'over'; st.best = Math.max(st.best, st.maxDist); showMsg(); }
        }
        break;
      }
    }
  }

  function render() {
    const stick = Input.stick();
    craft.position.set(st.x, 0.5, st.z);
    craft.rotation.z = -st.vx * 0.04; craft.rotation.x = -st.speed * 0.004;
    craft.visible = st.invuln <= 0 || Math.floor(performance.now() / 80) % 2 === 0;
    camera.position.set(st.x * 0.6, 3.2, st.z + 7.5);
    camera.lookAt(st.x * 0.8, 1, st.z - 12);
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
    $('status').innerHTML = (Input.connected() ? '● AirPod streaming' : '○ no AirPod data (keyboard works)') +
      `<br>stick x ${stick.x.toFixed(2)} y ${stick.y.toFixed(2)} &nbsp;sensitivity ${Input.cfg.sens} (, more · . less) · F/G flip · R recalibrate`;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
})();
