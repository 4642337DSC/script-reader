import type { ShotTag } from '../model/types';

/**
 * Shot tag icons. Wide, medium and close-up are solid rectangles of the same height whose WIDTH changes a lot
 * (long bar, shorter bar, small block), and each has its own colour (set in CSS), so they cannot be confused at a
 * glance. Voiceover is a microphone with no rectangle. With no tag it is an empty dashed rectangle.
 */
const RECT_WIDTH: Record<'wide' | 'medium' | 'closeup', number> = { wide: 22, medium: 12, closeup: 5 };
const RECT_HEIGHT = 12;

export function TagIcon({ tag, size = 24 }: { tag?: ShotTag; size?: number }) {
  return (
    <svg
      data-icon={tag ?? 'none'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {tag === 'voiceover' ? (
        <>
          <rect x="9.5" y="3" width="5" height="10" rx="2.5" />
          <path d="M6.5 11a5.5 5.5 0 0 0 11 0" />
          <path d="M12 16.5V20.5M9 20.5h6" />
        </>
      ) : tag ? (
        <rect
          x={(24 - RECT_WIDTH[tag]) / 2}
          y={(24 - RECT_HEIGHT) / 2}
          width={RECT_WIDTH[tag]}
          height={RECT_HEIGHT}
          rx="2"
          fill="currentColor"
          stroke="none"
        />
      ) : (
        <rect x="2" y="6" width="20" height="12" rx="2" stroke-dasharray="2.5 2.5" />
      )}
    </svg>
  );
}
