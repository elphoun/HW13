const signalReaders = {
  roll: (sample) => sample.roll,
  pitch: (sample) => sample.pitch,
  yaw: (sample) => sample.yaw,
  accelMagnitude: (sample) => Math.hypot(sample.ax, sample.ay, sample.az),
  verticalAccel: (sample) => Math.abs(sample.ax * sample.gx + sample.ay * sample.gy + sample.az * sample.gz),
};

const angularDelta = (value, baseline) => Math.atan2(Math.sin(value - baseline), Math.cos(value - baseline));

const isAngle = (signal) => signal === 'roll' || signal === 'pitch' || signal === 'yaw';

const createRepCounter = (rule) => {
  let reps = 0;
  let baseline = null;
  let lastSide = 0;
  let armed = true;
  let lastRepAt = Number.NEGATIVE_INFINITY;
  let visited = new Set();

  const relative = (signal, sample) => {
    const value = signalReaders[signal](sample);
    if (!isAngle(signal)) return value;
    baseline ??= {};
    baseline[signal] ??= value;
    return angularDelta(value, baseline[signal]);
  };

  const handlers = {
    alternate: (sample) => {
      const value = relative(rule.signal, sample);
      const side = value > rule.threshold ? 1 : value < -rule.threshold ? -1 : 0;
      if (side !== 0 && side !== lastSide) {
        if (lastSide !== 0) reps += 1;
        lastSide = side;
      }
    },
    dip: (sample) => {
      const depth = Math.abs(relative(rule.signal, sample));
      if (armed && depth > rule.enter) {
        armed = false;
        reps += 1;
      } else if (!armed && depth < rule.exit) {
        armed = true;
      }
    },
    peak: (sample) => {
      const value = relative(rule.signal, sample);
      const timeMs = sample.t * 1000;
      if (armed && value > rule.enter && timeMs - lastRepAt >= rule.minGapMs) {
        armed = false;
        lastRepAt = timeMs;
        reps += 1;
      } else if (!armed && value < rule.exit) {
        armed = true;
      }
    },
    circle: (sample) => {
      const roll = relative('roll', sample);
      const pitch = relative('pitch', sample);
      if (roll > rule.threshold) visited.add('right');
      if (roll < -rule.threshold) visited.add('left');
      if (pitch > rule.threshold) visited.add('up');
      if (pitch < -rule.threshold) visited.add('down');
      if (visited.size === 4) {
        reps += 1;
        visited = new Set();
      }
    },
  };

  const handle = handlers[rule.kind];
  if (!handle) throw new Error(`Unknown rep rule kind: ${rule.kind}`);

  return {
    push: (sample) => {
      handle(sample);
      return reps;
    },
    get reps() {
      return reps;
    },
  };
};

export { createRepCounter };
