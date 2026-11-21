import { createAppHomeOpenedCallback } from './app-home-opened.js';

export const register = (app, { sessions }) => {
  app.event('app_home_opened', createAppHomeOpenedCallback(sessions));
};
