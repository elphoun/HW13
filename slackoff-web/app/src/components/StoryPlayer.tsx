import { useCallback, useEffect, useRef, useState } from 'react';
import { repsFor, scenePicture, type Story } from '../data/stories';
import { exerciseById, pointsFor } from '../data/exercises';
import { useApp } from '../state/AppState';
import { useTimer } from '../state/TimerContext';
import { fmtClock } from '../lib/dates';
import { sfx } from '../lib/sfx';
import { airpods } from '../lib/airpods';
import { makeDetector, type Detector, type MoveKind } from '../lib/detectors';
import type { BreakType } from '../types';
import clouds from '../assets/home/clouds.png';

type Phase = 'intro' | 'scene' | 'cleared' | 'done';
const MIN_REP_GAP_MS = 200;      // stops key-mashing from counting as exercise
const CLEARED_MS = 1100;          // how long "Nice!" shows before the next scene

/** Which AirPod detector counts each exercise. Exercises not listed are counted with Space / the button only. */
const DETECTOR: Record<string, MoveKind> = {
  'jumping-jacks': 'jump', 'single-leg-hops': 'hop', squats: 'duck', 'squat-challenge': 'duck',
  'high-knees': 'run', 'high-knees-fast': 'run', 'pick-the-flowers': 'collect', 'standing-toe-touches': 'toes',
  'neck-tilts': 'tilt', 'neck-circles': 'circle', 'seated-toe-touches': 'toes', 'body-rotations': 'rotate',
};

const TYPES: { id: BreakType; label: string; note: string }[] = [
  { id: 'activity', label: 'Activity', note: 'Get moving' },
  { id: 'stretch', label: 'Stretch', note: 'Loosen up' },
];

/**
 * Plays a story scene by scene. Each scene shows its picture and story line, asks for one exercise,
 * and moves on once you've counted every rep.
 * `breakMode`: this run is the exercise break. It shares the break clock and "exit" ends the break.
 * `startWith`: skip the intro and go straight in with this break type.
 */
