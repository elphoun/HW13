import { homeView } from '../../slackoff/messages.js';

const createAppHomeOpenedCallback =
  (sessions) =>
  async ({ client, event, logger }) => {
    if (event.tab !== 'home') return;

    try {
      sessions.subscribe(event.user);
      await client.views.publish({
        user_id: event.user,
        view: homeView({ userId: event.user, status: sessions.getStatus(event.user) }),
      });
    } catch (error) {
      logger.error(error);
    }
  };

export { createAppHomeOpenedCallback };
