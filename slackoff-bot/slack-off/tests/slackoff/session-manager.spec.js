import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import { createMotionListener } from '../../slackoff/motion-listener.js';
import { createSessionManager } from '../../slackoff/session-manager.js';

const config = {
  dayStartHour: 9,
  dayEndHour: 17,
  workIntervalMinutes: 30,
  activityTimeoutMinutes: 5,
  motionPort: 9001,
  gifBaseUrl: null,
  subscriberIds: [],
};

const createFakeTimers = () => {
  const pending = [];
  return {
    pending,
    setTimeout: (callback, ms) => {
      const timer = { callback, ms };
      pending.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      const index = pending.indexOf(timer);
      if (index >= 0) pending.splice(index, 1);
    },
    runNext: async () => {
      const timer = pending.shift();
      await timer.callback();
    },
  };
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

const posts = (client) => client.chat.postMessage.mock.calls.map((call) => call.arguments[0].text);

describe('session manager', () => {
  let client;
  let timers;
  let motion;
  let clock;
  let sessions;

  beforeEach(() => {
    client = {
      chat: {
        postMessage: mock.fn(async ({ channel }) => ({ channel: `D-${channel}`, ts: '1.0' })),
        update: mock.fn(async () => ({})),
      },
    };
    timers = createFakeTimers();
    clock = new Date(2026, 10, 23, 9, 0, 0);
    motion = createMotionListener({ port: 0, now: () => clock.getTime() });
    sessions = createSessionManager({
      client,
      motion,
      config,
      logger: { error: mock.fn(), warn: mock.fn(), info: mock.fn() },
      now: () => clock,
      timers,
      random: () => 0,
    });
  });

  it('warns in the start DM when no headphone motion is streaming', async () => {
    const result = await sessions.startSession('U1');

    assert.strictEqual(result.headphonesStreaming, false);
    const startMessage = client.chat.postMessage.mock.calls[0].arguments[0];
    assert.strictEqual(startMessage.channel, 'U1');
    assert(JSON.stringify(startMessage.blocks).includes('No headphone motion detected'));
    assert.strictEqual(timers.pending[0].ms, 30 * 60_000);
  });

  it('DMs an activity after the work timer and completes it from detected motion', async () => {
    motion.receive({ p: 1, t: 0, roll: 0, pitch: 0, yaw: 0, ax: 0, ay: 0, az: 0, gx: 0, gy: -1, gz: 0 });
    await sessions.startSession('U1');
    await timers.runNext();

    assert.match(posts(client)[1], /Stretch break: Neck tilts/);
    assert.strictEqual(sessions.getStatus('U1').phase, 'moving');

    const rolls = [0, 0.4, -0.4, 0.4, -0.4, 0.4, -0.4, 0.4];
    rolls.forEach((roll, index) => {
      motion.receive({ p: 1, t: index + 1, roll, pitch: 0, yaw: 0, ax: 0, ay: 0, az: 0, gx: 0, gy: -1, gz: 0 });
    });
    await settle();

    assert.match(posts(client).at(-1), /Neck tilts done \(6 reps detected\)/);
    assert.strictEqual(sessions.getStatus('U1').phase, 'working');
    assert.strictEqual(sessions.getStatus('U1').completed, 1);
    assert.strictEqual(timers.pending.length, 1);
    assert.strictEqual(timers.pending[0].ms, 30 * 60_000);
  });

  it('ignores motion from a different player', async () => {
    await sessions.startSession('U1');
    await sessions.triggerActivity('U1');
    for (let i = 0; i < 20; i += 1) {
      motion.receive({ p: 2, t: i, roll: i % 2 ? 0.5 : -0.5, pitch: 0, yaw: 0, ax: 0, ay: 0, az: 0 });
    }
    await settle();
    assert.strictEqual(sessions.getStatus('U1').phase, 'moving');
  });

  it('supports manual done when headphones are unavailable', async () => {
    await sessions.startSession('U1');
    await sessions.triggerActivity('U1');
    await sessions.markDone('U1');

    assert.match(posts(client).at(-1), /marked done\. Next break in 30 minutes/);
    assert.strictEqual(sessions.getStatus('U1').completed, 1);
  });

  it('times out an unfinished activity and schedules the next one', async () => {
    await sessions.startSession('U1');
    await sessions.triggerActivity('U1');
    assert.strictEqual(timers.pending[0].ms, 5 * 60_000);
    await timers.runNext();

    assert.match(posts(client).at(-1), /Time's up/);
    assert.strictEqual(sessions.getStatus('U1').phase, 'working');
  });

  it('ends the session when the next break would land after the end of day', async () => {
    await sessions.startSession('U1');
    await sessions.triggerActivity('U1');
    clock = new Date(2026, 10, 23, 16, 45, 0);
    await sessions.skip('U1');

    assert.match(posts(client).at(-1), /Session over/);
    assert.strictEqual(sessions.getStatus('U1').active, false);
    assert.strictEqual(timers.pending.length, 0);
  });

  it('retries the prompt without the GIF when posting with the image fails', async () => {
    const gifSessions = createSessionManager({
      client,
      motion,
      config: { ...config, gifBaseUrl: 'https://cdn.test/gifs' },
      logger: { error: mock.fn(), warn: mock.fn(), info: mock.fn() },
      now: () => clock,
      timers,
      random: () => 0,
    });
    await gifSessions.startSession('U1');
    client.chat.postMessage = mock.fn(async ({ blocks }) => {
      if (blocks.some((block) => block.type === 'image')) throw new Error('invalid_blocks');
      return { channel: 'D1', ts: '2.0' };
    });

    await gifSessions.triggerActivity('U1');

    assert.strictEqual(client.chat.postMessage.mock.callCount(), 2);
    assert.strictEqual(gifSessions.getStatus('U1').phase, 'moving');
  });
});
