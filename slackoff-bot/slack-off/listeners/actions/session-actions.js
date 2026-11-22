import { homeView } from '../../slackoff/messages.js';

const refreshHome = (client, sessions, userId) =>
  client.views.publish({ user_id: userId, view: homeView({ userId, status: sessions.getStatus(userId) }) });

const createSessionActionCallback =
  (sessions, runAction) =>
  async ({ ack, body, client, logger }) => {
    try {
      await ack();
      const userId = body.user.id;
      await runAction(sessions, userId);
      if (body.view?.type === 'home') await refreshHome(client, sessions, userId);
    } catch (error) {
      logger.error(error);
    }
  };

const sessionActions = {
  start: (sessions, userId) => sessions.startSession(userId),
  stop: (sessions, userId) => sessions.endSession(userId),
  done: (sessions, userId) => sessions.markDone(userId),
  skip: (sessions, userId) => sessions.skip(userId),
};

export { createSessionActionCallback, sessionActions };
