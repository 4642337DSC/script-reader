import type { ComponentChildren } from 'preact';
import type { Video } from '../model/types';
import { SectionView } from './SectionView';

export const MIN_SCALE = 0.75;
export const MAX_SCALE = 3;
const STEP = 0.25;

interface Props {
  video: Video;
  fontScale: number;
  onSectionTap: (id: string) => void;
  onFontScale: (scale: number) => void;
  onEditTitle?: () => void;
  onAcceptSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
  afterHeader?: ComponentChildren;
}

export function Reader({ video, fontScale, onSectionTap, onFontScale, onEditTitle, onAcceptSuggestion, onDismissSuggestion, afterHeader }: Props) {
  const clamp = (n: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));
  return (
    <div class="reader" style={{ '--scale': String(fontScale) } as any}>
      <header class="reader-head">
        <h1>{video.title}</h1>
        {onEditTitle && <button class="edit-title" aria-label="Edit title" onClick={onEditTitle}>✎</button>}
        <div class="font-ctl">
          <button aria-label="Smaller text" onClick={() => onFontScale(clamp(fontScale - STEP))}>A−</button>
          <button aria-label="Larger text" onClick={() => onFontScale(clamp(fontScale + STEP))}>A+</button>
        </div>
      </header>
      {afterHeader}
      {video.sections.map((s) => (
        <SectionView key={s.id} section={s} onTap={onSectionTap} onAcceptSuggestion={onAcceptSuggestion} onDismissSuggestion={onDismissSuggestion} />
      ))}
    </div>
  );
}
