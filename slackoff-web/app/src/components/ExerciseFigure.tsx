import type { AnimKey } from '../types';

// One stick-figure rig; CSS (styles.css, ".fig") animates its limbs per exercise via the `ex-*` class.
// Limbs are groups rotating around their joints so every exercise reuses the same drawing.
export function ExerciseFigure({ anim, size = 220 }: { anim: AnimKey; size?: number }) {
  return (
    <div className={`fig ex-${anim}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 200 200" width="100%" height="100%">
        <ellipse className="fig-shadow" cx="100" cy="184" rx="42" ry="7" fill="#000" opacity=".12" />
        {anim === 'flowers' && <g className="fig-flowers">{[40, 70, 130, 160].map(x => (
          <g key={x} transform={`translate(${x} 178)`}><path d="M0 0v-14" stroke="#2f9e44" strokeWidth="3" /><circle cy="-18" r="6" fill={x % 60 === 40 ? '#ff7a93' : '#ffd23f'} /><circle cy="-18" r="2.4" fill="#fff" /></g>
        ))}</g>}
        {anim === 'seated-toe' && <g><rect x="64" y="116" width="72" height="10" rx="5" fill="#b08968" /><path className="chair" d="M70 126v54M130 126v54" /></g>}
        <g className="fig-body">
          <g className="fig-hip">
            <g className="fig-leg legL"><path d="M100 118 L88 150 L86 178" /></g>
            <g className="fig-leg legR"><path d="M100 118 L112 150 L114 178" /></g>
            <g className="fig-torso">
              <path className="torso-line" d="M100 118 L100 70" />
              <g className="fig-arm armL"><path d="M100 76 L80 100 L76 122" /></g>
              <g className="fig-arm armR"><path d="M100 76 L120 100 L124 122" /></g>
              <g className="fig-head">
                <circle cx="100" cy="54" r="17" className="head" />
                <circle cx="94" cy="52" r="2.4" fill="#2b2b3a" /><circle cx="107" cy="52" r="2.4" fill="#2b2b3a" />
                <path d="M94 61c3 3.4 9 3.4 12 0" stroke="#2b2b3a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
