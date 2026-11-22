import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import { createPomodoroConfigSubmitCallback } from '../../listeners/views/pomodoro-config.js';
import { pomodoroConfigModal } from '../../slackoff/messages.js';

const valuesFor = ({ work, sitting, active }) => ({
  work_minutes: { minutes: { value: work } },
  sitting_break_minutes: { minutes: { value: sitting } },
  active_break_minutes: { minutes: { value: active } },
});

describe('pomodoro config', () => {
  let sessions;
  let client;
  let ack;
  let callback;

  const submit = (values) =>
    callback({ ack, body: { user: { id: 'U1' } }, view: { state: { values } }, client, logger: { error: mock.fn() } });

  beforeEach(() => {
    sessions = {
      setPomodoro: mock.fn(),
      getStatus: () => ({
        active: false,
        completed: 0,
        headphonesStreaming: false,
        pomodoro: { workMinutes: 25, sittingBreakMinutes: 5, activeBreakMinutes: 5 },
      }),
    };
    client = { views: { publish: mock.fn() } };
    ack = mock.fn();
    callback = createPomodoroConfigSubmitCallback(sessions);
  });

  it('prefills the modal with the current settings', () => {
    const modal = pomodoroConfigModal({ workMinutes: 40, sittingBreakMinutes: 4, activeBreakMinutes: 8 });
    const initialValues = modal.blocks.filter((block) => block.type === 'input').map((b) => b.element.initial_value);
    assert.deepEqual(initialValues, ['40', '4', '8']);
  });

  it('saves valid settings and refreshes the Home tab', async () => {
    await submit(valuesFor({ work: '50', sitting: '3', active: '10' }));

    assert.deepEqual(ack.mock.calls[0].arguments, []);
    assert.deepEqual(sessions.setPomodoro.mock.calls[0].arguments, [
      'U1',
      { workMinutes: 50, sittingBreakMinutes: 3, activeBreakMinutes: 10 },
    ]);
    assert.strictEqual(client.views.publish.mock.callCount(), 1);
  });

  it('rejects out-of-range values with field errors', async () => {
    await submit(valuesFor({ work: '0', sitting: '5', active: '999' }));

    const [response] = ack.mock.calls[0].arguments;
    assert.strictEqual(response.response_action, 'errors');
    assert.deepEqual(Object.keys(response.errors), ['work_minutes', 'active_break_minutes']);
    assert.strictEqual(sessions.setPomodoro.mock.callCount(), 0);
  });
});
