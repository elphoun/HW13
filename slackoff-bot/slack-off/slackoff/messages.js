import { gifUrlFor } from './activities.js';

const ACTION_IDS = {
  startSession: 'slackoff_start_session',
  stopSession: 'slackoff_stop_session',
  markDone: 'slackoff_mark_done',
  skip: 'slackoff_skip',
};

const button = (text, actionId, style) => ({
  type: 'button',
  text: { type: 'plain_text', text },
  action_id: actionId,
  ...(style ? { style } : {}),
});

const section = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });

const morningReminder = (userId) => ({
  text: 'Good morning! Ready to start your Slack Off session?',
  blocks: [
    section(
      `:sunrise: Good morning <@${userId}>! Start a Slack Off session and I'll nudge you to move throughout the day.`,
    ),
    { type: 'actions', elements: [button('Start session', ACTION_IDS.startSession, 'primary')] },
  ],
});

const sessionStarted = ({ workIntervalMinutes, headphonesStreaming, motionPort }) => ({
  text: `Session started. First movement break in ${workIntervalMinutes} minutes.`,
  blocks: [
    section(`:stopwatch: Session started! Your first movement break is in *${workIntervalMinutes} minutes*.`),
    ...(headphonesStreaming
      ? [section(':headphones: Headphone motion detected. I will count your reps automatically.')]
      : []),
    ...(headphonesStreaming ? [] : [headphoneWarning(motionPort)]),
    { type: 'actions', elements: [button('End session', ACTION_IDS.stopSession, 'danger')] },
  ],
});

const headphoneWarning = (motionPort) =>
  section(
    `:warning: *No headphone motion detected.* Slack can't read AirPod motion on its own, so I listen to the HeadMotionStreamer app on UDP port ${motionPort}. ` +
      `Run \`swift run HeadMotionStreamer --port ${motionPort}\` (or \`Start.command\` with that port) with AirPods in your ears. Until then, tap *Done* when you finish each break.`,
  );

const progressBar = (reps, target) => {
  const filled = Math.min(target, reps);
  return `${'🟩'.repeat(filled)}${'⬜'.repeat(Math.max(0, target - filled))} ${filled}/${target}`;
};

const activityPrompt = ({ activity, reps, headphonesStreaming, gifBaseUrl, motionPort }) => {
  const gifUrl = gifUrlFor(activity, gifBaseUrl);
  const label = activity.category === 'stretch' ? 'Stretch break' : 'Movement break';
  return {
    text: `${label}: ${activity.name} x${activity.targetReps}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `${label}: ${activity.name}` } },
      section(`${activity.instructions}\n*Goal:* ${activity.targetReps} reps`),
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

const activityFinished = ({ activity, reps, outcome, nextBreakMinutes }) => {
  const headline = {
    detected: `:tada: Nice! ${activity.name} done (${reps} reps detected).`,
    manual: `:white_check_mark: ${activity.name} marked done.`,
    skipped: `:fast_forward: Skipped ${activity.name}.`,
    timeout: `:hourglass: Time's up on ${activity.name} (${reps}/${activity.targetReps} reps detected).`,
  }[outcome];
  const next = nextBreakMinutes ? ` Next break in ${nextBreakMinutes} minutes.` : '';
  return { text: `${headline}${next}`, blocks: [section(`${headline}${next}`)] };
};

const dayWrapped = (completedCount) => ({
  text: `Session over. You completed ${completedCount} movement breaks today.`,
  blocks: [section(`:checkered_flag: Session over! You completed *${completedCount}* movement breaks today.`)],
});

const homeView = ({ userId, status }) => ({
  type: 'home',
  blocks: [
    { type: 'header', text: { type: 'plain_text', text: 'Slack Off :man-cartwheeling:' } },
    section(`Hi <@${userId}>! I remind you to stretch and move during the workday.`),
    section(
      status.active
        ? `*Status:* ${status.phase === 'moving' ? `on a break (${status.activityName})` : 'working'} · ${status.completed} breaks done · headphones ${status.headphonesStreaming ? 'connected :headphones:' : 'not detected :warning:'}`
        : '*Status:* no session running',
    ),
    {
      type: 'actions',
      elements: [
        status.active
          ? button('End session', ACTION_IDS.stopSession, 'danger')
          : button('Start session', ACTION_IDS.startSession, 'primary'),
      ],
    },
  ],
});

export { ACTION_IDS, activityFinished, activityPrompt, dayWrapped, homeView, morningReminder, sessionStarted };
