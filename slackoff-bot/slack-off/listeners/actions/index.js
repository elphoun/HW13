import { ACTION_IDS } from '../../slackoff/messages.js';
import { createOpenPomodoroConfigCallback } from './open-pomodoro-config.js';
import { sampleActionCallback } from './sample-action.js';
import { createSessionActionCallback, sessionActions } from './session-actions.js';

export const register = (app, { sessions }) => {
  app.action('sample_action_id', sampleActionCallback);
  app.action(ACTION_IDS.startSession, createSessionActionCallback(sessions, sessionActions.start));
  app.action(ACTION_IDS.stopSession, createSessionActionCallback(sessions, sessionActions.stop));
  app.action(ACTION_IDS.markDone, createSessionActionCallback(sessions, sessionActions.done));
  app.action(ACTION_IDS.skip, createSessionActionCallback(sessions, sessionActions.skip));
  app.action(ACTION_IDS.openPomodoroConfig, createOpenPomodoroConfigCallback(sessions));
};
