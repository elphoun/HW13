import assert from 'node:assert';
import { describe, it, mock } from 'node:test';
import { createMotionListener, parsePacket } from '../../slackoff/motion-listener.js';

describe('motion listener', () => {
  it('parses HeadMotionStreamer motion packets and ignores stem button packets', () => {
    const motion = parsePacket(Buffer.from('{"p":2,"t":1.5,"roll":0.1,"pitch":0,"yaw":0,"ax":0,"ay":0,"az":0}'));
    assert.strictEqual(motion.p, 2);
    assert.strictEqual(parsePacket(Buffer.from('{"p":1,"type":"button","src":"play"}')), null);
    assert.strictEqual(parsePacket(Buffer.from('not json')), null);
  });

  it('reports streaming only while samples are recent', () => {
    let clock = 0;
    const listener = createMotionListener({ port: 0, now: () => clock });
    const onSample = mock.fn();
    listener.onSample(onSample);

    assert.strictEqual(listener.isStreaming(1), false);
    listener.receive({ p: 1, roll: 0 });
    assert.strictEqual(listener.isStreaming(1), true);
    assert.strictEqual(onSample.mock.callCount(), 1);
    clock = 5000;
    assert.strictEqual(listener.isStreaming(1), false);
  });
});
