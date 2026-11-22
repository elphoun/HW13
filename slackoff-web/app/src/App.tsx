import { useCallback, useEffect, useState } from 'react';
import { AppProvider, useApp } from './state/AppState';
import { TimerProvider, useTimer } from './state/TimerContext';
import { StoryPlayer } from './components/StoryPlayer';
import { storyById } from './data/stories';
import { TopBar } from './components/TopBar';
import { Rail, type Route } from './components/Rail';
import type { SideTab } from './components/StatsPanel';
import { SettingsModal } from './components/SettingsModal';
import { Toasts } from './components/Toasts';
import { Home } from './pages/Home';
import { Adventures } from './pages/Adventures';
import type { BreakType } from './types';

const parse = (): Route => (location.hash.startsWith('#/adventures') ? 'adventures' : 'home');

/**
 * Exercise break: the whole page becomes your story until the break clock runs out (or you end it).
 * `startWith` is set when you picked "Begin activity" / "Begin stretch"; a break that starts on its own asks first.
 */
function BreakScreen({ startWith, onEnd }: { startWith: BreakType | null; onEnd: () => void }) {
  const { data } = useApp();
  return (
    <div className="break-screen">
      <StoryPlayer breakMode story={storyById(data.settings.story)} startWith={startWith} onExit={onEnd} />
    </div>
  );
}

function Shell() {
  const timer = useTimer();
  const [route, setRoute] = useState<Route>(parse);
  const [settings, setSettings] = useState(false);
  const [sideTab, setSideTab] = useState<SideTab>('today');
  const [breakType, setBreakType] = useState<BreakType | null>(null);
  useEffect(() => { const f = () => setRoute(parse()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  useEffect(() => { if (timer.phase === 'work') setBreakType(null); }, [timer.phase]);
  const go = useCallback((r: Route) => { location.hash = r === 'home' ? '#/' : '#/adventures'; }, []);
  const beginBreak = (type: BreakType) => { setBreakType(type); timer.skip(); };

  if (timer.phase === 'exercise') return <><BreakScreen startWith={breakType} onEnd={timer.skip} /><Toasts /></>;
  return (
    <div className="app">
      <TopBar onShowWeek={() => { setSideTab('week'); go('home'); }} />
      <Rail route={route} go={go} openSettings={() => setSettings(true)} />
      <div className="app-body">
        {route === 'adventures'
          ? <Adventures goHome={() => go('home')} />
          : <Home tab={sideTab} setTab={setSideTab} beginBreak={beginBreak} goAdventures={() => go('adventures')} />}
      </div>
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
      <Toasts />
    </div>
  );
}

export default function App() {
  return <AppProvider><TimerProvider><Shell /></TimerProvider></AppProvider>;
}
