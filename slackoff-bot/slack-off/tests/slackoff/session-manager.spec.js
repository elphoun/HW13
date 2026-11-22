import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import { createMotionListener } from '../../slackoff/motion-listener.js';
import { createSessionManager } from '../../slackoff/session-manager.js';

const config = {
  dayStartHour: 9,
  dayEndHour: 17,
  pomodoro: { workMinutes: 25, sittingBreakMinutes: 5, activeBreakMinutes: 7 },
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
const MINUTE = 60_000;
const neutral = { roll: 0, pitch: 0, yaw: 0, ax: 0, ay: 0, az: 0, gx: 0, gy: -1, gz: 0 };

describe('session manager', () => {
  let client;
  let timers;
  let motion;
  let clock;
  let sessions;
  let nextTs;

  const postedArgs = () => client.chat.postMessage.mock.calls.map((call) => call.arguments[0]);
  const posts = () => postedArgs().map((message) => message.text);

  const createManager = (overrides = {}) =>
    createSessionManager({
      client,
      motion,
      config: { ...config, ...overrides },
      logger: { error: mock.fn(), warn: mock.fn(), info: mock.fn() },
      now: () => clock,
      timers,
      random: () => 0,
    });

  beforeEach(() => {
    nextTs = 0;
    client = {
      chat: {
        postMessage: mock.fn(async ({ channel }) => {
          nextTs += 1;
          return { channel: `D-${channel}`, ts: `${nextTs}.0` };
        }),
        update: mock.fn(async () => ({})),
      },
    };
    timers = createFakeTimers();
    clock = new Date(2026, 10, 23, 9, 0, 0);
    motion = createMotionListener({ port: 0, now: () => clock.getTime() });
    sessions = createManager();
  });

  it('posts the session start as a top-level DM and warns when no headphone motion is streaming', async () => {
    const result = await sessions.startSession('U1');

    assert.strictEqual(result.headphonesStreaming, false);
    const [startMessage] = postedArgs();
    assert.strictEqual(startMessage.channel, 'U1');
    assert.strictEqual(startMessage.thread_ts, undefined);
    assert(JSON.stringify(startMessage.blocks).includes('No headphone motion detected'));
    assert.strictEqual(timers.pending[0].ms, 25 * MINUTE);
  });

  it('posts every later session message in the start message thread', async () => {
    await sessions.startSession('U1');
    await sessions.triggerActivity('U1');
    await sessions.markDone('U1');
    await sessions.endSession('U1');

    const [, ...replies] = postedArgs();
    assert.strictEqual(replies.length, 3);
    for (const reply of replies) {
      assert.strictEqual(reply.channel, 'D-U1');
      assert.strictEqual(reply.thread_ts, '1.0');
    }
    const parentUpdate = client.chat.update.mock.calls.at(-1).arguments[0];
    assert.strictEqual(parentUpdate.ts, '1.0');
    assert.match(parentUpdate.text, /session ended/);
  });

  it('mentions the user in break prompts so the thread reply notifies them', async () => {
    await sessions.startSession('U1');
    await sessions.triggerActivity('U1');

    assert(JSON.stringify(postedArgs()[1].blocks).includes('<@U1>'));
  });

  it('alternates sitting and active breaks with their own lengths', async () => {
    await sessions.startSession('U1');

    await timers.runNext();
    assert.match(posts()[1], /^Sitting break: /);
    assert.strictEqual(timers.pending[0].ms, 5 * MINUTE);
    await sessions.markDone('U1');
    assert.match(posts().at(-1), /active break in 25 minutes/);
    assert.strictEqual(timers.pending[0].ms, 25 * MINUTE);

    await timers.runNext();
    assert.match(posts().at(-1), /^Active break: /);
    assert.strictEqual(timers.pending[0].ms, 7 * MINUTE);
    await sessions.skip('U1');
    assert.match(posts().at(-1), /sitting break in 25 minutes/);
  });

  it('uses per-user pomodoro settings', async () => {
    sessions.setPomodoro('U1', { workMinutes: 50, sittingBreakMinutes: 3, activeBreakMinutes: 10 });
    await sessions.startSession('U1');
    assert.strictEqual(timers.pending[0].ms, 50 * MINUTE);
    await timers.runNext();
    assert.strictEqual(timers.pending[0].ms, 3 * MINUTE);
    assert.deepEqual(sessions.getPomodoro('U2'), config.pomodoro);
  });

  it('completes a break from detected motion', async () => {
    motion.receive({ p: 1, t: 0, ...neutral });
    await sessions.startSession('U1');
    await timers.runNext();

    assert.match(posts()[1], /Sitting break: Neck tilts/);
    const rolls = [0, 0.4, -0.4, 0.4, -0.4, 0.4, -0.4, 0.4];
    rolls.forEach((roll, index) => {
      motion.receive({ p: 1, t: index + 1, ...neutral, roll });
    });
    await settle();

    assert.match(
      posts().at(-1),
      /\*Nice work!\* Neck tilts done \(6 reps detected\)\. You've finished \*1\* break today\./,
    );
    assert.strictEqual(sessions.getStatus('U1').completed, 1);
  });

  it('ignores motion from a different player', async () => {
    await sessions.startSession('U1');
    await sessions.triggerActivity('U1');
    for (let i = 0; i < 20; i += 1) {
      motion.receive({ p: 2, t: i, ...neutral, roll: i % 2 ? 0.5 : -0.5 });
    }
    await settle();
    assert.strictEqual(sessions.getStatus('U1').phase, 'moving');
  });

  it('times out an unfinished break and schedules the next work block', async () => {
    await sessions.startSession('U1');
    await sessions.triggerActivity('U1');
    await timers.runNext();

    assert.match(posts().at(-1), /Time's up/);
    assert.strictEqual(sessions.getStatus('U1').phase, 'working');
  });

  it('only counts finished breaks: not timeouts and not skips', async () => {
    await sessions.startSession('U1');
    await sessions.triggerActivity('U1');
    await timers.runNext();
    assert.strictEqual(sessions.getStatus('U1').completed, 0);

    await sessions.triggerActivity('U1');
    await sessions.skip('U1');
    assert.strictEqual(sessions.getStatus('U1').completed, 0);

    await sessions.triggerActivity('U1');
    await sessions.markDone('U1');
    assert.strictEqual(sessions.getStatus('U1').completed, 1);
  });

  it('ends the session when the next work block would run past the end of day', async () => {
    await sessions.startSession('U1');
    await sessions.triggerActivity('U1');
    clock = new Date(2026, 10, 23, 16, 45, 0);
    await sessions.skip('U1');

    assert.match(posts().at(-1), /Session over/);
    assert.strictEqual(sessions.getStatus('U1').active, false);
    assert.strictEqual(timers.pending.length, 0);
  });

  it('keeps an after-hours session running until the user ends it', async () => {
    clock = new Date(2026, 10, 21, 19, 25, 0);
    await sessions.startSession('U1');

    assert.match(JSON.stringify(postedArgs()[0].blocks), /runs until you end it/);
    clock = new Date(2026, 10, 21, 23, 50, 0);
    await sessions.triggerActivity('U1');
    await sessions.markDone('U1');
    assert.strictEqual(sessions.getStatus('U1').active, true);
  });

  it('says when a daytime session ends', async () => {
    await sessions.startSession('U1');
    assert.match(JSON.stringify(postedArgs()[0].blocks), /runs until 5:00/);
  });

  it('retries the prompt without the GIF when posting with the image fails', async () => {
    const gifSessions = createManager({ gifBaseUrl: 'https://cdn.test/gifs' });
    await gifSessions.startSession('U1');
    client.chat.postMessage = mock.fn(async ({ blocks }) => {
      if (blocks.some((block) => block.type === 'image')) throw new Error('invalid_blocks');
      return { channel: 'D1', ts: '2.0' };
    });

    await gifSessions.triggerActivity('U1');

    assert.strictEqual(client.chat.postMessage.mock.callCount(), 2);
    assert.strictEqual(client.chat.postMessage.mock.calls[1].arguments[0].thread_ts, '1.0');
    assert.strictEqual(gifSessions.getStatus('U1').phase, 'moving');
  });
  describe('reaction gifs', () => {
    const reactionGifs = { happy: ['https://gifs.test/happy.gif'], sad: ['https://gifs.test/sad.gif'] };
    const lastImage = () =>
      postedArgs()
        .at(-1)
        .blocks.find((block) => block.type === 'image')?.image_url;

    it('sends a happy gif when the break is finished from detected motion', async () => {
      const gifSessions = createManager({ reactionGifs });
      motion.receive({ p: 1, t: 0, ...neutral });
      await gifSessions.startSession('U1');
      await timers.runNext();
      [0, 0.4, -0.4, 0.4, -0.4, 0.4, -0.4, 0.4].forEach((roll, index) => {
        motion.receive({ p: 1, t: index + 1, ...neutral, roll });
      });
      await settle();

      assert.match(posts().at(-1), /done/);
      assert.strictEqual(lastImage(), 'https://gifs.test/happy.gif');
    });

    it('sends a happy gif when the user taps Done', async () => {
      const gifSessions = createManager({ reactionGifs });
      await gifSessions.startSession('U1');
      await gifSessions.triggerActivity('U1');
      await gifSessions.markDone('U1');

      assert.strictEqual(lastImage(), 'https://gifs.test/happy.gif');
    });

    it('sends a sad gif when the break time runs out', async () => {
      const gifSessions = createManager({ reactionGifs });
      await gifSessions.startSession('U1');
      await gifSessions.triggerActivity('U1');
      await timers.runNext();

      assert.match(
        posts().at(-1),
        /\*Time's up!\* You didn't finish .* \(0\/\d+ reps\), so it doesn't count\. Try again next break!/,
      );
      assert.strictEqual(lastImage(), 'https://gifs.test/sad.gif');
    });

    it('sends no gif when the user skips', async () => {
      const gifSessions = createManager({ reactionGifs });
      await gifSessions.startSession('U1');
      await gifSessions.triggerActivity('U1');
      await gifSessions.skip('U1');

      assert.strictEqual(lastImage(), undefined);
    });

    it('retries the result without the gif when Slack rejects the image', async () => {
      const gifSessions = createManager({ reactionGifs });
      await gifSessions.startSession('U1');
      await gifSessions.triggerActivity('U1');
      const before = client.chat.postMessage.mock.callCount();
      client.chat.postMessage = mock.fn(async ({ blocks }) => {
        if (blocks.some((block) => block.type === 'image')) throw new Error('invalid_blocks');
        return { channel: 'D1', ts: '9.0' };
      });
      await gifSessions.markDone('U1');

      assert.strictEqual(client.chat.postMessage.mock.callCount(), 2);
      assert.ok(before > 0);
      assert.match(client.chat.postMessage.mock.calls[1].arguments[0].text, /marked done/);
    });
  });
});
