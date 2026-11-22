export type Route = 'home' | 'adventures';

const ICONS = {
  home: <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z" />,
  adventures: <path d="M5 21V4m0 0h12.5l-2.5 4 2.5 4H5" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>,
};
const Icon = ({ name }: { name: keyof typeof ICONS }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[name]}</svg>
);

/** The narrow left rail: page navigation and settings. */
export function Rail({ route, go, openSettings }: { route: Route; go: (r: Route) => void; openSettings: () => void }) {
  return (
    <nav className="rail" aria-label="Main">
      <button className={route === 'home' ? 'rail-btn on' : 'rail-btn'} onClick={() => go('home')} aria-label="Home" title="Home"><Icon name="home" /></button>
      <button className={route === 'adventures' ? 'rail-btn on' : 'rail-btn'} onClick={() => go('adventures')} aria-label="Adventures" title="Adventures"><Icon name="adventures" /></button>
      <button className="rail-btn rail-end" onClick={openSettings} aria-label="Settings" title="Settings"><Icon name="settings" /></button>
    </nav>
  );
}
