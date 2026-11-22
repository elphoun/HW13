import { useApp } from '../state/AppState';
import { DAY_LABELS, addDays, dayKey, startOfDay } from '../lib/dates';

/** The "day tracker" strip from the sketch: one stop per day this week; stars when the daily goal was hit. */
export function DayTracker() {
  const { stats, data } = useApp();
  const goal = data.settings.dailyGoal, today = startOfDay(Date.now());
  return (
    <div className="day-tracker" aria-label="This week">
      <div className="dt-track" />
      {stats.thisWeek.map((n, i) => {
        const day = addDays(stats.week0, i), isToday = dayKey(day) === dayKey(today), future = day > today;
        const state = n >= goal ? 'goal' : n > 0 ? 'some' : 'none';
        return (
          <div key={i} className={`dt-stop ${state} ${isToday ? 'today' : ''} ${future ? 'future' : ''}`} title={`${DAY_LABELS[i]}: ${n} / ${goal} activities`}>
            <span className="dt-dot">{state === 'goal' ? '★' : n > 0 ? n : ''}</span>
            <span className="dt-label">{DAY_LABELS[i]}</span>
          </div>
        );
      })}
    </div>
  );
}
