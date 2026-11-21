import { pickActivity } from './activities.js';
import { activityFinished, activityPrompt, dayWrapped, sessionStarted } from './messages.js';
import { createRepCounter } from './rep-counter.js';

const MINUTE_MS = 60_000;
const PROGRESS_UPDATE_GAP_MS = 1500;

const createSessionManager = ({
  client,
  motion,
  config,
  logger = console,
  now = () => new Date(),
  timers = { setTimeout, clearTimeout },
  random = Math.random,
}) => {
  const sessions = new Map();
  const subscribers = new Set(config.subscriberIds);
  const playersByUser = new Map();

  const playerFor = (userId) => playersByUser.get(userId) ?? 1;
  const headphonesStreaming = (userId) => motion.isStreaming(playerFor(userId));

  const clearTimer = (session) => {
    if (session.timer) timers.clearTimeout(session.timer);
    session.timer = null;
  };

  const detachMotion = (session) => {
    session.unsubscribe?.();
    session.unsubscribe = null;
  };

  const minutesUntilDayEnd = () => {
    const current = now();
    const end = new Date(current);
    end.setHours(config.dayEndHour, 0, 0, 0);
    return (end.getTime() - current.getTime()) / MINUTE_MS;
  };

  const post = (userId, message) => client.chat.postMessage({ channel: userId, ...message });

  const scheduleNextBreak = (userId) => {
    const session = sessions.get(userId);
    if (!session) return false;
    if (minutesUntilDayEnd() < config.workIntervalMinutes) return false;
    session.phase = 'working';
    session.timer = timers.setTimeout(() => {
      triggerActivity(userId).catch((error) => logger.error(error));
    }, config.workIntervalMinutes * MINUTE_MS);
    return true;
  };

  const startSession = async (userId) => {
    subscribers.add(userId);
    if (sessions.has(userId)) return { alreadyRunning: true };
    sessions.set(userId, { userId, phase: 'working', completed: 0, timer: null, lastActivityId: null });
    const streaming = headphonesStreaming(userId);
    if (!streaming) logger.warn(`No headphone motion from player ${playerFor(userId)} for ${userId}`);
    await post(
      userId,
      sessionStarted({
        workIntervalMinutes: config.workIntervalMinutes,
        headphonesStreaming: streaming,
        motionPort: config.motionPort,
      }),
    );
    if (!scheduleNextBreak(userId)) await endSession(userId);
    return { alreadyRunning: false, headphonesStreaming: streaming };
  };

  const endSession = async (userId) => {
    const session = sessions.get(userId);
    if (!session) return false;
    clearTimer(session);
    detachMotion(session);
    sessions.delete(userId);
    await post(userId, dayWrapped(session.completed));
    return true;
  };

  const renderPrompt = (userId, session) =>
    activityPrompt({
      activity: session.activity,
      reps: session.counter.reps,
      headphonesStreaming: headphonesStreaming(userId),
      gifBaseUrl: session.gifBaseUrl,
      motionPort: config.motionPort,
    });

  const postPrompt = async (userId, session) => {
    session.gifBaseUrl = config.gifBaseUrl;
    try {
      return await post(userId, renderPrompt(userId, session));
    } catch (error) {
      if (!session.gifBaseUrl) throw error;
      logger.warn(`Activity prompt failed (likely the GIF URL), retrying without image: ${error.message}`);
      session.gifBaseUrl = null;
      return post(userId, renderPrompt(userId, session));
    }
  };

  const updatePrompt = (userId, session) => {
    if (!session.promptTs) return Promise.resolve();
    return client.chat
      .update({ channel: session.promptChannel, ts: session.promptTs, ...renderPrompt(userId, session) })
      .catch((error) => logger.error(error));
  };

  const triggerActivity = async (userId) => {
    const session = sessions.get(userId);
    if (!session) return false;
    clearTimer(session);
    detachMotion(session);
    session.phase = 'moving';
    session.activity = pickActivity(session.lastActivityId, random);
    session.lastActivityId = session.activity.id;
    session.counter = createRepCounter(session.activity.rule);
    session.lastProgressUpdate = 0;

    const response = await postPrompt(userId, session);
    session.promptChannel = response?.channel;
    session.promptTs = response?.ts;

    const player = playerFor(userId);
    session.unsubscribe = motion.onSample((sample) => {
      if (sample.p !== player || session.phase !== 'moving') return;
      const before = session.counter.reps;
      const reps = session.counter.push(sample);
      if (reps === before) return;
      if (reps >= session.activity.targetReps) {
        finishActivity(userId, 'detected').catch((error) => logger.error(error));
        return;
      }
      const stamp = now().getTime();
      if (stamp - session.lastProgressUpdate >= PROGRESS_UPDATE_GAP_MS) {
        session.lastProgressUpdate = stamp;
        updatePrompt(userId, session);
      }
    });

    session.timer = timers.setTimeout(() => {
      finishActivity(userId, 'timeout').catch((error) => logger.error(error));
    }, config.activityTimeoutMinutes * MINUTE_MS);
    return true;
  };

  const finishActivity = async (userId, outcome) => {
    const session = sessions.get(userId);
    if (session?.phase !== 'moving') return false;
    clearTimer(session);
    detachMotion(session);
    session.phase = 'working';
    if (outcome !== 'skipped') session.completed += 1;
    await updatePrompt(userId, session);
    const scheduled = scheduleNextBreak(userId);
    await post(
      userId,
      activityFinished({
        activity: session.activity,
        reps: session.counter.reps,
        outcome,
        nextBreakMinutes: scheduled ? config.workIntervalMinutes : null,
      }),
    );
    if (!scheduled) await endSession(userId);
    return true;
  };

  const getStatus = (userId) => {
    const session = sessions.get(userId);
    return {
      active: Boolean(session),
      phase: session?.phase ?? null,
      activityName: session?.phase === 'moving' ? session.activity.name : null,
      completed: session?.completed ?? 0,
      player: playerFor(userId),
      headphonesStreaming: headphonesStreaming(userId),
    };
  };

  return {
    startSession,
    endSession,
    triggerActivity,
    markDone: (userId) => finishActivity(userId, 'manual'),
    skip: (userId) => finishActivity(userId, 'skipped'),
    getStatus,
    pairPlayer: (userId, player) => playersByUser.set(userId, player),
    subscribe: (userId) => subscribers.add(userId),
    unsubscribe: (userId) => subscribers.delete(userId),
    subscribers: () => [...subscribers],
  };
};

export { createSessionManager };
