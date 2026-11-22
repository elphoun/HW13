import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import { createSlackoffCommandCallback } from '../../listeners/commands/slackoff-command.js';

describe('/slackoff command', () => {
  let sessions;
  let respond;
  let callback;

  let client;

  const run = (text) =>
    callback({
      ack: mock.fn(),
      command: { user_id: 'U1', text, trigger_id: 'T-1' },
      respond,
      client,
      logger: { error: mock.fn() },
    });

  beforeEach(() => {
    sessions = {
      startSession: mock.fn(async () => ({ alreadyRunning: false })),
      endSession: mock.fn(async () => true),
      triggerActivity: mock.fn(async () => true),
      pairPlayer: mock.fn(),
      subscribe: mock.fn(),
      unsubscribe: mock.fn(),
      getPomodoro: () => ({ workMinutes: 25, sittingBreakMinutes: 5, activeBreakMinutes: 5 }),
      getStatus: () => ({
        active: false,
        player: 1,
        headphonesStreaming: false,
        completed: 0,
        pomodoro: { workMinutes: 25, sittingBreakMinutes: 5, activeBreakMinutes: 5 },
      }),
    };
    client = { views: { open: mock.fn() } };
    respond = mock.fn();
    callback = createSlackoffCommandCallback(sessions);
  });

  it('starts a session', async () => {
    await run('start');
    assert.deepEqual(sessions.startSession.mock.calls[0].arguments, ['U1']);
  });

  it('reports missing headphone motion in status', async () => {
    await run('status');
    assert.match(respond.mock.calls[0].arguments[0], /no headphone motion/);
  });

  it('pairs a streamer player number', async () => {
    await run('pair 2');
    assert.deepEqual(sessions.pairPlayer.mock.calls[0].arguments, ['U1', 2]);
  });

  it('rejects an invalid player number', async () => {
    await run('pair abc');
    assert.strictEqual(sessions.pairPlayer.mock.callCount(), 0);
  });

  it('opens the pomodoro settings modal', async () => {
    await run('config');
    const [args] = client.views.open.mock.calls[0].arguments;
    assert.strictEqual(args.trigger_id, 'T-1');
    assert.strictEqual(args.view.callback_id, 'slackoff_pomodoro_config');
  });

  it('shows help for unknown input', async () => {
    await run('');
    assert.match(respond.mock.calls[0].arguments[0], /Slack Off commands/);
  });
});
