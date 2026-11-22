import { useState } from 'react';
import { useApp } from '../state/AppState';
import { STORIES, type Story } from '../data/stories';
import { StoryPlayer } from '../components/StoryPlayer';
import { CloudSky } from '../components/CloudSky';

/** Rolling hill behind the menu (the dashed mound in the sketch). */
const Hill = () => (
  <svg className="wo-hill" viewBox="0 0 1440 420" preserveAspectRatio="none" aria-hidden>
    <path d="M0 420V250C150 150 300 60 470 60s300 110 420 150 260 10 360-10 150 0 190 20v200z" fill="#9fd977" />
    <path d="M0 420V330C180 270 360 230 560 250s380 70 560 60 260-30 320-40v170z" fill="#6cbf4f" />
  </svg>
);

/** "Begin your adventure": pick a story, then play it scene by scene. */
export function Adventures({ goHome }: { goHome: () => void }) {
  const { data, updateSettings } = useApp();
  const [playing, setPlaying] = useState<Story | null>(null);
  const [runKey, setRunKey] = useState(0);

  if (playing) {
    return (
      <main className="wipeout playing">
        <StoryPlayer key={runKey} story={playing} onExit={() => { setPlaying(null); setRunKey(k => k + 1); }} />
      </main>
    );
  }

  const open = (s: Story) => { updateSettings({ story: s.id }); setPlaying(s); };

  return (
    <main className="wipeout">
      <CloudSky />
      <Hill />
      <div className="wo-menu">
        <h1 className="wo-title">Begin your adventure</h1>
        <div className="wo-stories">
          {STORIES.map(s => {
            const best = data.runs.filter(r => r.map === s.id).reduce((m, r) => Math.max(m, r.score), 0);
            const isBreakStory = data.settings.story === s.id;
            return (
              <button key={s.id} className={`wo-story${s.playable ? '' : ' soon'}`} disabled={!s.playable} onClick={() => open(s)}>
                <span className="wo-story-name">{s.name}</span>
                <span className="wo-story-meta">
                  {s.playable ? `${s.scenes.length} scenes${best ? `, best ${best} points` : ''}` : s.blurb}
                </span>
                {s.playable && isBreakStory && <span className="wo-story-tag">Plays in your breaks</span>}
              </button>
            );
          })}
        </div>
        <div className="wo-foot">
          <span>Each story works as an activity or a stretch break.</span>
          <button className="wo-link" onClick={goHome}>Back to timer</button>
        </div>
      </div>
    </main>
  );
}
