import { morningReminder } from './messages.js';

const WEEKEND = new Set([0, 6]);

const nextStartTime = (from, startHour) => {
  const next = new Date(from);
  next.setHours(startHour, 0, 0, 0);
  if (next <= from) next.setDate(next.getDate() + 1);
  while (WEEKEND.has(next.getDay())) next.setDate(next.getDate() + 1);
  return next;
};

const createDailySchedule = ({
  client,
  sessions,
  config,
  logger = console,
  now = () => new Date(),
  timers = { setTimeout, clearTimeout },
}) => {
  let timer = null;

  const sendReminders = async () => {
    const results = await Promise.allSettled(
      sessions.subscribers().map((userId) => client.chat.postMessage({ channel: userId, ...morningReminder(userId) })),
    );
    for (const result of results) {
      if (result.status === 'rejected') logger.error(result.reason);
    }
  };

  const scheduleNext = () => {
    const current = now();
    const at = nextStartTime(current, config.dayStartHour);
    logger.info(`Next morning reminder at ${at.toString()}`);
    timer = timers.setTimeout(async () => {
      await sendReminders();
      scheduleNext();
    }, at.getTime() - current.getTime());
  };

  return {
    start: scheduleNext,
    stop: () => timers.clearTimeout(timer),
    sendReminders,
  };
};

export { createDailySchedule, nextStartTime };
