import type { ComponentChildren } from 'preact';
import type { Video } from '../model/types';
import { SectionView, type WordCtl } from './SectionView';
import type { Rect } from './placePopover';

export const MIN_SCALE = 0.75;
export const MAX_SCALE = 3;
const STEP = 0.25;

interface Props {
  video: Video;
  fontScale: number;
  ctl: WordCtl;
  /** Which drop target is under the finger while dragging: "gap:<index>" or "sec:<sectionId>". */
  over?: string | null;
  message?: string;
  canUndo?: boolean;
  onUndo?: () => void;
  onToggleDone: (id: string) => void;
  onOpenLocation: (id: string, anchor: Rect) => void;
  onJoin: (sectionId: string) => void;
  onFontScale: (scale: number) => void;
  onEditTitle?: () => void;
  onAcceptSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
  afterHeader?: ComponentChildren;
}

function Gap({ index, over, joinId, onJoin }: { index: number; over: boolean; joinId?: string; onJoin: (id: string) => void }) {
  return (
    <div class={`gap${over ? ' over' : ''}`} data-drop-gap={index}>
      {joinId && <button class="gap-join" aria-label="Join paragraphs" onClick={() => onJoin(joinId)}>↑ join</button>}
    </div>
  );
}

export function Reader({
  video, fontScale, ctl, over, message, canUndo, onUndo, onToggleDone, onOpenLocation, onJoin, onFontScale, onEditTitle,
  onAcceptSuggestion, onDismissSuggestion, afterHeader,
}: Props) {
  const clamp = (n: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));
  const n = video.sections.length;
  return (
    <div class="reader" style={{ '--scale': String(fontScale) } as any}>
      <header class="reader-head">
        <h1>{video.title}</h1>
        {onEditTitle && <button class="edit-title" aria-label="Edit title" onClick={onEditTitle}>✎</button>}
        <div class="font-ctl">
          {onUndo && <button class="undo-btn" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>↶</button>}
          <button aria-label="Smaller text" onClick={() => onFontScale(clamp(fontScale - STEP))}>A−</button>
          <button aria-label="Larger text" onClick={() => onFontScale(clamp(fontScale + STEP))}>A+</button>
        </div>
      </header>
      {message && <p class="status inline-msg" role="status">{message}</p>}
      {afterHeader}
      {video.sections.map((s, idx) => (
        <div key={s.id}>
          <Gap index={idx} over={over === `gap:${idx}`} joinId={idx > 0 ? s.id : undefined} onJoin={onJoin} />
          <SectionView
            section={s}
            ctl={ctl}
            over={over === `sec:${s.id}`}
            onToggleDone={onToggleDone}
            onOpenLocation={onOpenLocation}
            onAcceptSuggestion={onAcceptSuggestion}
            onDismissSuggestion={onDismissSuggestion}
          />
        </div>
      ))}
      <Gap index={n} over={over === `gap:${n}`} onJoin={onJoin} />
    </div>
  );
}
