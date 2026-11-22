import { useTimer } from '../state/TimerContext';
import { ExerciseFigure } from './ExerciseFigure';
import { LEVELS, pointsFor } from '../data/exercises';

export function ExerciseCard() {
  const t = useTimer();
  const ex = t.exercise, lvl = LEVELS[ex.level - 1];
  return (
    <div className="exercise-card">
      <div className="ex-head">
        <span className={`lvl-badge l${ex.level}`}>{lvl.emoji} Level {ex.level} · {lvl.name}</span>
        <span className="pts-badge">+{pointsFor(ex.level)} pts</span>
      </div>
      <div className="ex-body">
        <ExerciseFigure anim={ex.anim} size={190} />
        <div className="ex-info">
          <h2>{ex.name}</h2>
          <div className="ex-amount">{ex.amount}</div>
          <ol>{ex.instructions.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
      </div>
      {t.justCompleted ? (
        <div className="ex-done">
          <div className="burst">🎉 +{t.lastPoints} points! Nicely done.</div>
          <button className="btn secondary" onClick={t.anotherActivity}>Another one ↻</button>
        </div>
      ) : (
        <button className="btn primary big" onClick={t.completeActivity}>✅ I did it!</button>
      )}
    </div>
  );
}
