import { pomodoroConfigModal } from '../../slackoff/messages.js';

const createOpenPomodoroConfigCallback =
  (sessions) =>
  async ({ ack, body, client, logger }) => {
    try {
      await ack();
      await client.views.open({
        trigger_id: body.trigger_id,
        view: pomodoroConfigModal(sessions.getPomodoro(body.user.id)),
      });
    } catch (error) {
      logger.error(error);
    }
  };

export { createOpenPomodoroConfigCallback };
