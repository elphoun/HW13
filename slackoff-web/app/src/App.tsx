import { useCallback, useEffect, useState } from 'react';
import { AppProvider } from './state/AppState';
import { TimerProvider } from './state/TimerContext';
import { Header, type Route } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { Toasts } from './components/Toasts';
import { Home } from './pages/Home';
import { Wipeout } from './pages/Wipeout';

const parse = (): Route => (location.hash.startsWith('#/wipeout') ? 'wipeout' : 'home');

function Shell() {
  const [route, setRoute] = useState<Route>(parse);
  const [settings, setSettings] = useState(false);
  useEffect(() => { const f = () => setRoute(parse()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const go = useCallback((r: Route) => { location.hash = r === 'home' ? '#/' : '#/wipeout'; }, []);
  return (
    <div className="app">
      <Header route={route} go={go} openSettings={() => setSettings(true)} />
      {route === 'wipeout'
        ? <Wipeout goHome={() => go('home')} />
        : <div className="layout"><Home goWipeout={() => go('wipeout')} /><Sidebar /></div>}
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
      <Toasts />
    </div>
  );
}

export default function App() {
  return <AppProvider><TimerProvider><Shell /></TimerProvider></AppProvider>;
}
