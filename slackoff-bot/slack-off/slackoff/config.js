const numberFromEnv = (value, fallback) => {
  const parsed = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : fallback;
};

const loadConfig = (env = process.env) => ({
  dayStartHour: numberFromEnv(env.SLACKOFF_DAY_START_HOUR, 9),
  dayEndHour: numberFromEnv(env.SLACKOFF_DAY_END_HOUR, 17),
  workIntervalMinutes: numberFromEnv(env.SLACKOFF_WORK_INTERVAL_MINUTES, 30),
  activityTimeoutMinutes: numberFromEnv(env.SLACKOFF_ACTIVITY_TIMEOUT_MINUTES, 5),
  motionPort: numberFromEnv(env.SLACKOFF_MOTION_UDP_PORT, 9001),
  gifBaseUrl: env.SLACKOFF_GIF_BASE_URL || null,
  subscriberIds: (env.SLACKOFF_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
});

export { loadConfig };
