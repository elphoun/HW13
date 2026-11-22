import { useState } from 'react';
import { useApp } from '../state/AppState';
import { MAPS, mapById } from '../data/maps';
import { WipeoutGame } from '../game/WipeoutGame';
import { DIFFICULTY_BY_LEVEL, type Difficulty } from '../game/engine';
import type { ActivityMode } from '../types';
import { MascotGang } from '../components/Mascots';

const MODES: { id: ActivityMode; label: string }[] = [
  { id: 'stretches', label: '🧘 Stretches' }, { id: 'activities', label: '🏃 Activities' }, { id: 'both', label: '✨ Both' },
];

const DIFFS: { id: Difficulty; label: string; note: string }[] = [
  { id: 'easy', label: '🐢 Easy', note: 'fewer reps' },
  { id: 'normal', label: '🦊 Normal', note: 'balanced' },
  { id: 'hard', label: '🐯 Hard', note: 'full workout' },
];

export function Wipeout({ goHome }: { goHome: () => void }) {
  const { data, updateSettings } = useApp();
  const [playing, setPlaying] = useState(false);
  const [diff, setDiff] = useState<Difficulty>(DIFFICULTY_BY_LEVEL[data.settings.intensity]);
  const [runKey, setRunKey] = useState(0);
  const mapId = mapById(data.settings.preferredMap).id;
  const best = data.runs.filter(r => r.map === mapId).reduce((m, r) => Math.max(m, r.score), 0);

  if (playing) return <main className="wipeout"><WipeoutGame key={runKey} mapId={mapId} difficulty={diff} onExit={() => { setPlaying(false); setRunKey(k => k + 1); }} /></main>;

  return (
    <main className="wipeout menu">
      <div className="menu-sky">
        <MascotGang className="menu-gang" />
        <h1>Begin your adventure</h1>
        <p className="tagline">Turn your movement break into a game. Pick a map and wipe out!</p>
        <div className="map-list">
          {MAPS.map(m => (
            <button key={m.id} disabled={!m.playable} className={`map-card ${mapId === m.id ? 'on' : ''}`} onClick={() => updateSettings({ preferredMap: m.id })} style={{ ['--a' as string]: m.sky[0], ['--b' as string]: m.mid }}>
              <span className="map-thumb" />
              <span className="map-text"><b>{m.name}</b><small>{m.blurb}</small></span>
              <span className="map-state">{m.playable ? (mapId === m.id ? '✓ Selected' : 'Select') : '🔒 Soon'}</span>
            </button>
          ))}
        </div>
        <div className="diffs">{MODES.map(m => <button key={m.id} className={`pill ${data.settings.activityMode === m.id ? 'on' : ''}`} onClick={() => updateSettings({ activityMode: m.id })}>{m.label}</button>)}</div>
        <div className="diffs">{DIFFS.map(d => <button key={d.id} className={`pill ${diff === d.id ? 'on' : ''}`} onClick={() => setDiff(d.id)}>{d.label} <small>{d.note}</small></button>)}</div>
        <div className="row-wrap center">
          <button className="btn primary big" onClick={() => setPlaying(true)}>🎮 Wipe out!</button>
          <button className="btn secondary" onClick={goHome}>← Back to timer</button>
        </div>
        <p className="muted small">{best ? `Your best on this map: ${best} pts` : 'No runs yet — be the first!'}</p>
      </div>
    </main>
  );
}
