import type { ShotTag } from '../model/types';

/**
 * Shot tag icons. Wide, medium and close-up are solid rectangles of the same height whose WIDTH is exaggerated on
 * purpose: a long bar that nearly fills the icon, a bar less than half that, and a thin sliver. Each also has its
 * own colour (set in CSS), so they cannot be confused at a glance. Voiceover is a microphone with no rectangle.
 * With no tag it is an empty dashed rectangle.
 */
const W = 34;
const H = 24;
const RECT_WIDTH: Record<'wide' | 'medium' | 'closeup', number> = { wide: 32, medium: 14, closeup: 4 };
const RECT_HEIGHT = 12;

export function TagIcon({ tag, size = 24 }: { tag?: ShotTag; size?: number }) {
  return (
    <svg
      data-icon={tag ?? 'none'}
      width={(size * W) / H}
      height={size}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {tag === 'voiceover' ? (
        <g transform={`translate(${(W - 24) / 2} 0)`}>
          <rect x="9.5" y="3" width="5" height="10" rx="2.5" />
          <path d="M6.5 11a5.5 5.5 0 0 0 11 0" />
          <path d="M12 16.5V20.5M9 20.5h6" />
        </g>
      ) : tag ? (
        <rect
          x={(W - RECT_WIDTH[tag]) / 2}
          y={(H - RECT_HEIGHT) / 2}
          width={RECT_WIDTH[tag]}
          height={RECT_HEIGHT}
          rx={tag === 'closeup' ? 1.5 : 2}
          fill="currentColor"
          stroke="none"
        />
      ) : (
        <rect x="1" y="6" width="32" height="12" rx="2" stroke-dasharray="3 3" />
      )}
    </svg>
  );
}
