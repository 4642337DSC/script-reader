import { useEffect, useRef, useState } from 'preact/hooks';
import type { Video } from '../model/types';
import {
  acceptSuggestion, dismissSuggestion, mergeWithPrevious, setLocation, setText, setVideoNotes, setVideoTitle, splitSection, toggleDone,
} from '../model/sections';
import { carveWordsIntoSection, moveWordsToAdjacentSection } from '../model/wordMoves';
import { recordLocation } from '../model/recentLocations';
import { Reader } from './Reader';
import { LocationSheet } from './LocationSheet';
import { EditText } from './EditText';
import { NotesPanel } from './NotesPanel';
import type { WordCtl } from './SectionView';
import type { Rect } from './placePopover';

interface Props {
  video: Video;
  recents: string[];
  fontScale: number;
  onFontScale: (n: number) => void;
  onChange: (video: Video, recents: string[]) => void;
  now?: () => number;
  /** Finds the element under a screen point; replaced in tests. */
  hit?: (x: number, y: number) => Element | null;
}

interface Sel { sectionId: string; start: number; end: number; anchor: number; phase: 'anchored' | 'range' }
type Zone = { type: 'gap'; index: number } | { type: 'sec'; id: string };
type Mode = { kind: 'none' } | { kind: 'title' } | { kind: 'location'; id: string; anchor: Rect };

const DOUBLE_TAP_MS = 350;
const HOLD_MS = 350;
const DRAG_PX = 6;
const HISTORY_LIMIT = 20;

/** What counts as "the same video" when deciding whether someone else changed it (ignores bookkeeping fields). */
const fingerprint = (v: Video) =>
  JSON.stringify([v.title, v.notes ?? '', v.sections.map((s) => [s.id, s.text, s.location, s.done])]);

/**
 * The reading screen is also the editing screen, like the caption editor: tap words to select them, drag them onto
 * the paragraph above/below or into a gap, double-tap a word to split before it, tap the line between two paragraphs
 * to join them, and use the pencil to edit a paragraph in place. No menus and no separate screens.
 */
