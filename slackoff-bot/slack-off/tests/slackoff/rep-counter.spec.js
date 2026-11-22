import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createRepCounter } from '../../slackoff/rep-counter.js';

const still = { roll: 0, pitch: 0, yaw: 0, ax: 0, ay: 0, az: 0, gx: 0, gy: -1, gz: 0 };
const sampleAt = (t, overrides) => ({ ...still, t, ...overrides });

describe('rep counter', () => {
  it('counts alternating side tilts', () => {
    const counter = createRepCounter({ kind: 'alternate', signal: 'roll', threshold: 0.3 });
    const rolls = [0, 0.4, 0, -0.4, 0, 0.4, 0, -0.4];
    rolls.forEach((roll, index) => {
      counter.push(sampleAt(index, { roll }));
    });
    assert.strictEqual(counter.reps, 3);
  });

  it('counts dips relative to the starting posture and ignores wobble', () => {
    const counter = createRepCounter({ kind: 'dip', signal: 'pitch', enter: 0.6, exit: 0.25 });
    const pitches = [0.1, -0.7, -0.5, -0.7, 0.1, -0.8, 0.1];
    pitches.forEach((pitch, index) => {
      counter.push(sampleAt(index, { pitch }));
    });
    assert.strictEqual(counter.reps, 2);
  });

  it('counts acceleration peaks with a minimum gap', () => {
    const counter = createRepCounter({ kind: 'peak', signal: 'accelMagnitude', enter: 0.8, exit: 0.3, minGapMs: 300 });
    const frames = [
      [0, 0],
      [0.1, 1.2],
      [0.2, 0],
      [0.25, 1.2],
      [0.3, 0],
      [0.6, 1.1],
      [0.7, 0],
    ];
    for (const [t, ay] of frames) counter.push(sampleAt(t, { ay }));
    assert.strictEqual(counter.reps, 2);
  });

  it('counts a full circle once all four directions are visited', () => {
    const counter = createRepCounter({ kind: 'circle', threshold: 0.25 });
    const path = [
      { roll: 0, pitch: 0 },
      { roll: 0, pitch: -0.4 },
      { roll: 0.4, pitch: 0 },
      { roll: 0, pitch: 0.4 },
      { roll: -0.4, pitch: 0 },
    ];
    path.forEach((angles, index) => {
      counter.push(sampleAt(index, angles));
    });
    assert.strictEqual(counter.reps, 1);
  });

  it('rejects unknown rule kinds', () => {
    assert.throws(() => createRepCounter({ kind: 'wiggle' }));
  });
});
