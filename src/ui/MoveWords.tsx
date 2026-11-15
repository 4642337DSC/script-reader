import { useEffect, useRef, useState } from 'preact/hooks';
import type { Video } from '../model/types';
import { carveWordsIntoSection, moveWordsToAdjacentSection, wordsOf } from '../model/wordMoves';
import { mergeWithPrevious, setText, splitSection } from '../model/sections';
import { EditText } from './EditText';

type Kind = 'prev' | 'next' | 'above' | 'below';
interface Sel { start: number; end: number; anchor: number; phase: 'anchored' | 'range' }

interface Props {
  video: Video;
  sectionId: string;
  onApply: (video: Video) => void;
  onCancel: () => void;
  now?: () => number;
  /** Finds the element under a screen point; replaced in tests. */
  hit?: (x: number, y: number) => Element | null;
}

const HOLD_MS = 350;
const DRAG_PX = 6;

/**
 * Moving words between paragraphs, the way the caption editor does it: select a span of words, then drop it on the
 * previous/next paragraph or in the gap above/below to make a new one. Only a paragraph's edge words can move.
 * Select by tapping the first and last word, or press and hold a word to pick it up; then drag, or use the buttons.
 */
export function MoveWords({ video, sectionId, onApply, onCancel, now = Date.now, hit = (x, y) => document.elementFromPoint(x, y) }: Props) {
  const index = video.sections.findIndex((s) => s.id === sectionId);
  const section = video.sections[index];
  const prev = index > 0 ? video.sections[index - 1] : null;
  const next = index >= 0 && index < video.sections.length - 1 ? video.sections[index + 1] : null;
  const ws = section ? wordsOf(section.text) : [];

  const [sel, setSel] = useState<Sel | null>(null);
  const [message, setMessage] = useState('');
  const [over, setOver] = useState<Kind | null>(null);
  const [editing, setEditing] = useState(false);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const selRef = useRef<Sel | null>(null);
  selRef.current = sel;
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  if (!section) return null;

  const apply = (kind: Kind) => {
    const s = selRef.current;
    if (!s) { setMessage('Select the words first: tap the first and the last word.'); return; }
    const r = kind === 'prev' || kind === 'next'
      ? moveWordsToAdjacentSection(video, sectionId, s.start, s.end, kind, now())
      : carveWordsIntoSection(video, sectionId, s.start, s.end, kind === 'above' ? 'before' : 'after', now());
    if (r.rejected) { setMessage(r.rejected); return; }
    onApply(r.video);
  };

  const split = () => {
    const s = selRef.current;
    if (!s) { setMessage('Select the word the new paragraph should start with.'); return; }
    if (s.start === 0) { setMessage('Select a word after the first one to split before it.'); return; }
    const starts = [...section.text.matchAll(/\S+/g)].map((m) => m.index ?? 0);
    const r = splitSection(video, sectionId, starts[s.start], now());
    if (r === video) { setMessage('That split is not possible here.'); return; }
    onApply(r);
  };

  const tap = (i: number) => {
    setMessage('');
    if (sel?.phase === 'anchored') {
      setSel({ start: Math.min(sel.anchor, i), end: Math.max(sel.anchor, i) + 1, anchor: sel.anchor, phase: 'range' });
    } else {
      setSel({ start: i, end: i + 1, anchor: i, phase: 'anchored' });
    }
  };

  const zoneAt = (x: number, y: number): Kind | null => {
    const el = hit(x, y);
    const z = (el as Element | null)?.closest?.('[data-drop]')?.getAttribute('data-drop');
    return z === 'prev' || z === 'next' || z === 'above' || z === 'below' ? z : null;
  };

  const pointerDown = (i: number, e: PointerEvent) => {
    cleanup.current?.();
    const x0 = e.clientX ?? 0;
    const y0 = e.clientY ?? 0;
    const inSel = !!selRef.current && i >= selRef.current.start && i < selRef.current.end;
    let ready = inSel;
    let dragging = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!inSel) {
      timer = setTimeout(() => {
        timer = null;
        setSel({ start: i, end: i + 1, anchor: i, phase: 'anchored' });
        selRef.current = { start: i, end: i + 1, anchor: i, phase: 'anchored' };
        ready = true;
      }, HOLD_MS);
    }
    const move = (ev: PointerEvent) => {
      const x = ev.clientX ?? 0;
      const y = ev.clientY ?? 0;
      const far = Math.hypot(x - x0, y - y0) > DRAG_PX;
      if (far && timer) { clearTimeout(timer); timer = null; } // moved before the hold finished: this is a scroll, not a pick-up
      if (ready && far) dragging = true;
      if (dragging) { setGhost({ x, y }); setOver(zoneAt(x, y)); }
    };
    const up = (ev: PointerEvent) => {
      const zone = dragging ? zoneAt(ev.clientX ?? 0, ev.clientY ?? 0) : null;
      cleanup.current?.();
      if (zone) apply(zone);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    cleanup.current = () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      cleanup.current = null;
      setGhost(null);
      setOver(null);
    };
  };

  const zone = (kind: Kind, label: string, preview?: string) => (
    <div class={`mw-drop${over === kind ? ' over' : ''}`} data-drop={kind}>
      {preview ? <span class="mw-preview">{preview}</span> : <span class="status">{label}</span>}
    </div>
  );

  return (
    <div class="mw-overlay">
      <p class="status">Tap the first and last word to select, or press and hold a word. Drag onto a paragraph or a gap, or use the buttons.</p>
      {prev ? zone('prev', '', prev.text) : null}
      {zone('above', 'Drop here: new paragraph above')}
      <div class="mw-current" data-section-current>
        {ws.map((w, i) => (
          <span key={i}>
            <span
              class={`mw-word${sel && i >= sel.start && i < sel.end ? ' sel' : ''}`}
              onClick={() => tap(i)}
              onPointerDown={(e) => pointerDown(i, e as unknown as PointerEvent)}
            >{w}</span>{' '}
          </span>
        ))}
      </div>
      {zone('below', 'Drop here: new paragraph below')}
      {next ? zone('next', '', next.text) : null}
      {message && <p class="status mw-message" role="status">{message}</p>}
      <div class="chips">
        <button class="chip" onClick={() => apply('prev')}>To previous paragraph</button>
        <button class="chip" onClick={() => apply('next')}>To next paragraph</button>
        <button class="chip" onClick={() => apply('above')}>New paragraph above</button>
        <button class="chip" onClick={() => apply('below')}>New paragraph below</button>
        <button class="chip" onClick={onCancel}>Cancel</button>
      </div>
      <div class="chips">
        <button class="chip" onClick={() => setEditing(true)}>Edit text</button>
        <button class="chip" onClick={split}>Split before selected word</button>
        <button class="chip" disabled={!prev} onClick={() => onApply(mergeWithPrevious(video, sectionId, now()))}>Merge with previous</button>
      </div>
      {editing && (
        <EditText
          initial={section.text}
          label="Section text"
          onSave={(t) => onApply(setText(video, sectionId, t, now()))}
          onCancel={() => setEditing(false)}
        />
      )}
      {ghost && sel && (
        <div class="mw-ghost" style={{ left: `${ghost.x + 8}px`, top: `${ghost.y + 8}px` }}>
          {ws.slice(sel.start, sel.end).join(' ')}
        </div>
      )}
    </div>
  );
}
