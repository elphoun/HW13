import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import { createAppHomeOpenedCallback } from '../../listeners/events/app-home-opened.js';

describe('events', () => {
  let fakeClient;
  let fakeEvent;
  let fakeLogger;
  let fakeSessions;
  let appHomeOpenedCallback;

  beforeEach(() => {
    fakeClient = { views: { publish: mock.fn() } };
    fakeEvent = { tab: 'home', user: 'U123' };
    fakeLogger = { error: mock.fn() };
    fakeSessions = {
      subscribe: mock.fn(),
      getStatus: () => ({
        active: false,
        completed: 0,
        headphonesStreaming: false,
        pomodoro: { workMinutes: 25, sittingBreakMinutes: 5, activeBreakMinutes: 5 },
      }),
    };
    appHomeOpenedCallback = createAppHomeOpenedCallback(fakeSessions);
  });

  it('should publish home view and subscribe the user when tab is home', async () => {
    await appHomeOpenedCallback({ client: fakeClient, event: fakeEvent, logger: fakeLogger });

    assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
    const callArgs = fakeClient.views.publish.mock.calls[0].arguments[0];
    assert.equal(callArgs.user_id, fakeEvent.user);
    assert.equal(callArgs.view.type, 'home');
    assert.deepEqual(fakeSessions.subscribe.mock.calls[0].arguments, ['U123']);
  });

  it('should not publish when event tab is not home', async () => {
    fakeEvent.tab = 'about';

    await appHomeOpenedCallback({ client: fakeClient, event: fakeEvent, logger: fakeLogger });

    assert.strictEqual(fakeClient.views.publish.mock.callCount(), 0);
  });

  it('should log error when views publish throws exception', async () => {
    const testError = new Error('test exception');
    fakeClient.views.publish = mock.fn(() => {
      throw testError;
    });

    await appHomeOpenedCallback({ client: fakeClient, event: fakeEvent, logger: fakeLogger });

    assert.deepEqual(fakeLogger.error.mock.calls[0].arguments, [testError]);
  });
});
