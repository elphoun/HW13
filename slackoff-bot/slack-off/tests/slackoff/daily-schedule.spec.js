import assert from 'node:assert';
import { describe, it, mock } from 'node:test';
import { createDailySchedule, nextStartTime } from '../../slackoff/daily-schedule.js';

describe('daily schedule', () => {
  it('schedules today at 9 when it is before 9 on a weekday', () => {
    const next = nextStartTime(new Date(2026, 10, 23, 7, 30), 9);
    assert.deepEqual(next, new Date(2026, 10, 23, 9, 0));
  });

  it('skips to Monday after Friday 9am', () => {
    const next = nextStartTime(new Date(2026, 10, 27, 10, 0), 9);
    assert.deepEqual(next, new Date(2026, 10, 30, 9, 0));
  });

  it('DMs a start-session reminder to every subscriber', async () => {
    const client = { chat: { postMessage: mock.fn(async () => ({})) } };
    const schedule = createDailySchedule({
      client,
      sessions: { subscribers: () => ['U1', 'U2'] },
      config: { dayStartHour: 9 },
      logger: { error: mock.fn(), info: mock.fn() },
    });

    await schedule.sendReminders();

    const calls = client.chat.postMessage.mock.calls.map((call) => call.arguments[0]);
    assert.deepEqual(
      calls.map((call) => call.channel),
      ['U1', 'U2'],
    );
    assert(JSON.stringify(calls[0].blocks).includes('slackoff_start_session'));
  });
});
