import { pickActivity } from './activities.js';
import { activityFinished, activityPrompt, dayWrapped, sessionEndedSummary, sessionStarted } from './messages.js';
import { pickReactionGif } from './reaction-gifs.js';
import { createRepCounter } from './rep-counter.js';

const MINUTE_MS = 60_000;
const PROGRESS_UPDATE_GAP_MS = 1500;
const BREAK_CYCLE = ['stretch', 'activity'];

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
  const pomodoroByUser = new Map();

  const playerFor = (userId) => playersByUser.get(userId) ?? 1;
  const headphonesStreaming = (userId) => motion.isStreaming(playerFor(userId));
  const getPomodoro = (userId) => pomodoroByUser.get(userId) ?? config.pomodoro;
  const nextBreakCategory = (session) => BREAK_CYCLE[session.breaksStarted % BREAK_CYCLE.length];
  const breakMinutesFor = (userId, category) =>
    category === 'stretch' ? getPomodoro(userId).sittingBreakMinutes : getPomodoro(userId).activeBreakMinutes;

  const clearTimer = (session) => {
    if (session.timer) timers.clearTimeout(session.timer);
    session.timer = null;
  };

  const detachMotion = (session) => {
    session.unsubscribe?.();
    session.unsubscribe = null;
  };

  const minutesUntil = (time) => (time.getTime() - now().getTime()) / MINUTE_MS;

  const sessionEndTime = (workMinutes) => {
    const dayEnd = new Date(now());
    dayEnd.setHours(config.dayEndHour, 0, 0, 0);
    return minutesUntil(dayEnd) >= workMinutes ? dayEnd : null;
  };

  const postInThread = (session, message) =>
    client.chat.postMessage({ channel: session.channel, thread_ts: session.threadTs, ...message });

  const scheduleNextBreak = (userId) => {
    const session = sessions.get(userId);
    if (!session) return false;
    const { workMinutes } = getPomodoro(userId);
    if (session.endsAt && minutesUntil(session.endsAt) < workMinutes) return false;
    session.phase = 'working';
    session.timer = timers.setTimeout(() => {
      triggerActivity(userId).catch((error) => logger.error(error));
    }, workMinutes * MINUTE_MS);
    return true;
  };

  const startSession = async (userId) => {
    subscribers.add(userId);
    if (sessions.has(userId)) return { alreadyRunning: true };
    const pomodoro = getPomodoro(userId);
    const endsAt = sessionEndTime(pomodoro.workMinutes);
    const session = { userId, phase: 'working', completed: 0, breaksStarted: 0, timer: null, endsAt };
    sessions.set(userId, session);
    const streaming = headphonesStreaming(userId);
    if (!streaming) logger.warn(`No headphone motion from player ${playerFor(userId)} for ${userId}`);
    const response = await client.chat.postMessage({
      channel: userId,
      ...sessionStarted({ pomodoro, headphonesStreaming: streaming, motionPort: config.motionPort, endsAt }),
    });
    session.channel = response?.channel ?? userId;
    session.threadTs = response?.ts;
    scheduleNextBreak(userId);
    return { alreadyRunning: false, headphonesStreaming: streaming };
  };

  const endSession = async (userId) => {
    const session = sessions.get(userId);
    if (!session) return false;
    clearTimer(session);
    detachMotion(session);
    sessions.delete(userId);
    await postInThread(session, dayWrapped(session.completed));
    if (session.threadTs) {
      await client.chat
        .update({ channel: session.channel, ts: session.threadTs, ...sessionEndedSummary(session.completed) })
        .catch((error) => logger.error(error));
    }
    return true;
  };

  const renderPrompt = (userId, session) =>
    activityPrompt({
      userId,
      activity: session.activity,
      reps: session.counter.reps,
      breakMinutes: session.breakMinutes,
      headphonesStreaming: headphonesStreaming(userId),
      gifBaseUrl: session.gifBaseUrl,
      motionPort: config.motionPort,
    });

  const postPrompt = async (userId, session) => {
    session.gifBaseUrl = config.gifBaseUrl;
    try {
      return await postInThread(session, renderPrompt(userId, session));
    } catch (error) {
      if (!session.gifBaseUrl) throw error;
      logger.warn(`Activity prompt failed (likely the GIF URL), retrying without image: ${error.message}`);
      session.gifBaseUrl = null;
      return postInThread(session, renderPrompt(userId, session));
    }
  };

  const updatePrompt = (userId, session) => {
    if (!session.promptTs) return Promise.resolve();
    return client.chat
      .update({ channel: session.channel, ts: session.promptTs, ...renderPrompt(userId, session) })
      .catch((error) => logger.error(error));
  };

  const triggerActivity = async (userId) => {
    const session = sessions.get(userId);
    if (!session) return false;
    clearTimer(session);
    detachMotion(session);
    const category = nextBreakCategory(session);
    session.breaksStarted += 1;
    session.phase = 'moving';
    session.activity = pickActivity(category, session.lastActivityId, random);
    session.lastActivityId = session.activity.id;
    session.breakMinutes = breakMinutesFor(userId, category);
    session.counter = createRepCounter(session.activity.rule);
    session.lastProgressUpdate = 0;

    const response = await postPrompt(userId, session);
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
    }, session.breakMinutes * MINUTE_MS);
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
    const result = {
      activity: session.activity,
      reps: session.counter.reps,
      outcome,
      nextBreakMinutes: scheduled ? getPomodoro(userId).workMinutes : null,
      nextBreakCategory: nextBreakCategory(session),
    };
    const gifUrl = pickReactionGif(outcome, config.reactionGifs, random);
    try {
      await postInThread(session, activityFinished({ ...result, gifUrl }));
    } catch (error) {
      if (!gifUrl) throw error;
      logger.warn(`Result message failed (likely the GIF URL), retrying without image: ${error.message}`);
      await postInThread(session, activityFinished(result));
    }
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
      pomodoro: getPomodoro(userId),
    };
  };

  return {
    startSession,
    endSession,
    triggerActivity,
    markDone: (userId) => finishActivity(userId, 'manual'),
    skip: (userId) => finishActivity(userId, 'skipped'),
    getStatus,
    getPomodoro,
    setPomodoro: (userId, pomodoro) => pomodoroByUser.set(userId, pomodoro),
    pairPlayer: (userId, player) => playersByUser.set(userId, player),
    subscribe: (userId) => subscribers.add(userId),
    unsubscribe: (userId) => subscribers.delete(userId),
    subscribers: () => [...subscribers],
  };
};

export { createSessionManager };
