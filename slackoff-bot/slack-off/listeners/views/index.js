import { POMODORO_CONFIG } from '../../slackoff/messages.js';
import { createPomodoroConfigSubmitCallback } from './pomodoro-config.js';
import { sampleViewCallback } from './sample-view.js';

export const register = (app, { sessions }) => {
  app.view('sample_view_id', sampleViewCallback);
  app.view(POMODORO_CONFIG.callbackId, createPomodoroConfigSubmitCallback(sessions));
};