export function StoryPlayer({ story, onExit, breakMode = false, startWith }: { story: Story; onExit: () => void; breakMode?: boolean; startWith?: BreakType | null }) {
  const app = useApp();
  const timer = useTimer();
  const level = app.data.settings.intensity;
  const [type, setType] = useState<BreakType>(startWith ?? app.data.settings.breakType);
  const [phase, setPhase] = useState<Phase>(startWith ? 'scene' : 'intro');
  const [idx, setIdx] = useState(0);
  const [reps, setReps] = useState(0);
  const [earned, setEarned] = useState(0);
  const [done, setDone] = useState<string[]>([]);       // instructions completed, for the summary
  const [clearedMsg, setClearedMsg] = useState('');
  const lastRep = useRef(0);
  const repsRef = useRef(0);        // the live rep count (AirPods can report several reps in one tick, before React re-renders)

  const scene = story.scenes[Math.min(idx, story.scenes.length - 1)];
  const move = scene.moves[type];
  const need = repsFor(move.reps, level);
  const picture = scenePicture(story.id, idx);

  // A break that starts with the story should also start the break clock.
  const start = useCallback(() => {
    sfx.unlock();
    if (type !== app.data.settings.breakType) app.updateSettings({ breakType: type });
    if (breakMode && timer.status === 'idle') timer.start();
    repsRef.current = 0; setIdx(0); setReps(0); setEarned(0); setDone([]); setPhase('scene');
  }, [type, app, breakMode, timer]);
  useEffect(() => { if (startWith && breakMode && timer.status === 'idle') timer.start(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const finishScene = useCallback((credit: boolean) => {
    if (credit) {
      const ex = exerciseById(move.exerciseId);
      const pts = ex ? pointsFor(ex.level) : 0;
      if (ex) app.addCompletion({ exerciseId: ex.id, points: pts, seconds: Math.round(need * 3), source: breakMode ? 'break' : 'wipeout' });
      if (breakMode) timer.creditBreak();
      setEarned(e => e + pts); setDone(d => [...d, move.say(need)]);
      sfx.success();
    }
    setClearedMsg(credit ? 'Nice!' : 'Skipped');
    setPhase('cleared');
  }, [move, need, app, breakMode, timer]);

  // After "Nice!", move to the next scene or wrap up the story.
  useEffect(() => {
    if (phase !== 'cleared') return;
    const t = setTimeout(() => {
      if (idx + 1 < story.scenes.length) { repsRef.current = 0; setIdx(i => i + 1); setReps(0); setPhase('scene'); return; }
      setPhase('done'); sfx.win();
    }, CLEARED_MS);
    return () => clearTimeout(t);
  }, [phase, idx, story.scenes.length]);

  // Log the run once, when the story ends.
  useEffect(() => {
    if (phase === 'done') app.addRun({ map: story.id, score: earned, completed: done.length, total: story.scenes.length });
  }, [phase]);

  /** One rep happened. `fromSensor` skips the anti-mash gap: AirPod reps are real. */
  const rep = useCallback((fromSensor = false) => {
    if (phase !== 'scene') return;
    const now = performance.now();
    if (!fromSensor && now - lastRep.current < MIN_REP_GAP_MS) return;
    if (repsRef.current >= need) return;               // scene already cleared (extra reps can land in the same tick)
    lastRep.current = now;
    const n = ++repsRef.current;
    setReps(n); sfx.tick(Math.min(n - 1, 8));
    if (n >= need) finishScene(true);
  }, [phase, need, finishScene]);
  const repRef = useRef(rep); repRef.current = rep;

  // AirPods count the reps: during a scene, the detector for its exercise runs on every motion sample and each detected rep
  // counts. Space / the button still work as a backup. The pose is zeroed at the start of every scene.
  const useAir = app.data.settings.airpods;
  const detectorKind = DETECTOR[move.exerciseId];
  const [podsOn, setPodsOn] = useState(false);
  useEffect(() => {
    if (!useAir || phase !== 'scene' || !detectorKind) return;
    let det: Detector | null = null, seen = 0;
    const unsub = airpods.subscribe(smp => {
      if (!det) { airpods.zero(); det = makeDetector(detectorKind); }
      det.update(smp);
      while (seen < det.reps) { seen++; repRef.current(true); }
    });
    return unsub;
  }, [useAir, phase, idx, detectorKind]);
  useEffect(() => {
    if (!useAir) { setPodsOn(false); return; }
    const unsub = airpods.subscribe(() => {});        // open the stream so we can show whether data is arriving
    const poll = setInterval(() => setPodsOn(airpods.connected()), 500);
    return () => { unsub(); clearInterval(poll); };
  }, [useAir]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.code !== 'Space') return;
      if ((e.target as HTMLElement)?.closest('button, input, select, textarea')) return;   // the focused control handles it
      e.preventDefault();
      if (phase === 'intro') start(); else rep();
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [phase, start, rep]);

  return (
    <div className="story">
      <div className="story-stage">
        {picture
          ? <img className="story-pic" src={picture} alt={scene.line} />
          : <div className="story-pic story-sky" aria-hidden><img src={clouds} alt="" /></div>}

        <div className="story-top">
          <ol className="story-steps" aria-label={`Scene ${idx + 1} of ${story.scenes.length}`}>
            {story.scenes.map((_, i) => <li key={i} className={i < idx || (i === idx && (phase === 'cleared' || phase === 'done')) ? 'done' : i === idx && phase !== 'intro' ? 'now' : ''} />)}
          </ol>
          {useAir && <span className={`story-chip pods${podsOn && detectorKind ? ' on' : ''}`} title={!podsOn ? 'No AirPod data: press Space or Done one for each rep' : detectorKind ? 'Reps are counted from your AirPods' : 'This move has no AirPod detector yet: press Space or Done one for each rep'}>{!podsOn ? 'No AirPod signal' : detectorKind ? 'AirPods counting' : 'Tap Done for this move'}</span>}
          {breakMode && <span className="story-chip" title="Time left in your break">{fmtClock(timer.remainingNow)} left</span>}
          <button className="story-chip btn-chip" onClick={onExit}>{breakMode ? 'End break' : 'Leave story'}</button>
        </div>

        {(phase === 'scene' || phase === 'cleared') && <h2 className="story-line" key={idx}>{scene.line}</h2>}
        {phase === 'cleared' && <div className={`story-nice${clearedMsg === 'Nice!' ? '' : ' muted'}`} role="status">{clearedMsg}</div>}

        {phase === 'intro' && (
          <div className="story-overlay">
            <h2>{story.name}</h2>
            <p>{story.intro}</p>
            <div className="story-types" role="radiogroup" aria-label="Break type">
              {TYPES.map(t => (
                <button key={t.id} role="radio" aria-checked={type === t.id} className={`story-type${type === t.id ? ' on' : ''}`} onClick={() => setType(t.id)}>
                  <b>{t.label}</b><small>{t.note}</small>
                </button>
              ))}
            </div>
            <button className="ov-btn" onClick={start}>Start the story <kbd>Space</kbd></button>
          </div>
        )}

        {phase === 'done' && (
          <div className="story-overlay">
            <h2>{done.length ? 'You made it!' : 'Story over'}</h2>
            <p>{done.length === story.scenes.length ? `Every scene of ${story.name}, done.` : `${done.length} of ${story.scenes.length} scenes done.`} You earned {earned} points.</p>
            {done.length > 0 && <ul className="story-recap">{done.map((d, i) => <li key={i}>{d}</li>)}</ul>}
            <div className="row-wrap">
              <button className="ov-btn" onClick={start}>Play again</button>
              <button className="ov-btn ghost" onClick={onExit}>{breakMode ? 'Back to work' : 'Pick another story'}</button>
            </div>
          </div>
        )}
      </div>

      <div className={`story-move${phase === 'scene' || phase === 'cleared' ? '' : ' idle'}`} aria-live="polite">
        <div className="sm-ask">
          <b>{move.say(need)}</b>
          <span className="sm-dots" aria-label={`${Math.min(reps, need)} of ${need} done`}>
            {Array.from({ length: need }, (_, i) => <i key={i} className={i < reps ? 'on' : ''} />)}
          </span>
        </div>
        <button className="rep-btn" onClick={() => rep()} disabled={phase !== 'scene'}>Done one <kbd>Space</kbd></button>
        <button className="sm-skip" onClick={() => finishScene(false)} disabled={phase !== 'scene'}>Skip this scene</button>
      </div>
    </div>
  );
}
