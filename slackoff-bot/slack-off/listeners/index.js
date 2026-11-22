import * as actions from './actions/index.js';
import * as commands from './commands/index.js';
import * as events from './events/index.js';
import * as messages from './messages/index.js';
import * as shortcuts from './shortcuts/index.js';
import * as views from './views/index.js';

export const registerListeners = (app, dependencies) => {
  actions.register(app, dependencies);
  commands.register(app, dependencies);
  events.register(app, dependencies);
  messages.register(app);
  shortcuts.register(app);
  views.register(app, dependencies);
};
