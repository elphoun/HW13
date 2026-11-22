export type Level = 1 | 2 | 3;
export type AnimKey =
  | 'neck-tilt' | 'neck-circle' | 'seated-toe' | 'body-rotate'
  | 'squat' | 'stand-toe' | 'high-knees' | 'flowers'
  | 'jacks' | 'hops';

export interface Exercise {
  id: string;
  name: string;
  level: Level;
  anim: AnimKey;
  amount: string;        // shown to the user: "10 reps", "30 seconds"
  seconds: number;       // rough time it takes, added to "time spent exercising"
  instructions: string[];
}

export interface Settings {
  workSeconds: number;
  exerciseSeconds: number;
  intensity: Level;
  disabledActivities: string[];
  pickedActivity: string | 'random';   // a specific exercise id, or SlackOff chooses
  preferredMap: string;
  dailyGoal: number;
  notifications: boolean;
  sound: boolean;
  autoCycle: boolean;
}

export interface Profile { name: string; avatar: string; }

export interface Completion {
  id: string;
  ts: number;
  exerciseId: string;
  points: number;
  seconds: number;
  source: 'break' | 'wipeout';
}

export interface TimerSession { id: string; ts: number; kind: 'work' | 'exercise'; plannedSeconds: number; completed: boolean; }
export interface GameRun { id: string; ts: number; map: string; score: number; completed: number; total: number; }

export interface PersistedData {
  settings: Settings;
  profile: Profile;
  completions: Completion[];
  breaks: number[];              // timestamps of breaks that had at least one activity completed
  sessions: TimerSession[];
  runs: GameRun[];
  achievements: Record<string, number>;   // id -> unlocked timestamp
  leaderboard: { resetAt: number; resets: number };
}
