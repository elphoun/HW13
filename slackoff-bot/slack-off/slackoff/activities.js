const stretches = [
  {
    id: 'neck-tilts',
    name: 'Neck tilts',
    category: 'stretch',
    instructions: 'Sit tall. Slowly tilt your ear toward one shoulder, hold for a breath, then switch sides.',
    targetReps: 6,
    rule: { kind: 'alternate', signal: 'roll', threshold: 0.3 },
  },
  {
    id: 'body-rotations',
    name: 'Body rotations',
    category: 'stretch',
    instructions: 'Feet flat, hands on your chest. Rotate your upper body (and head) to the left, then to the right.',
    targetReps: 6,
    rule: { kind: 'alternate', signal: 'yaw', threshold: 0.5 },
  },
  {
    id: 'seated-toe-touch',
    name: 'Touch your toes (sitting down)',
    category: 'stretch',
    instructions: 'Scoot to the edge of your chair, legs out, and reach down toward your toes. Come back up slowly.',
    targetReps: 5,
    rule: { kind: 'dip', signal: 'pitch', enter: 0.6, exit: 0.25 },
  },
  {
    id: 'neck-circles',
    name: 'Neck circles',
    category: 'stretch',
    instructions: 'Drop your chin, then roll your head in a slow, full circle. Reverse direction halfway through.',
    targetReps: 4,
    rule: { kind: 'circle', threshold: 0.25 },
  },
];

const movements = [
  {
    id: 'jumping-jacks',
    name: 'Jumping jacks',
    category: 'activity',
    instructions: 'Jump your feet out while raising your arms overhead, then jump back together.',
    targetReps: 15,
    rule: { kind: 'peak', signal: 'accelMagnitude', enter: 0.8, exit: 0.3, minGapMs: 300 },
  },
  {
    id: 'one-legged-hop',
    name: '1 legged hop',
    category: 'activity',
    instructions: 'Balance on one foot and hop in place. Switch feet halfway.',
    targetReps: 10,
    rule: { kind: 'peak', signal: 'accelMagnitude', enter: 0.7, exit: 0.3, minGapMs: 300 },
  },
  {
    id: 'squats',
    name: 'Squats',
    category: 'activity',
    instructions: 'Feet shoulder-width apart. Sit your hips back and down like into a chair, then stand back up.',
    targetReps: 10,
    rule: { kind: 'peak', signal: 'verticalAccel', enter: 0.25, exit: 0.08, minGapMs: 900 },
  },
  {
    id: 'standing-toe-touch',
    name: 'Touch your toes (standing up)',
    category: 'activity',
    instructions: 'Stand with soft knees, fold forward and reach for your toes, then roll back up.',
    targetReps: 6,
    rule: { kind: 'dip', signal: 'pitch', enter: 0.8, exit: 0.3 },
  },
  {
    id: 'high-knees',
    name: 'High knees',
    category: 'activity',
    instructions: 'Jog in place, driving each knee up to hip height.',
    targetReps: 20,
    rule: { kind: 'peak', signal: 'accelMagnitude', enter: 0.45, exit: 0.2, minGapMs: 200 },
  },
  {
    id: 'pick-the-flowers',
    name: 'Pick the flowers',
    category: 'activity',
    instructions:
      'Step out to the side and bend down as if picking a flower near your foot. Stand up and switch sides.',
    targetReps: 8,
    rule: { kind: 'dip', signal: 'pitch', enter: 0.5, exit: 0.2 },
  },
];

const activities = [...stretches, ...movements];

const gifUrlFor = (activity, gifBaseUrl) => (gifBaseUrl ? `${gifBaseUrl.replace(/\/$/, '')}/${activity.id}.gif` : null);

const pickActivity = (previousId, random = Math.random) => {
  const candidates = activities.filter((activity) => activity.id !== previousId);
  return candidates[Math.floor(random() * candidates.length)];
};

export { activities, gifUrlFor, movements, pickActivity, stretches };
