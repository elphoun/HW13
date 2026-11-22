import { loadReactionGifs } from './reaction-gifs.js';

const numberFromEnv = (value, fallback) => {
  const parsed = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : fallback;
};

const loadConfig = (env = process.env) => ({
  dayStartHour: numberFromEnv(env.SLACKOFF_DAY_START_HOUR, 9),
  dayEndHour: numberFromEnv(env.SLACKOFF_DAY_END_HOUR, 17),
  pomodoro: {
    workMinutes: numberFromEnv(env.SLACKOFF_WORK_MINUTES, 25),
    sittingBreakMinutes: numberFromEnv(env.SLACKOFF_SITTING_BREAK_MINUTES, 5),
    activeBreakMinutes: numberFromEnv(env.SLACKOFF_ACTIVE_BREAK_MINUTES, 5),
  },
  motionPort: numberFromEnv(env.SLACKOFF_MOTION_UDP_PORT, 9001),
  gifBaseUrl: env.SLACKOFF_GIF_BASE_URL || null,
  reactionGifs: loadReactionGifs(env),
  subscriberIds: (env.SLACKOFF_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
});

export { loadConfig };
