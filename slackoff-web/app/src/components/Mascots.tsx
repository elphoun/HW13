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
