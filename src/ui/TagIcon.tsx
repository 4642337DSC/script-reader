import type { ShotTag } from '../model/types';

/**
 * Minimal line icons for the shot tags, all on one 24x24 grid with the same stroke. Wide, medium and close-up are
 * a camera frame with a figure that gets bigger (small figure, head and shoulders, just a face); voiceover is a
 * microphone with no frame. With no tag it is an empty dashed frame.
 */
export function TagIcon({ tag, size = 20 }: { tag?: ShotTag; size?: number }) {
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
      ) : (
        <>
          <rect x="2" y="5" width="20" height="14" rx="2.5" stroke-dasharray={tag ? undefined : '2.5 2.5'} />
          {tag === 'wide' && (
            <>
              <circle cx="12" cy="9.8" r="1.2" />
              <path d="M12 11.4V14.6M12 14.6l-1.6 2.4M12 14.6l1.6 2.4" />
            </>
          )}
          {tag === 'medium' && (
            <>
              <circle cx="12" cy="9.4" r="2.1" />
              <path d="M7.6 19v-1.4a4.4 4.4 0 0 1 8.8 0V19" />
            </>
          )}
          {tag === 'closeup' && (
            <>
              <circle cx="12" cy="12" r="4.8" />
              <path d="M10.3 11.2v.2M13.7 11.2v.2" />
            </>
          )}
        </>
      )}
    </svg>
  );
}
