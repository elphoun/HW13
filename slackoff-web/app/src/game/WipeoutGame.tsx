import { useCallback, useEffect, useRef, useState } from 'react';
import { CHALLENGE_DEFS, COURSE_LENGTH, Game, H, LIVES, W, enabledKinds, type Difficulty, type Kind, type Result } from './engine';
import { render } from './render';
import { mapById } from '../data/maps';
import { exerciseById, pointsFor } from '../data/exercises';
import { useApp } from '../state/AppState';
import { sfx } from '../lib/sfx';
import { useTimer } from '../state/TimerContext';
import { fmtClock } from '../lib/dates';
import { airpods } from '../lib/airpods';
import { makeDetector, type Detector } from '../lib/detectors';

type Screen = 'ready' | 'playing' | 'paused' | 'over';
interface Hud { idx: number; total: number; reps: number; need: number; lives: number; score: number; combo: number; title: string; unit: string; kind: Kind; }

const snap = (g: Game): Hud => ({ idx: g.idx, total: g.challenges.length, reps: g.reps, need: g.current.reps, lives: g.lives, score: g.score, combo: g.combo, title: g.current.def.title, unit: g.current.def.unit, kind: g.kind });
const KIND_EMOJI: Record<Kind, string> = { jump: '🦘', duck: '🦆', run: '🏃', collect: '🌼', tilt: '🌿', circle: '🫧', toes: '🪨', rotate: '🚪' };
const MODE_LABEL = { stretches: 'stretches', activities: 'activities', both: 'stretches + activities' } as const;
const HOWTO: Record<Kind, string> = { jump: 'jump over boulders', duck: 'duck under branches', run: 'sprint across ponds', collect: 'collect the flowers', tilt: 'sway under the vines', circle: 'pop the bubbles', toes: 'touch the stepping stones', rotate: 'twist the gate open' };
const KIND_SFX: Record<Kind, () => void> = { jump: sfx.jump, duck: sfx.duck, run: sfx.run, collect: sfx.collect, tilt: sfx.duck, circle: sfx.collect, toes: sfx.duck, rotate: sfx.run };

