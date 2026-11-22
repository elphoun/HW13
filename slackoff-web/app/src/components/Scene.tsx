import { MascotGang } from './Mascots';

/** Sky, clouds and the grassy "SlackOff" hill with the gang on top (left side of the hero in the sketch). */
export function Scene({ working }: { working: boolean }) {
  return (
    <div className={`scene ${working ? 'day' : 'sunset'}`} aria-hidden>
      <div className="sun" />
      <svg className="cloud c1" viewBox="0 0 120 50"><path d="M10 40c-8 0-10-12 0-14 2-12 18-14 24-5 6-9 22-8 26 3 12-3 20 8 12 16z" fill="#fff" /></svg>
      <svg className="cloud c2" viewBox="0 0 120 50"><path d="M10 40c-8 0-10-12 0-14 2-12 18-14 24-5 6-9 22-8 26 3 12-3 20 8 12 16z" fill="#fff" /></svg>
      <svg className="cloud c3" viewBox="0 0 120 50"><path d="M10 40c-8 0-10-12 0-14 2-12 18-14 24-5 6-9 22-8 26 3 12-3 20 8 12 16z" fill="#fff" /></svg>
      <svg className="hill" viewBox="0 0 400 220" preserveAspectRatio="none">
        <path d="M0 220V150C60 110 120 70 200 70s150 40 200 85v65z" fill="#6cc46a" />
        <path d="M0 220V180C80 150 150 120 220 122s130 34 180 60v38z" fill="#4eaa55" />
        {[[70, 168], [330, 172], [30, 195], [372, 196]].map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}><path d="M0 0v-9" stroke="#2f7d3a" strokeWidth="2" /><circle cy="-12" r="4" fill={['#ff7a93', '#ffd23f', '#fff', '#b196ff'][i]} /></g>)}
      </svg>
      <div className="hill-title">Slack<span>Off</span></div>
      <MascotGang className="gang" />
    </div>
  );
}
