import { sampleCommandCallback } from './sample-command.js';
import { createSlackoffCommandCallback } from './slackoff-command.js';

export const register = (app, { sessions }) => {
  app.command('/sample-command', sampleCommandCallback);
  app.command('/slackoff', createSlackoffCommandCallback(sessions));
};