/** `breakMode`: this run IS the exercise break. It starts straight away, shares the break countdown, pauses it with the game, and "quit" skips the break. */
export function WipeoutGame({ mapId, difficulty, onExit, breakMode = false }: { mapId: string; difficulty: Difficulty; onExit: () => void; breakMode?: boolean }) {
  const app = useApp();
  const appRef = useRef(app); appRef.current = app;
  const timer = useTimer();
  const timerRef = useRef(timer); timerRef.current = timer;
  const map = mapById(mapId);
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game>(null as unknown as Game);
  const initial: Screen = breakMode && timer.status === 'running' ? 'playing' : 'ready';
  const screen = useRef<Screen>(initial);
  const [scr, setScr] = useState<Screen>(initial);
  const [hud, setHud] = useState<Hud | null>(null);
  const useAir = app.data.settings.airpods;
  const [podsOn, setPodsOn] = useState(false);     // AirPod packets are arriving
  const [summary, setSummary] = useState<{ result: 'win' | 'lose'; score: number; results: Result[]; best: boolean; bestCombo: number } | null>(null);

  const setScreen = useCallback((s: Screen) => { screen.current = s; setScr(s); }, []);

  const newGame = useCallback(() => {
    const g = new Game(difficulty, Math.random, enabledKinds(appRef.current.data.settings.disabledActivities, appRef.current.data.settings.activityMode));
    g.onEvent = (e, data) => {
      const a = appRef.current;
      if (e === 'rep') sfx.tick(((data as number) ?? 1) - 1);
      else if (e === 'success') {
        const { challenge } = data as { challenge: { def: { kind: Kind; exerciseId: string }; reps: number } };
        KIND_SFX[challenge.def.kind](); setTimeout(sfx.success, 180);
        const ex = exerciseById(challenge.def.exerciseId);
        if (breakMode) timerRef.current.creditBreak();
        if (ex) a.addCompletion({ exerciseId: ex.id, points: pointsFor(ex.level), seconds: Math.round(challenge.reps * 2.5), source: 'wipeout' });
      }
      else if (e === 'hit') sfx.hit();
      else if (e === 'win' || e === 'lose') {
        (e === 'win' ? sfx.win : sfx.lose)();
        const prevBest = a.data.runs.filter(r => r.map === mapId).reduce((m, r) => Math.max(m, r.score), 0);
        a.addRun({ map: mapId, score: g.score, completed: g.completedCount(), total: g.challenges.length });
        setSummary({ result: e, score: g.score, results: g.results, best: g.score > prevBest, bestCombo: g.bestCombo });
        setTimeout(() => setScreen('over'), e === 'win' ? 900 : 1200);
      }
      setHud(snap(g));
    };
    game.current = g; setHud(snap(g)); setSummary(null);
  }, [difficulty, mapId, setScreen, breakMode]);

  useEffect(() => { newGame(); }, [newGame]);

  // main loop
  useEffect(() => {
    const cv = canvas.current!, ctx = cv.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
    let last = performance.now(), raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const g = game.current;
      if (g) { if (screen.current === 'playing' || (screen.current === 'over' && !g.finished)) g.update(dt); else if (screen.current === 'ready') g.update(dt * 0); render(ctx, g, map); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const poll = setInterval(() => { if (game.current && screen.current === 'playing') setHud(snap(game.current)); }, 200);
    return () => { cancelAnimationFrame(raf); clearInterval(poll); };
  }, [map]);

  // AirPods count the reps: while an obstacle is approaching, the detector for its move runs on every motion sample and each
  // detected rep is a game rep. Space / tap still work as a backup. The pose is zeroed at the start of every obstacle.
  useEffect(() => {
    if (!useAir) { setPodsOn(false); return; }
    let det: Detector | null = null, key = '', seen = 0;
    const unsub = airpods.subscribe(s => {
      const g = game.current;
      if (!g || screen.current !== 'playing' || g.finished || g.mode !== 'approach') { det = null; return; }
      const k = `${g.idx}:${g.kind}`;
      if (!det || k !== key) { airpods.zero(); det = makeDetector(g.kind); key = k; seen = 0; }
      det.update(s);
      while (seen < det.reps) { seen++; g.rep(true); }
    });
    const poll = setInterval(() => setPodsOn(airpods.connected()), 500);
    return () => { unsub(); clearInterval(poll); };
  }, [useAir]);

  const rep = useCallback(() => { if (screen.current === 'playing') game.current.rep(); }, []);
  const start = useCallback(() => { sfx.unlock(); if (breakMode && timerRef.current.status === 'idle') timerRef.current.start(); setScreen('playing'); }, [setScreen, breakMode]);
  // Pausing the game also pauses the break clock, so you can't lose break time by stopping for a drink.
  const pause = useCallback(() => { if (screen.current !== 'playing') return; setScreen('paused'); if (breakMode) timerRef.current.pause(); }, [setScreen, breakMode]);
  const resume = useCallback(() => { if (screen.current !== 'paused') return; setScreen('playing'); if (breakMode) timerRef.current.resume(); }, [setScreen, breakMode]);
  const togglePause = useCallback(() => { if (screen.current === 'playing') pause(); else resume(); }, [pause, resume]);
  const again = useCallback(() => { newGame(); setScreen('playing'); }, [newGame, setScreen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (screen.current === 'playing') rep(); else if (screen.current === 'ready') start(); else if (screen.current === 'paused') togglePause();
      } else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
      else if (e.code === 'Enter') { if (screen.current === 'ready') start(); else if (screen.current === 'over') again(); }
    };
    const onHide = () => { if (document.hidden) pause(); };
    addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onHide);
    return () => { removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onHide); };
  }, [rep, start, togglePause, again, pause]);

  const completed = summary?.results.filter(r => r.success) ?? [];

  return (
    <div className="game-wrap">
      <div className="game-stage">
        <canvas ref={canvas} className="game-canvas" onPointerDown={() => rep()} aria-label="Wipeout game" />
        {hud && (
          <div className="game-hud">
            <div className="hud-top">
              <span className="hud-chip">⭐ {hud.score}</span>
              <span className="hud-chip hearts" aria-label={`${hud.lives} lives`}>{Array.from({ length: LIVES }, (_, i) => <i key={i} className={i < hud.lives ? 'full' : ''}>♥</i>)}</span>
              <span className="hud-chip">🏁 {Math.min(hud.idx + 1, hud.total)}/{hud.total}</span>
              {breakMode && <span className="hud-chip break-clock" title="Time left in your break">⏱ {fmtClock(timer.remainingNow)}</span>}
              {useAir && <span className="hud-chip" title={podsOn ? 'Reps are counted from your AirPods' : 'No AirPod data: press Space or tap for each rep'}>{podsOn ? '🎧 AirPods on' : '🎧 no signal'}</span>}
              {hud.combo > 1 && <span className="hud-chip combo">🔥 x{hud.combo}</span>}
              <span className="spacer" />
              <button className="hud-btn" onClick={togglePause} disabled={scr === 'ready' || scr === 'over'}>{scr === 'paused' ? '▶ Resume' : '⏸ Pause'}</button>
              <button className="hud-btn" onClick={onExit}>{breakMode ? '⏭ Skip break' : '✕ Quit'}</button>
            </div>
            <div className="hud-challenge">
              <div className="hc-title">{KIND_EMOJI[hud.kind]} {hud.title}</div>
              <div className="hc-move"><b>{hud.need}×</b> {hud.unit}</div>
              <div className="hc-dots">{Array.from({ length: hud.need }, (_, i) => <i key={i} className={i < hud.reps ? 'on' : ''} />)}</div>
            </div>
          </div>
        )}

        {scr === 'ready' && (
          <div className="overlay">
            <h2>{breakMode ? 'Time to move! 🏃' : 'Wipeout!!'}</h2>
            <p className="big">{map.name} · {COURSE_LENGTH} obstacles · {LIVES} hearts · {MODE_LABEL[app.data.settings.activityMode]}</p>
            <ul className="howto">
              {enabledKinds(app.data.settings.disabledActivities, app.data.settings.activityMode).map(k => <li key={k}>{KIND_EMOJI[k]} <b>{CHALLENGE_DEFS[k].move}</b> → {HOWTO[k]}</li>)}
            </ul>
            {useAir && podsOn
              ? <p className="small">🎧 <b>AirPods connected.</b> Just do the moves and your reps count automatically (<kbd>Space</kbd> still works as a backup).<br />Clear space around you and stay hydrated!</p>
              : <p className="small">Do the move for real, then press <kbd>Space</kbd> (or tap the screen / button) <b>once per rep</b> before the obstacle reaches you.{useAir && <><br />🎧 No AirPod data yet: is the streamer and bridge running?</>}<br />Clear space around you and stay hydrated!</p>}
            <button className="btn primary big" onClick={start}>{breakMode ? '▶ Start my break (Space)' : '▶ Start (Space)'}</button>
          </div>
        )}
        {scr === 'paused' && (
          <div className="overlay"><h2>Paused ⏸</h2><p className="big">Catch your breath.{breakMode && ' Your break clock is paused too.'}</p>
            <div className="row-wrap"><button className="btn primary big" onClick={togglePause}>▶ Resume</button><button className="btn secondary" onClick={onExit}>{breakMode ? 'Skip break' : 'Quit'}</button></div></div>
        )}
        {scr === 'over' && summary && (
          <div className="overlay end">
            <h2>{summary.result === 'win' ? '🏁 Course complete!' : '💥 Wiped out!'}</h2>
            <div className="end-score">{summary.score}<small>points{summary.best ? ' · 🎉 new best!' : ''}</small></div>
            <div className="end-cols">
              <div><h4>Completed activities ({completed.length}/{summary.results.length || 0})</h4>
                {completed.length ? <ul>{completed.map((r, i) => <li key={i}>{KIND_EMOJI[r.kind]} {r.reps}× {CHALLENGE_DEFS[r.kind].unit} <b>+{r.points}</b></li>)}</ul> : <p className="small">None this time — you'll get it!</p>}</div>
              <div><h4>Stats</h4><ul><li>Best combo: <b>x{summary.bestCombo}</b></li><li>Hearts left: <b>{hud?.lives ?? 0}</b></li><li>Added to your SlackOff stats ✅</li></ul></div>
            </div>
            <div className="row-wrap"><button className="btn primary big" onClick={again}>↻ Play again (Enter)</button><button className="btn secondary" onClick={onExit}>{breakMode ? 'Back to work' : 'Back to maps'}</button></div>
          </div>
        )}
      </div>
      <button className="rep-btn" onPointerDown={e => { e.preventDefault(); rep(); }} disabled={scr !== 'playing'}>
        <span>{hud ? KIND_EMOJI[hud.kind] : '🦘'}</span> I did one! <kbd>Space</kbd>
      </button>
    </div>
  );
}
