// Exercise detectors. Each one is a plain object made from a params object P (live-editable from the lab page):
//   update(sample)  feed it Sensor samples (see sensor.js)
//   reps, note      count and a hint for the screen
// `marks(P)` lists threshold lines to draw on the matching chart so you can SEE what a rep has to reach.
// Stretches are measured by head ANGLE (accurate). Activities are measured by head ACCELERATION (approximate: the
// AirPods only feel your head, so they can't see your arms or legs).
const Exercises = (() => {
  const TAU = Math.PI * 2, wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), wrapDeg = a => wrap(a * Math.PI / 180) * 180 / Math.PI;
  const p = (v, min, max, step, label) => ({ v, min, max, step, label });

  // "One side, then the other side" = 1 rep. A side counts after being held past `on` for `hold` seconds, and re-arms
  // once you come back inside `off`.
  function pairs() {
    let first = 0, reps = 0; const armed = { '-1': true, '1': true }, held = { '-1': 0, '1': 0 };
    return { get reps() { return reps; }, get first() { return first; },
      feed(v, dt, on, off, hold) {
        for (const side of [-1, 1]) {
          const m = v * side;
          held[side] = m > on ? held[side] + dt : 0;
          if (held[side] >= hold && armed[side]) { armed[side] = false; if (first === 0) first = side; else if (first !== side) { reps++; first = 0; } }
          if (m < off) armed[side] = true;
        }
      } };
  }

  // Bend forward past `angle` and hold `hold` s = 1 rep; stand back up past `back` to re-arm. (hold 0 = just touch it.)
  const bend = P => {
    let held = 0, armed = true, reps = 0, note = 'Bend forward';
    return { update(s) {
        if (s.bend > P.angle) {
          if (armed) { held += s.dt; note = P.hold ? 'Hold… ' + Math.min(100, Math.round(held / P.hold * 100)) + '%' : 'Down!';
                       if (held >= P.hold) { reps++; armed = false; held = 0; note = 'Nice! Now stand back up'; } }
        } else { held = 0; if (s.bend < P.back) { armed = true; note = 'Bend forward'; } else if (armed) note = 'A bit further…'; }
      }, get reps() { return reps; }, get note() { return note; } };
  };

  // Count sharp bursts of head acceleration (landings). A burst must beat the dead zone `thr`, and after one is counted
  // nothing counts for `gap` seconds (one landing often rings twice). Bursts spaced more than `maxGap` apart start a new
  // streak, and a streak only counts once it reaches `streak` bursts (lone bumps are ignored). `perRep` bursts make one
  // rep: a jumping jack is two bounces (out, then in).
  const peaks = P => {
    let tn = 0, last = -1e9, streak = 0, bounces = 0, above = false;
    return { update(s) {
        tn += s.dt; const hi = s.mag > P.thr;
        if (hi && !above && tn - last >= P.gap) {
          streak = tn - last <= P.maxGap ? streak + 1 : 1; last = tn;
          if (streak === P.streak) bounces += P.streak; else if (streak > P.streak) bounces++;
        }
        if (s.mag < P.thr * 0.6) above = false; else if (hi) above = true;
      }, get reps() { return Math.floor(bounces / P.perRep); },
      get note() { return streak < P.streak ? (streak ? `${streak} of ${P.streak} to start counting` : 'Go!') : `${bounces} bounces`; } };
  };
  // Count up/down OSCILLATIONS of the head (high knees): vertical acceleration, minus its slow average, swings above +amp
  // and below -amp. One full swing = 1 step. Steps closer than `gap` are ignored; a streak must reach `streak` steps to count.
  const osc = P => {
    let tn = 0, ema = 0, init = false, high = false, last = -1e9, streak = 0, reps = 0;
    return { update(s) {
        tn += s.dt; if (!init) { ema = s.up; init = true; }
        ema += (s.up - ema) * (1 - Math.exp(-s.dt / P.tau)); const v = s.up - ema;
        if (!high && v > P.amp) {
          high = true;
          if (tn - last >= P.gap) { streak = tn - last <= P.maxGap ? streak + 1 : 1; last = tn;
                                    if (streak === P.streak) reps += P.streak; else if (streak > P.streak) reps++; }
        } else if (high && v < -P.amp) high = false;
      }, get reps() { return reps; },
      get note() { return streak < P.streak ? (streak ? `${streak} of ${P.streak} to start counting` : 'Go!') : `streak of ${streak}`; } };
  };

  const peakParams = (thr, gap, maxGap, streak, perRep) => ({
    thr: p(thr, 0.1, 3, 0.05, 'Dead zone: ignore bounces under (g)'), gap: p(gap, 0.1, 1.5, 0.05, 'Dead time after a bounce (s)'),
    maxGap: p(maxGap, 0.3, 3, 0.1, 'Max time between bounces in a streak (s)'), streak: p(streak, 1, 8, 1, 'Bounces to start counting'),
    perRep: p(perRep, 1, 4, 1, 'Bounces per rep') });

  const DEFS = [
    { id: 'tilt', group: 'Stretches', name: 'Neck tilts', chart: 'roll',
      how: 'Tilt your head to one side (ear toward shoulder), then the other. Both sides = 1 rep.',
      params: { on: p(15, 5, 40, 1, 'Tilt needed (°)'), off: p(6, 2, 20, 1, 'Back to center within (°)'), hold: p(0.25, 0, 1, 0.05, 'Hold each side (s)') },
      marks: P => [{ s: 'roll', v: P.on }, { s: 'roll', v: -P.on }],
      make(P) { const pr = pairs();
        return { update(s) { pr.feed(s.roll, s.dt, P.on, P.off, P.hold); }, get reps() { return pr.reps; },
                 get note() { return pr.first === 0 ? 'Tilt to either side' : 'Good! Now the OTHER side'; } }; } },
    { id: 'rotate', group: 'Stretches', name: 'Body rotations', chart: 'yaw',
      how: 'Rotate your whole body to one side, then the other. Both sides = 1 rep.',
      params: { on: p(30, 10, 90, 1, 'Turn needed (°)'), off: p(12, 3, 40, 1, 'Back to center within (°)'), hold: p(0.25, 0, 1, 0.05, 'Hold each side (s)') },
      marks: P => [{ s: 'yaw', v: P.on }, { s: 'yaw', v: -P.on }],
      make(P) { const pr = pairs(); let base = 0;
        return { update(s) { const d = wrapDeg(s.yaw - base); base += d * (1 - Math.exp(-s.dt / 60));   // follow slow sensor drift
                             pr.feed(d, s.dt, P.on, P.off, P.hold); },
                 get reps() { return pr.reps; }, get note() { return pr.first === 0 ? 'Rotate to either side' : 'Good! Now the OTHER way'; } }; } },
    { id: 'toes-sit', group: 'Stretches', name: 'Touch your toes (sitting)', chart: 'bend',
      how: 'Sitting, bend forward and down toward your toes and hold. Sit back up to reset.',
      params: { angle: p(45, 20, 90, 1, 'Bend needed (°)'), back: p(20, 5, 45, 1, 'Sit up past (°)'), hold: p(1, 0, 3, 0.1, 'Hold (s)') },
      marks: P => [{ s: 'bend', v: P.angle }], make: bend },
    { id: 'circles', group: 'Stretches', name: 'Neck circles', chart: 'roll',
      how: 'Roll your head in a full circle. Each direction is counted on its own.',
      params: { r: p(12, 5, 35, 1, 'Circle size to start (°)'), keep: p(6, 2, 20, 1, 'Drop out under (°)'), turn: p(340, 200, 360, 5, 'Degrees = 1 circle') },
      marks: P => [{ s: 'roll', v: P.r }, { s: 'roll', v: -P.r }, { s: 'pitch', v: P.r }, { s: 'pitch', v: -P.r }],
      make(P) { let acc = 0, prev = 0, active = false, cw = 0, ccw = 0;
        return { update(s) {
                   const x = s.roll, y = -s.pitch, r = Math.hypot(x, y), a = Math.atan2(y, x);
                   if (!active) { if (r > P.r) { active = true; prev = a; acc = 0; } return; }
                   if (r < P.keep) { active = false; acc = 0; return; }
                   const da = wrap(a - prev); prev = a; if (acc * da < 0) acc = 0; acc += da;
                   if (Math.abs(acc) >= P.turn * Math.PI / 180) { if (acc > 0) ccw++; else cw++; acc = 0; }
                 }, get reps() { return cw + ccw; }, get note() { return `↻ clockwise ${cw}  ·  ↺ counter-clockwise ${ccw}`; } }; } },

    { id: 'jacks', group: 'Activities', name: 'Jumping jacks', chart: 'mag',
      how: 'Jumping jacks. Each landing is a bounce and a jack is two (out, then in), so 2 bounces = 1 rep. Change "Bounces per rep" if yours differs.',
      params: peakParams(0.5, 0.3, 1.2, 2, 2), marks: P => [{ s: 'mag', v: P.thr }], make: peaks },
    { id: 'hop', group: 'Activities', name: '1-leg hop', chart: 'mag',
      how: 'Hop on one leg. Same head bounce as jumping jacks, so it uses the same counting (it can\'t tell which leg).',
      params: peakParams(0.5, 0.3, 1.2, 2, 1), marks: P => [{ s: 'mag', v: P.thr }], make: peaks },
    { id: 'knees', group: 'Activities', name: 'High knees', chart: 'up',
      how: 'Run in place bringing your knees up. Counts the up/down wobble of your head, one per step.',
      params: { amp: p(0.12, 0.03, 0.8, 0.01, 'Swing size (g)'), tau: p(0.5, 0.2, 2, 0.1, 'Slow-average time (s)'), gap: p(0.2, 0.1, 0.8, 0.05, 'Min time between steps (s)'),
                maxGap: p(0.9, 0.3, 2, 0.1, 'Max time between steps (s)'), streak: p(4, 1, 10, 1, 'Steps to start counting') },
      marks: P => [{ s: 'up', v: P.amp }, { s: 'up', v: -P.amp }], make: osc },
    { id: 'squat', group: 'Activities', name: 'Squats', chart: 'y', how: 'Squat down and stand back up. Head drops, then rises = 1 rep.',
      params: { dip: p(0.08, 0.02, 0.3, 0.01, 'Drop needed (m)'), back: p(0.03, 0.0, 0.15, 0.01, 'Back up within (m)') },
      marks: P => [{ s: 'y', v: -P.dip }],
      make(P) { let down = false, reps = 0;
        return { update(s) { if (!down && s.y < -P.dip) down = true; else if (down && s.y > -P.back) { down = false; reps++; } },
                 get reps() { return reps; }, get note() { return down ? 'Now stand up' : 'Squat down'; } }; } },
    { id: 'toes-stand', group: 'Activities', name: 'Touch your toes (standing)', chart: 'bend',
      how: 'Standing, bend forward and touch your toes. Stand up to reset.',
      params: { angle: p(60, 20, 100, 1, 'Bend needed (°)'), back: p(25, 5, 45, 1, 'Stand up past (°)'), hold: p(0.5, 0, 3, 0.1, 'Hold (s)') },
      marks: P => [{ s: 'bend', v: P.angle }], make: bend },
    { id: 'flowers', group: 'Activities', name: 'Pick the flowers', chart: 'bend',
      how: 'Sweep down toward the flowers and back up. Each down-and-up sweep = 1.',
      params: { angle: p(30, 15, 90, 1, 'Bend needed (°)'), back: p(15, 5, 45, 1, 'Stand up past (°)'), hold: p(0, 0, 2, 0.1, 'Hold (s)') },
      marks: P => [{ s: 'bend', v: P.angle }], make: bend },
  ];
  return { DEFS };
})();
if (typeof module !== 'undefined') module.exports = Exercises;
