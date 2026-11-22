import { gifUrlFor } from './activities.js';

const ACTION_IDS = {
  startSession: 'slackoff_start_session',
  stopSession: 'slackoff_stop_session',
  markDone: 'slackoff_mark_done',
  skip: 'slackoff_skip',
  openPomodoroConfig: 'slackoff_open_pomodoro_config',
};

const POMODORO_CONFIG = {
  callbackId: 'slackoff_pomodoro_config',
  fields: {
    workMinutes: { blockId: 'work_minutes', label: 'Work block (minutes)' },
    sittingBreakMinutes: { blockId: 'sitting_break_minutes', label: 'Sitting break (minutes)' },
    activeBreakMinutes: { blockId: 'active_break_minutes', label: 'Active break (minutes)' },
  },
  actionId: 'minutes',
  minMinutes: 1,
  maxMinutes: 180,
};

const BREAK_LABELS = { stretch: 'Sitting break', activity: 'Active break' };

const button = (text, actionId, style) => ({
  type: 'button',
  text: { type: 'plain_text', text },
  action_id: actionId,
  ...(style ? { style } : {}),
});

const section = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });

const header = (text) => ({
  type: 'header',
  text: { type: 'plain_text', text: text.length > 150 ? `${text.slice(0, 149)}…` : text, emoji: true },
});

const morningReminder = (userId) => ({
  text: 'Good morning! Ready to start your Slack Off session?',
  blocks: [
    section(
      `:sunrise: Good morning <@${userId}>! Start a Slack Off session and I'll nudge you to move throughout the day.`,
    ),
    { type: 'actions', elements: [button('Start session', ACTION_IDS.startSession, 'primary')] },
  ],
});

const sessionLength = (endsAt) =>
  endsAt
    ? `It runs until ${endsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`
    : "It's outside work hours, so it runs until you end it.";

const pomodoroCycle = ({ workMinutes, sittingBreakMinutes, activeBreakMinutes }) =>
  `Work ${workMinutes} min → sitting break ${sittingBreakMinutes} min → work ${workMinutes} min → active break ${activeBreakMinutes} min, repeat`;

const sessionStarted = ({ pomodoro, headphonesStreaming, motionPort, endsAt }) => ({
  text: `Session started. First break in ${pomodoro.workMinutes} minutes.`,
  blocks: [
    section(
      `:stopwatch: Session started! Your first break is in *${pomodoro.workMinutes} minutes*. ${sessionLength(endsAt)}\n*Cycle:* ${pomodoroCycle(pomodoro)}\n:thread: Breaks and updates for this session appear in this thread.`,
    ),
    ...(headphonesStreaming
      ? [section(':headphones: Headphone motion detected. I will count your reps automatically.')]
      : []),
    ...(headphonesStreaming ? [] : [headphoneWarning(motionPort)]),
    { type: 'actions', elements: [button('End session', ACTION_IDS.stopSession, 'danger')] },
  ],
});

const DEFAULT_STREAMER_BOT_PORT = 9001;

const streamerCommand = (motionPort) =>
  motionPort === DEFAULT_STREAMER_BOT_PORT
    ? 'swift run HeadMotionStreamer'
    : `swift run HeadMotionStreamer --bot-port ${motionPort}`;

const headphoneWarning = (motionPort) =>
  section(
    `:warning: *No headphone motion detected.* Slack can't read AirPod motion on its own, so I listen to the HeadMotionStreamer app on UDP port ${motionPort}. ` +
      `Run \`${streamerCommand(motionPort)}\` (or \`Start.command\`) with AirPods in your ears. Until then, tap *Done* when you finish each break.`,
  );

const progressBar = (reps, target) => {
  const filled = Math.min(target, reps);
  return `${'🟩'.repeat(filled)}${'⬜'.repeat(Math.max(0, target - filled))} ${filled}/${target}`;
};

