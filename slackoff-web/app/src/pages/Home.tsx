import { DayTracker } from '../components/DayTracker';
import { Scene } from '../components/Scene';
import { TimerPanel } from '../components/TimerPanel';
import { ExerciseCard } from '../components/ExerciseCard';
import { IntensityPicker, TimerConfig } from '../components/Controls';
import { useTimer } from '../state/TimerContext';
import { MAPS } from '../data/maps';
import { useApp } from '../state/AppState';
import { Logo } from '../components/Mascots';

export function Home({ goWipeout }: { goWipeout: () => void }) {
  const t = useTimer();
  const { data } = useApp();
  const map = MAPS.find(m => m.id === data.settings.preferredMap) ?? MAPS[0];
  return (
    <main className="main">
      <div className="hero-head"><Logo /><p className="tagline">Stop sitting around. Start SlackOff!</p></div>
      <DayTracker />
      <section className="hero">
        <div className="hero-left">{t.phase === 'work' ? <Scene working /> : <ExerciseCard />}</div>
        <div className="hero-right"><TimerPanel /></div>
      </section>
      <div className="config-grid"><TimerConfig /><IntensityPicker /></div>
      <section className="card promo">
        <div><h3>🎮 Wipeout</h3><p>Jump, squat and sprint through the {map.name}. Real moves, real points.</p></div>
        <button className="btn primary" onClick={goWipeout}>Play Wipeout →</button>
      </section>
    </main>
  );
}
