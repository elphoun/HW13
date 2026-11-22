import type { CSSProperties } from 'react';

// The SlackOff gang from the sketch: a pink blob, a tall green pill, a small green bean and a yellow smiley block.
export const AVATARS = ['pinky', 'minty', 'bluey', 'sunny', 'grape'] as const;
export type AvatarId = typeof AVATARS[number];
const COLORS: Record<string, { bg: string; fg: string }> = {
  pinky: { bg: '#ffd3dc', fg: '#ff7a93' }, minty: { bg: '#d3f5d8', fg: '#4cc15a' }, bluey: { bg: '#d4ecff', fg: '#4aa8ff' },
  sunny: { bg: '#fff1b8', fg: '#ffc928' }, grape: { bg: '#e8dcff', fg: '#9b72ff' },
};

export function Avatar({ id, size = 40, ring }: { id: string; size?: number; ring?: boolean }) {
  const c = COLORS[id] ?? COLORS.pinky;
  const style: CSSProperties = { width: size, height: size, background: c.bg, boxShadow: ring ? `0 0 0 3px ${c.fg}` : undefined };
  const shape = id === 'minty' ? <rect x="12" y="6" width="16" height="30" rx="8" fill={c.fg} />
    : id === 'sunny' ? <rect x="6" y="12" width="28" height="22" rx="9" fill={c.fg} />
    : id === 'bluey' ? <circle cx="20" cy="21" r="13" fill={c.fg} />
    : id === 'grape' ? <path d="M20 6c9 0 14 8 12 17-1 7-6 12-12 12S9 30 8 23C6 14 11 6 20 6z" fill={c.fg} />
    : <path d="M8 22c0-9 5-15 13-15s11 6 11 14-5 14-13 14S8 30 8 22z" fill={c.fg} />;
  return (
    <span className="avatar" style={style} aria-hidden>
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        {shape}
        <circle cx="16" cy="21" r="2.1" fill="#2b2b3a" /><circle cx="25" cy="21" r="2.1" fill="#2b2b3a" />
        <path d="M16.5 27c2 2.2 5.5 2.2 7.5 0" stroke="#2b2b3a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function MascotGang({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 130" role="img" aria-label="The SlackOff gang">
      <g className="gang-bob b1"><path d="M18 68c-6-22 10-42 34-40 22 2 36 20 30 42-5 18-22 28-42 26-12-1-19-12-22-28z" fill="#ff8fa3" stroke="#e5566f" strokeWidth="3" />
        <circle cx="42" cy="62" r="4.5" fill="#2b2b3a" /><circle cx="66" cy="62" r="4.5" fill="#2b2b3a" /><path d="M46 78c5 6 13 6 18 0" stroke="#2b2b3a" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <ellipse cx="36" cy="72" rx="5" ry="3" fill="#ff5f7e" opacity=".5" /><ellipse cx="73" cy="72" rx="5" ry="3" fill="#ff5f7e" opacity=".5" /></g>
      <g className="gang-bob b2"><rect x="92" y="6" width="36" height="104" rx="18" fill="#59d46a" stroke="#2f9e44" strokeWidth="3" />
        <circle cx="103" cy="42" r="4" fill="#2b2b3a" /><circle cx="119" cy="42" r="4" fill="#2b2b3a" /><path d="M105 55c3 5 8 5 11 0" stroke="#2b2b3a" strokeWidth="3.2" fill="none" strokeLinecap="round" /></g>
      <g className="gang-bob b3"><path d="M138 52c8-6 24-4 28 8 4 13-6 24-18 24-10 0-17-8-17-17 0-6 2-11 7-15z" fill="#8be28f" stroke="#2f9e44" strokeWidth="3" />
        <circle cx="147" cy="68" r="3.4" fill="#2b2b3a" /><path d="M148 77c3 3 7 3 10 0" stroke="#2b2b3a" strokeWidth="3" fill="none" strokeLinecap="round" /></g>
      <g className="gang-bob b4"><rect x="132" y="92" width="76" height="34" rx="14" fill="#ffd23f" stroke="#e5a800" strokeWidth="3" />
        <circle cx="158" cy="106" r="3.6" fill="#2b2b3a" /><circle cx="182" cy="106" r="3.6" fill="#2b2b3a" /><path d="M160 114c6 6 16 6 22 0" stroke="#2b2b3a" strokeWidth="3.2" fill="none" strokeLinecap="round" /></g>
    </svg>
  );
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? 'logo-sm' : ''}`}>
      <span className="logo-letters" aria-label="SlackOff">
        {'SlackOff'.split('').map((ch, i) => <span key={i} style={{ ['--i' as string]: i } as CSSProperties}>{ch}</span>)}
      </span>
    </span>
  );
}
