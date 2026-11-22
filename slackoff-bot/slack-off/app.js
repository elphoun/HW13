import { App, LogLevel } from '@slack/bolt';
import { config } from 'dotenv';
import { registerListeners } from './listeners/index.js';
import { loadConfig } from './slackoff/config.js';
import { createDailySchedule } from './slackoff/daily-schedule.js';
import { createMotionListener } from './slackoff/motion-listener.js';
import { createSessionManager } from './slackoff/session-manager.js';

config();

const slackoffConfig = loadConfig();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: process.env.SLACK_LOG_LEVEL ?? LogLevel.INFO,
  clientOptions: {
    slackApiUrl: process.env.SLACK_API_URL,
  },
});

const motion = createMotionListener({ port: slackoffConfig.motionPort, logger: app.logger });
const sessions = createSessionManager({ client: app.client, motion, config: slackoffConfig, logger: app.logger });
const dailySchedule = createDailySchedule({ client: app.client, sessions, config: slackoffConfig, logger: app.logger });

registerListeners(app, { sessions });

(async () => {
  try {
    await app.start();
    app.logger.info('⚡️ Bolt app is running!');
  } catch (error) {
    app.logger.error('Failed to start the app', error);
    return;
  }

  try {
    await motion.start();
  } catch (error) {
    app.logger.error(
      `Could not listen for headphone motion on UDP :${slackoffConfig.motionPort}. Breaks will need a manual Done.`,
      error,
    );
  }

  dailySchedule.start();
})();
