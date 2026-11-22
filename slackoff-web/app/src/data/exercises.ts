import type { Exercise, Level } from '../types';

export const LEVELS: { level: Level; name: string; blurb: string; emoji: string; points: number }[] = [
  { level: 1, name: 'Light Stretching', blurb: 'Gentle, desk-friendly moves', emoji: '🌱', points: 10 },
  { level: 2, name: 'Moderate Movement', blurb: 'Get the blood flowing', emoji: '🔥', points: 20 },
  { level: 3, name: 'Active Workout', blurb: 'Sweat a little. Feel great.', emoji: '⚡', points: 30 },
];

export const pointsFor = (level: Level) => LEVELS[level - 1].points;

export const EXERCISES: Exercise[] = [
  // Level 1
  { id: 'sky-reach', name: 'Stretch to the Sky', level: 1, anim: 'body-rotate', amount: '5 reaches', seconds: 30,
    instructions: ['Stand or sit tall.', 'Reach both arms up as high as you can.', 'Hold for a breath, then lower slowly.'] },
  { id: 'side-stretch', name: 'Side Stretch', level: 1, anim: 'body-rotate', amount: '6 stretches', seconds: 40,
    instructions: ['Raise one arm overhead.', 'Lean gently to the opposite side.', 'Come back up and switch sides.'] },
  { id: 'forward-fold', name: 'Forward Fold', level: 1, anim: 'stand-toe', amount: '5 folds', seconds: 40,
    instructions: ['Stand with soft knees.', 'Fold forward and let your arms hang toward your toes.', 'Roll up slowly.'] },
  { id: 'shoulder-rolls', name: 'Shoulder Rolls', level: 1, anim: 'neck-circle', amount: '8 rolls', seconds: 25,
    instructions: ['Lift your shoulders to your ears.', 'Roll them back and down.', 'Keep it slow.'] },
  { id: 'neck-tilts', name: 'Neck Tilts', level: 1, anim: 'neck-tilt', amount: '5 each side', seconds: 30,
    instructions: ['Sit tall and relax your shoulders.', 'Slowly tilt your ear toward your shoulder.', 'Hold for 2 seconds, then switch sides.'] },
  { id: 'neck-circles', name: 'Neck Circles', level: 1, anim: 'neck-circle', amount: '5 slow circles', seconds: 30,
    instructions: ['Drop your chin toward your chest.', 'Roll your head in a slow, smooth circle.', 'Switch direction halfway.'] },
  { id: 'seated-toe-touches', name: 'Seated Toe Touches', level: 1, anim: 'seated-toe', amount: '10 reps', seconds: 45,
    instructions: ['Sit at the edge of your chair, legs wide.', 'Reach one hand toward the opposite foot.', 'Come back up and alternate sides.'] },
  { id: 'body-rotations', name: 'Body Rotations', level: 1, anim: 'body-rotate', amount: '10 twists', seconds: 40,
    instructions: ['Stand with feet shoulder-width apart.', 'Let your arms swing loosely as you twist your torso.', 'Look over each shoulder as you turn.'] },
  // Level 2
  { id: 'side-lunges', name: 'Side Lunges', level: 2, anim: 'squat', amount: '6 lunges', seconds: 40,
    instructions: ['Step wide to one side.', 'Bend that knee and sit back.', 'Push back to the middle and switch sides.'] },
  { id: 'squats', name: 'Squats', level: 2, anim: 'squat', amount: '12 reps', seconds: 45,
    instructions: ['Feet shoulder-width apart, chest proud.', 'Push your hips back and bend your knees.', 'Drive through your heels to stand.'] },
  { id: 'standing-toe-touches', name: 'Standing Toe Touches', level: 2, anim: 'stand-toe', amount: '10 reps', seconds: 45,
    instructions: ['Stand tall with feet together.', 'Hinge at the hips and reach for your toes.', 'Roll up slowly, one bone at a time.'] },
  { id: 'high-knees', name: 'High Knees', level: 2, anim: 'high-knees', amount: '20 knees', seconds: 30,
    instructions: ['Stand tall, arms bent at your sides.', 'Drive one knee up to hip height.', 'Alternate quickly — pump those arms!'] },
  { id: 'pick-the-flowers', name: 'Pick the Flowers', level: 2, anim: 'flowers', amount: '10 flowers', seconds: 45,
    instructions: ['Imagine a meadow at your feet.', 'Squat down and pluck a flower.', 'Stand and reach up high to "toss" it. Repeat!'] },
  // Level 3
  { id: 'jump-in-place', name: 'Jumps', level: 3, anim: 'hops', amount: '5 jumps', seconds: 20,
    instructions: ['Bend your knees.', 'Jump straight up.', 'Land softly and go again.'] },
  { id: 'jumping-jacks', name: 'Jumping Jacks', level: 3, anim: 'jacks', amount: '20 reps', seconds: 40,
    instructions: ['Start with feet together, arms down.', 'Jump your feet wide as your arms swing overhead.', 'Jump back to start. Keep a steady rhythm.'] },
  { id: 'single-leg-hops', name: 'Single-Leg Hops', level: 3, anim: 'hops', amount: '10 each leg', seconds: 45,
    instructions: ['Balance on one foot, soft knee.', 'Hop up and land gently on the same foot.', 'Switch legs after 10 hops.'] },
  { id: 'high-knees-fast', name: 'High Knees (Fast)', level: 3, anim: 'high-knees', amount: '40 knees', seconds: 40,
    instructions: ['Run on the spot as fast as you can.', 'Knees reach hip height every step.', 'Keep your core tight and arms pumping.'] },
  { id: 'squat-challenge', name: 'Squat Challenge', level: 3, anim: 'squat', amount: '20 reps', seconds: 60,
    instructions: ['Squat deep, thighs parallel to the floor.', 'Explode upward on every rep.', 'No resting at the top — keep moving!'] },
];

export const exerciseById = (id: string) => EXERCISES.find(e => e.id === id);
