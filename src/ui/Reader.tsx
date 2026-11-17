import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Video } from '../model/types';
import { SectionView, fold, type WordCtl } from './SectionView';
import type { Rect } from './placePopover';
import { AutoSaveText } from './AutoSaveText';

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
  onCycleTag: (id: string) => void;
  onJoin: (sectionId: string) => void;
  onDeleteSection?: (sectionId: string) => void;
  /** Starts a new video from the card below this gap (the gap's index). */
  onSplitVideo?: (index: number) => void;
  onFontScale: (scale: number) => void;
  onEditTitle?: () => void;
  editingTitle?: boolean;
  onSaveTitle?: (title: string) => void;
  onCancelTitle?: () => void;
  onAcceptSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
  afterHeader?: ComponentChildren;
}

function Gap({ index, over, joinId, onJoin, onSplitVideo }: { index: number; over: boolean; joinId?: string; onJoin: (id: string) => void; onSplitVideo?: () => void }) {
  return (
    <div class={`gap${over ? ' over' : ''}`} data-drop-gap={index}>
      {joinId && <button class="gap-join" aria-label="Join paragraphs" onClick={() => onJoin(joinId)}>↑ join</button>}
      {onSplitVideo && <button class="gap-split" aria-label="Start a new video here" onClick={onSplitVideo}>✂ new video here</button>}
    </div>
  );
}

export function Reader({
  video, fontScale, ctl, over, message, canUndo, onUndo, onToggleDone, onOpenLocation, onCycleTag, onJoin, onDeleteSection, onSplitVideo, onFontScale, onEditTitle, editingTitle, onSaveTitle, onCancelTitle,
  onAcceptSuggestion, onDismissSuggestion, afterHeader,
}: Props) {
  const clamp = (n: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));
  const n = video.sections.length;
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [uncheckedOnly, setUncheckedOnly] = useState(false);
  const [cur, setCur] = useState(0);
  const visible = video.sections
    .map((s, i) => ({ s, no: i + 1, idx: i }))
    .filter((x) => !uncheckedOnly || !x.s.done);
  const q = fold(query.trim());
  const tokens = q.split(/\s+/).filter(Boolean);
  const hits = q ? visible.filter((x) => fold(x.s.text).includes(q)) : [];
  const highlightFor = (text: string) => (q && fold(text).includes(q) ? tokens : undefined);
  const goTo = (id: string) => {
    const el = document.querySelector(`[data-section="${id}"]`) as HTMLElement | null;
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };
  const jump = (k: number) => {
    if (!hits.length) return;
    const i = ((k % hits.length) + hits.length) % hits.length;
    setCur(i);
    goTo(hits[i].s.id);
  };
  const closeSearch = () => { setSearching(false); setQuery(''); setCur(0); };
  return (
    <div class="reader" style={{ '--scale': String(fontScale) } as any}>
      <header class="reader-head">
        {editingTitle && onSaveTitle && onCancelTitle ? (
          <AutoSaveText initial={video.title} label="Title" multiline={false} onSave={onSaveTitle} onCancel={onCancelTitle} />
        ) : (
          <h1>{video.title}</h1>
        )}
        {onEditTitle && !editingTitle && <button class="edit-title" aria-label="Edit title" onClick={onEditTitle}>✎</button>}
      </header>
      {uncheckedOnly && (
        <p class="status filter-note" role="status">
          {visible.length === 0 ? 'All cards are checked ✓' : `Showing ${visible.length} unchecked of ${n} cards`}
        </p>
      )}
      {message && <p class="status inline-msg" role="status">{message}</p>}
      {afterHeader}
      {visible.map(({ s, idx }) => (
        <div key={s.id}>
          {!uncheckedOnly && <Gap index={idx} over={over === `gap:${idx}`} joinId={idx > 0 ? s.id : undefined} onJoin={onJoin} onSplitVideo={onSplitVideo && idx > 0 ? () => onSplitVideo(idx) : undefined} />}
          <SectionView
            section={s}
            number={idx + 1}
            ctl={ctl}
            over={over === `sec:${s.id}`}
            highlight={highlightFor(s.text)}
            onToggleDone={onToggleDone}
            onOpenLocation={onOpenLocation}
            onCycleTag={onCycleTag}
            onDelete={onDeleteSection}
            onAcceptSuggestion={onAcceptSuggestion}
            onDismissSuggestion={onDismissSuggestion}
          />
        </div>
      ))}
      {!uncheckedOnly && <Gap index={n} over={over === `gap:${n}`} onJoin={onJoin} />}
      <div class="bottom-bar">
          {searching && (
            <div class="search-bar" role="search">
              <input
                class="inline-input"
                type="search"
                aria-label="Search words"
                placeholder="Search this video"
                autoFocus
                value={query}
                onInput={(e) => {
                  const v = (e.currentTarget as HTMLInputElement).value;
                  setQuery(v);
                  setCur(0);
                  const f = fold(v.trim());
                  const first = f ? visible.find((x) => fold(x.s.text).includes(f)) : undefined;
                  if (first) goTo(first.s.id);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); jump(cur + 1); } else if (e.key === 'Escape') closeSearch(); }}
              />
              <button class="tool-btn" aria-label="Previous match" disabled={hits.length < 2} onClick={() => jump(cur - 1)}>↑</button>
              <button class="tool-btn" aria-label="Next match" disabled={hits.length < 2} onClick={() => jump(cur + 1)}>↓</button>
              <button class="tool-btn" aria-label="Close search" onClick={closeSearch}>✕</button>
              {q && (
                <div class="search-hits" role="status">
                  {hits.length === 0 ? <span class="status">No cards contain “{query.trim()}”</span> : (
                    <>
                      <span class="status">{hits.length === 1 ? 'Card' : 'Cards'}:</span>
                      {hits.map((h, k) => (
                        <button key={h.s.id} class={`hit-chip${k === cur ? ' cur' : ''}`} aria-label={`Go to card ${h.no}`} onClick={() => jump(k)}>{h.no}</button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          <div class="font-ctl">
            <button class={`tool-btn${searching ? ' on' : ''}`} aria-label="Search in video" aria-pressed={searching} onClick={() => (searching ? closeSearch() : setSearching(true))}>🔍</button>
            <button class={`tool-btn${uncheckedOnly ? ' on' : ''}`} aria-label="Show only unchecked cards" aria-pressed={uncheckedOnly} onClick={() => setUncheckedOnly(!uncheckedOnly)}>☐</button>
            {onUndo && <button class="undo-btn" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>↶</button>}
            <button aria-label="Smaller text" onClick={() => onFontScale(clamp(fontScale - STEP))}>A−</button>
            <button aria-label="Larger text" onClick={() => onFontScale(clamp(fontScale + STEP))}>A+</button>
          </div>
      </div>
    </div>
  );
}
