import type { BreakType, Level } from '../types';

/** One exercise for a scene. `say` turns the rep count into the instruction shown to the user. */
export interface SceneMove { exerciseId: string; reps: number; say: (n: number) => string; }

/**
 * One beat of the story. The line and picture are the same for everyone;
 * only the move changes with the break type (activity vs stretch).
 */
export interface Scene { line: string; moves: Record<BreakType, SceneMove>; }

export interface Story { id: string; name: string; blurb: string; intro: string; playable: boolean; scenes: Scene[]; }

const times = (verb: string) => (n: number) => `${verb} ${n} ${n === 1 ? 'time' : 'times'}`;

// Add a story here to make it selectable everywhere.
// Pictures: drop files named 1.png, 2.png, ... into src/assets/stories/<story id>/ (png, jpg, webp or svg).
// Scene 1 uses 1.*, scene 2 uses 2.*, and so on. Scenes without a picture show the sky backdrop.
export const STORIES: Story[] = [
  {
    id: 'wipeout', name: 'Wipeout', playable: true,
    blurb: 'Bounce, dodge and duck your way across the big red course.',
    intro: "You're the next contestant on the big red obstacle course. Make it to the finish bell.",
    scenes: [
      { line: 'Jump on the red balls',
        moves: { activity: { exerciseId: 'jump-in-place', reps: 5, say: times('Jump') },
                 stretch: { exerciseId: 'sky-reach', reps: 5, say: times('Stretch to the sky') } } },
      { line: 'Dodge the moving cylinders',
        moves: { activity: { exerciseId: 'side-lunges', reps: 6, say: times('Side lunge') },
                 stretch: { exerciseId: 'side-stretch', reps: 6, say: n => `Side stretch to each side ${n} times` } } },
      { line: 'Duck under the sweeper arm',
        moves: { activity: { exerciseId: 'squats', reps: 8, say: times('Squat') },
                 stretch: { exerciseId: 'forward-fold', reps: 5, say: times('Fold forward and reach for your toes') } } },
      { line: 'Cross the wobbly bridge',
        moves: { activity: { exerciseId: 'high-knees', reps: 16, say: n => `Do ${n} high knees` },
                 stretch: { exerciseId: 'body-rotations', reps: 6, say: times('Twist side to side') } } },
      { line: 'Ring the bell at the finish',
        moves: { activity: { exerciseId: 'jumping-jacks', reps: 10, say: n => `Do ${n} jumping jacks` },
                 stretch: { exerciseId: 'shoulder-rolls', reps: 8, say: n => `Roll your shoulders back ${n} times` } } },
    ],
  },
  { id: 'jungle', name: 'Jungle trek', playable: false, blurb: 'Coming soon', intro: '', scenes: [] },
  { id: 'space', name: 'Space walk', playable: false, blurb: 'Coming soon', intro: '', scenes: [] },
];

export const storyById = (id: string) => STORIES.find(s => s.id === id && s.playable) ?? STORIES[0];

/** Intensity scales every scene's reps: level 1 asks for fewer, level 3 for more. */
export const repsFor = (base: number, level: Level) => Math.max(1, Math.round(base * [0.6, 1, 1.5][level - 1]));

const PICTURES = import.meta.glob<string>('../assets/stories/*/*.{png,jpg,jpeg,webp,svg}', { eager: true, import: 'default' });

/** The picture for scene `index` (0-based) of a story, if one has been added. */
export function scenePicture(storyId: string, index: number): string | undefined {
  const prefix = `../assets/stories/${storyId}/${index + 1}.`;
  const key = Object.keys(PICTURES).find(k => k.startsWith(prefix));
  return key ? PICTURES[key] : undefined;
}