const activityPrompt = ({ userId, activity, reps, breakMinutes, headphonesStreaming, gifBaseUrl, motionPort }) => {
  const gifUrl = gifUrlFor(activity, gifBaseUrl);
  const label = BREAK_LABELS[activity.category];
  return {
    text: `${label}: ${activity.name} x${activity.targetReps}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `${label}: ${activity.name}` } },
      section(
        `<@${userId}> time for a ${breakMinutes}-minute ${label.toLowerCase()}!\n${activity.instructions}\n*Goal:* ${activity.targetReps} reps`,
      ),
      ...(gifUrl ? [{ type: 'image', image_url: gifUrl, alt_text: activity.name }] : []),
      headphonesStreaming
        ? section(`:headphones: ${progressBar(reps, activity.targetReps)}`)
        : headphoneWarning(motionPort),
      {
        type: 'actions',
        elements: [button('Done', ACTION_IDS.markDone, 'primary'), button('Skip', ACTION_IDS.skip)],
      },
    ],
  };
};

const SUCCESS_OPENERS = [':tada: *Nice work!*', ':fire: *Crushed it!*', ':muscle: *That is how it is done!*'];
const FAILURE_OPENERS = [":hourglass: *Time's up!*", ":disappointed: *Time's up.*", ":cry: *Time's up...*"];
const choose = (options, variant) => options[Math.abs(variant) % options.length];

const activityFinished = ({
  activity,
  reps,
  outcome,
  nextBreakMinutes,
  nextBreakCategory,
  gifUrl,
  completedCount = 0,
  variant = 0,
}) => {
  const plural = completedCount === 1 ? 'break' : 'breaks';
  const headline = {
    detected: `${choose(SUCCESS_OPENERS, variant)} ${activity.name} done (${reps} reps detected).\nYou've finished *${completedCount}* ${plural} today.`,
    manual: `${choose(SUCCESS_OPENERS, variant)} ${activity.name} marked done.\nYou've finished *${completedCount}* ${plural} today.`,
    skipped: `:fast_forward: Skipped ${activity.name}. No worries, the next one is coming up.`,
    timeout: `${choose(FAILURE_OPENERS, variant)} You didn't finish ${activity.name} (${reps}/${activity.targetReps} reps), so it doesn't count. Try again next break!`,
  }[outcome];
  const next = nextBreakMinutes
    ? `\nBack to work: ${BREAK_LABELS[nextBreakCategory].toLowerCase()} in ${nextBreakMinutes} minutes.`
    : '';
  return {
    text: `${headline.replaceAll('\n', ' ')}${next.replaceAll('\n', ' ')}`,
    blocks: [
      section(`${headline}${next}`),
      ...(gifUrl
        ? [{ type: 'image', image_url: gifUrl, alt_text: outcome === 'timeout' ? 'Sad reaction' : 'Happy reaction' }]
        : []),
    ],
  };
};

const dayWrapped = (completedCount) => ({
  text: `Session over. You completed ${completedCount} movement breaks today.`,
  blocks: [section(`:checkered_flag: Session over! You completed *${completedCount}* movement breaks today.`)],
});

const sessionEndedSummary = (completedCount) => ({
  text: `Slack Off session ended. ${completedCount} breaks completed.`,
  blocks: [
    section(`:checkered_flag: Session ended. You completed *${completedCount}* breaks. Details are in the thread.`),
  ],
});

const homeView = ({ userId, status }) => ({
  type: 'home',
  blocks: [
    header('Slack Off'),
    section(`Hi <@${userId}>! I remind you to stretch and move during the workday.`),
    header(
      status.active
        ? `Status: ${status.phase === 'moving' ? `on a break (${status.activityName})` : 'working'}`
        : 'Status: no session running',
    ),
    ...(status.active
      ? [
          header(
            `✅ ${status.completed} breaks done · ${status.headphonesStreaming ? '🎧 headphones connected' : '⚠️ headphones not detected'}`,
          ),
        ]
      : []),
    header(`Pomodoro: ${pomodoroCycle(status.pomodoro)}`),
    {
      type: 'actions',
      elements: [
        status.active
          ? button('End session', ACTION_IDS.stopSession, 'danger')
          : button('Start session', ACTION_IDS.startSession, 'primary'),
        button('Pomodoro settings', ACTION_IDS.openPomodoroConfig),
      ],
    },
  ],
});

const minutesInput = (field, value) => ({
  type: 'input',
  block_id: field.blockId,
  label: { type: 'plain_text', text: field.label },
  element: {
    type: 'number_input',
    action_id: POMODORO_CONFIG.actionId,
    is_decimal_allowed: false,
    initial_value: String(value),
    min_value: String(POMODORO_CONFIG.minMinutes),
    max_value: String(POMODORO_CONFIG.maxMinutes),
  },
});

const pomodoroConfigModal = (pomodoro) => ({
  type: 'modal',
  callback_id: POMODORO_CONFIG.callbackId,
  title: { type: 'plain_text', text: 'Pomodoro settings' },
  submit: { type: 'plain_text', text: 'Save' },
  close: { type: 'plain_text', text: 'Cancel' },
  blocks: [
    section('Your cycle: work → sitting break → work → active break, then repeat. Changes apply from your next timer.'),
    ...Object.entries(POMODORO_CONFIG.fields).map(([key, field]) => minutesInput(field, pomodoro[key])),
  ],
});

export {
  ACTION_IDS,
  activityFinished,
  activityPrompt,
  dayWrapped,
  homeView,
  morningReminder,
  POMODORO_CONFIG,
  pomodoroConfigModal,
  pomodoroCycle,
  sessionEndedSummary,
  sessionStarted,
};
