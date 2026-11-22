import { BreakTimeline } from '../components/BreakTimeline';
import { Scene } from '../components/Scene';
import { TimerPanel } from '../components/TimerPanel';
import { MAPS } from '../data/maps';
import { useApp } from '../state/AppState';
import { Logo } from '../components/Mascots';

export function Home({ goWipeout }: { goWipeout: () => void }) {
  const { data } = useApp();
  const map = MAPS.find(m => m.id === data.settings.preferredMap) ?? MAPS[0];
  return (
    <main className="main">
      <div className="hero-head"><Logo /><p className="tagline">Stop sitting around. Start SlackOff!</p></div>
      <BreakTimeline />
      <section className="hero">
        <div className="hero-left"><Scene working /></div>
        <div className="hero-right"><TimerPanel /></div>
      </section>
      <section className="card promo">
        <div><h3>🎮 Wipeout</h3><p>When the timer hits zero, your break is a round of Wipeout. Want a practice run? Jump, squat and sprint through the {map.name} any time.</p></div>
        <button className="btn primary" onClick={goWipeout}>Play Wipeout →</button>
      </section>
    </main>
  );
}
