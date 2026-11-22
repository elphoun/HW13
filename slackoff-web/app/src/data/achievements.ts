import type { PersistedData } from '../types';
import { computeStats } from '../lib/stats';

export interface Achievement { id: string; name: string; desc: string; emoji: string; test: (d: PersistedData, s: ReturnType<typeof computeStats>) => boolean; }

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-move', name: 'First Move', desc: 'Complete your first activity', emoji: '🐣', test: (_d, s) => s.totalActivities >= 1 },
  { id: 'ten-down', name: 'Ten Down', desc: 'Complete 10 activities', emoji: '🔟', test: (_d, s) => s.totalActivities >= 10 },
  { id: 'streak-3', name: 'On a Roll', desc: 'Reach a 3-day streak', emoji: '🔥', test: (_d, s) => s.streak >= 3 },
  { id: 'goal-getter', name: 'Goal Getter', desc: 'Hit your daily movement goal', emoji: '🎯', test: (d, s) => s.today >= d.settings.dailyGoal },
  { id: 'break-master', name: 'Break Master', desc: 'Complete 5 exercise breaks', emoji: '☕', test: (_d, s) => s.totalBreaks >= 5 },
  { id: 'wipeout-finisher', name: 'Wipeout Finisher', desc: 'Finish a full Wipeout course', emoji: '🏁', test: d => d.runs.some(r => r.completed === r.total && r.total > 0) },
  { id: 'point-hoarder', name: 'Point Hoarder', desc: 'Earn 500 points', emoji: '💎', test: (_d, s) => s.totalPoints >= 500 },
];
