import { homeView, POMODORO_CONFIG } from '../../slackoff/messages.js';

const readPomodoro = (values) => {
  const pomodoro = {};
  const errors = {};
  for (const [key, field] of Object.entries(POMODORO_CONFIG.fields)) {
    const minutes = Number(values[field.blockId]?.[POMODORO_CONFIG.actionId]?.value);
    if (!Number.isInteger(minutes) || minutes < POMODORO_CONFIG.minMinutes || minutes > POMODORO_CONFIG.maxMinutes) {
      errors[field.blockId] =
        `Enter a whole number from ${POMODORO_CONFIG.minMinutes} to ${POMODORO_CONFIG.maxMinutes}.`;
    } else {
      pomodoro[key] = minutes;
    }
  }
  return { pomodoro, errors };
};

const createPomodoroConfigSubmitCallback =
  (sessions) =>
  async ({ ack, body, view, client, logger }) => {
    try {
      const { pomodoro, errors } = readPomodoro(view.state.values);
      if (Object.keys(errors).length > 0) {
        await ack({ response_action: 'errors', errors });
        return;
      }
      await ack();
      const userId = body.user.id;
      sessions.setPomodoro(userId, pomodoro);
      await client.views.publish({ user_id: userId, view: homeView({ userId, status: sessions.getStatus(userId) }) });
    } catch (error) {
      logger.error(error);
    }
  };

export { createPomodoroConfigSubmitCallback, readPomodoro };
