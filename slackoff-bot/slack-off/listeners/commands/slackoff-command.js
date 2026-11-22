const HELP_TEXT = [
  '*Slack Off commands*',
  '`/slackoff start` – start a session (movement breaks until end of day)',
  '`/slackoff stop` – end your session',
  '`/slackoff now` – take a movement break right now',
  '`/slackoff status` – session and headphone status',
  '`/slackoff pair <n>` – use HeadMotionStreamer `--player <n>` as your headphones',
  '`/slackoff subscribe` / `unsubscribe` – daily morning reminder on or off',
].join('\n');

const statusText = (status) => {
  const headphones = status.headphonesStreaming
    ? `:headphones: headphone motion is streaming (player ${status.player}).`
    : `:warning: no headphone motion from player ${status.player}. Start HeadMotionStreamer, or tap Done after each break.`;
  if (!status.active) return `No session running. ${headphones}`;
  const phase = status.phase === 'moving' ? `on a break: *${status.activityName}*` : 'working';
  return `Session running: ${phase}. ${status.completed} breaks done. ${headphones}`;
};

const createSlackoffCommandCallback =
  (sessions) =>
  async ({ ack, command, respond, logger }) => {
    try {
      await ack();
      const userId = command.user_id;
      const [subcommand = 'help', argument] = command.text.trim().toLowerCase().split(/\s+/);

      if (subcommand === 'start') {
        const result = await sessions.startSession(userId);
        await respond(
          result.alreadyRunning ? 'You already have a session running.' : 'Session started. Check your DMs.',
        );
      } else if (subcommand === 'stop') {
        const stopped = await sessions.endSession(userId);
        await respond(stopped ? 'Session ended.' : 'No session is running.');
      } else if (subcommand === 'now') {
        const triggered = await sessions.triggerActivity(userId);
        await respond(triggered ? 'Break time! Check your DMs.' : 'Start a session first with `/slackoff start`.');
      } else if (subcommand === 'status') {
        await respond(statusText(sessions.getStatus(userId)));
      } else if (subcommand === 'pair') {
        const player = Number.parseInt(argument, 10);
        if (!Number.isInteger(player) || player < 1) {
          await respond('Usage: `/slackoff pair <player number>`');
          return;
        }
        sessions.pairPlayer(userId, player);
        await respond(statusText(sessions.getStatus(userId)));
      } else if (subcommand === 'subscribe') {
        sessions.subscribe(userId);
        await respond("You'll get a reminder to start a session every weekday morning.");
      } else if (subcommand === 'unsubscribe') {
        sessions.unsubscribe(userId);
        await respond('Morning reminders turned off.');
      } else {
        await respond(HELP_TEXT);
      }
    } catch (error) {
      logger.error(error);
    }
  };

export { createSlackoffCommandCallback, statusText };
