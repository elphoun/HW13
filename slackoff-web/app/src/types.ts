export type Level = 1 | 2 | 3;
/** What a break asks of you: an active move, or a gentle stretch. Same story either way. */
export type MoveType = 'activity' | 'stretch';
/** `both`: every scene asks for its activity move, then its stretch move, so the break runs about twice as long. */
export type BreakType = MoveType | 'both';
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
  story: string;            // id of the story breaks play through
  breakType: BreakType;     // pre-selected when a break starts on its own
  dailyGoal: number;
  notifications: boolean;
  sound: boolean;
  autoCycle: boolean;
  airpods: boolean;      // count reps from AirPod motion (when the streamer is running)
  airpodsFlipUp: boolean; // invert up/down if squats read backwards on your AirPods
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
/** One play-through of a story. `map` is the story id (kept for stored data). */
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