export function ReaderScreen({
  video: initial, recents: initialRecents, fontScale, onFontScale, onChange, now = Date.now,
  hit = (x, y) => document.elementFromPoint(x, y),
}: Props) {
  const [video, setVideo] = useState(initial);
  const [history, setHistory] = useState<Video[]>([]);
  const lastCommitted = useRef(fingerprint(initial));
  useEffect(() => {
    setVideo(initial);
    // someone else changed the video: undoing would overwrite their work, so the history is dropped
    if (fingerprint(initial) !== lastCommitted.current) {
      setHistory([]);
      lastCommitted.current = fingerprint(initial);
    }
  }, [initial]);
  const [recents, setRecents] = useState(initialRecents);
  useEffect(() => { setRecents(initialRecents); }, [initialRecents]);

  const [mode, setMode] = useState<Mode>({ kind: 'none' });
  const [sel, setSel] = useState<Sel | null>(null);
  const selRef = useRef<Sel | null>(null);
  selRef.current = sel;
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; text: string } | null>(null);
  const lastTap = useRef<{ sectionId: string; i: number; t: number } | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const commit = (v: Video, r: string[] = recents) => {
    setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), video]);
    lastCommitted.current = fingerprint(v);
    setVideo(v);
    setRecents(r);
    setSel(null);
    setMessage('');
    onChange(v, r);
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(history.slice(0, -1));
    lastCommitted.current = fingerprint(prev);
    setVideo(prev);
    setSel(null);
    setMessage('');
    onChange(prev, recents);
  };

  const sectionIndex = (id: string) => video.sections.findIndex((s) => s.id === id);
  const startsOf = (text: string) => [...text.matchAll(/\S+/g)].map((m) => m.index ?? 0);

  const split = (sectionId: string, wordIndex: number) => {
    if (wordIndex === 0) { setMessage('Double-tap a word after the first one to split before it.'); return; }
    const s = video.sections[sectionIndex(sectionId)];
    if (!s) return;
    const r = splitSection(video, sectionId, startsOf(s.text)[wordIndex], now());
    if (r === video) { setMessage('That split is not possible here.'); return; }
    commit(r);
  };

  const clickWord = (sectionId: string, i: number) => {
    const t = Date.now();
    const prev = lastTap.current;
    if (prev && prev.sectionId === sectionId && prev.i === i && t - prev.t < DOUBLE_TAP_MS) {
      lastTap.current = null;
      split(sectionId, i);
      return;
    }
    lastTap.current = { sectionId, i, t };
    setMessage('');
    if (sel && sel.sectionId === sectionId && sel.phase === 'anchored') {
      setSel({ sectionId, start: Math.min(sel.anchor, i), end: Math.max(sel.anchor, i) + 1, anchor: sel.anchor, phase: 'range' });
    } else {
      setSel({ sectionId, start: i, end: i + 1, anchor: i, phase: 'anchored' });
    }
  };

  const zoneAt = (x: number, y: number): Zone | null => {
    const el = hit(x, y) as Element | null;
    const gap = el?.closest?.('[data-drop-gap]')?.getAttribute('data-drop-gap');
    if (gap != null) return { type: 'gap', index: Number(gap) };
    const sec = el?.closest?.('[data-section]')?.getAttribute('data-section');
    return sec ? { type: 'sec', id: sec } : null;
  };

  const drop = (zone: Zone) => {
    const s = selRef.current;
    if (!s) return;
    const k = sectionIndex(s.sectionId);
    let result;
    if (zone.type === 'gap') {
      if (zone.index === k) result = carveWordsIntoSection(video, s.sectionId, s.start, s.end, 'before', now());
      else if (zone.index === k + 1) result = carveWordsIntoSection(video, s.sectionId, s.start, s.end, 'after', now());
      else { setMessage('Words can only go into the gap directly above or below their paragraph.'); return; }
    } else {
      const j = sectionIndex(zone.id);
      if (j === k) return; // dropped back where it came from
      if (j === k - 1) result = moveWordsToAdjacentSection(video, s.sectionId, s.start, s.end, 'prev', now());
      else if (j === k + 1) result = moveWordsToAdjacentSection(video, s.sectionId, s.start, s.end, 'next', now());
      else { setMessage('Words can only move to the paragraph directly above or below.'); return; }
    }
    if (result.rejected) { setMessage(result.rejected); return; }
    commit(result.video);
  };

  const pointerDownWord = (sectionId: string, i: number, e: PointerEvent) => {
    cleanup.current?.();
    const x0 = e.clientX ?? 0;
    const y0 = e.clientY ?? 0;
    const cur = selRef.current;
    let ready = !!cur && cur.sectionId === sectionId && i >= cur.start && i < cur.end;
    let dragging = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!ready) {
      timer = setTimeout(() => {
        timer = null;
        const picked: Sel = { sectionId, start: i, end: i + 1, anchor: i, phase: 'anchored' };
        selRef.current = picked;
        setSel(picked);
        ready = true;
      }, HOLD_MS);
    }
    const move = (ev: PointerEvent) => {
      const x = ev.clientX ?? 0;
      const y = ev.clientY ?? 0;
      const far = Math.hypot(x - x0, y - y0) > DRAG_PX;
      if (far && timer) { clearTimeout(timer); timer = null; } // moved before the hold finished: that is a scroll
      if (ready && far) dragging = true;
      if (dragging) {
        const z = zoneAt(x, y);
        setOver(z ? (z.type === 'gap' ? `gap:${z.index}` : `sec:${z.id}`) : null);
        const s = selRef.current;
        const text = s ? video.sections[sectionIndex(s.sectionId)]?.text.trim().split(/\s+/).slice(s.start, s.end).join(' ') ?? '' : '';
        setGhost({ x, y, text });
      }
    };
    const up = (ev: PointerEvent) => {
      const zone = dragging ? zoneAt(ev.clientX ?? 0, ev.clientY ?? 0) : null;
      cleanup.current?.();
      if (zone) drop(zone);
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

  const ctl: WordCtl = {
    selection: sel ? { sectionId: sel.sectionId, start: sel.start, end: sel.end } : null,
    editingId,
    onWordClick: clickWord,
    onWordPointerDown: pointerDownWord,
    onStartEdit: (id) => { setEditingId(id); setSel(null); setMessage(''); },
    onSaveEdit: (id, text) => { setEditingId(null); commit(setText(video, id, text, now())); },
    onCancelEdit: () => setEditingId(null),
  };

  const locSection = mode.kind === 'location' ? video.sections.find((s) => s.id === mode.id) ?? null : null;

  return (
    <>
      <Reader
        video={video}
        fontScale={fontScale}
        ctl={ctl}
        over={over}
        message={message}
        canUndo={history.length > 0}
        onUndo={undo}
        onFontScale={onFontScale}
        onToggleDone={(id) => commit(toggleDone(video, id, now()))}
        onOpenLocation={(id, anchor) => setMode({ kind: 'location', id, anchor })}
        onJoin={(id) => commit(mergeWithPrevious(video, id, now()))}
        onEditTitle={() => setMode({ kind: 'title' })}
        onAcceptSuggestion={(id) => {
          const s = video.sections.find((x) => x.id === id);
          if (s?.suggestedLocation) commit(acceptSuggestion(video, id, now()), recordLocation(recents, s.suggestedLocation));
        }}
        onDismissSuggestion={(id) => commit(dismissSuggestion(video, id, now()))}
        afterHeader={<NotesPanel notes={video.notes ?? ''} onSave={(n) => commit(setVideoNotes(video, n))} />}
      />
      {mode.kind === 'title' && (
        <EditText
          initial={video.title}
          label="Title"
          onSave={(t) => { commit(setVideoTitle(video, t)); setMode({ kind: 'none' }); }}
          onCancel={() => setMode({ kind: 'none' })}
        />
      )}
      {locSection && (
        <LocationSheet
          recents={recents}
          current={locSection.location}
          anchor={mode.kind === 'location' ? mode.anchor : undefined}
          onPick={(loc) => {
            commit(setLocation(video, locSection.id, loc, now()), loc ? recordLocation(recents, loc) : recents);
            setMode({ kind: 'none' });
          }}
          onClose={() => setMode({ kind: 'none' })}
        />
      )}
      {ghost && ghost.text && (
        <div class="mw-ghost" style={{ left: `${ghost.x + 8}px`, top: `${ghost.y + 8}px` }}>{ghost.text}</div>
      )}
    </>
  );
}
