import type { Section } from '../model/types';
import { wordsOf } from '../model/wordMoves';
import type { Rect } from './placePopover';
import { AutoSaveText } from './AutoSaveText';
import { TAG_INFO } from './tagInfo';
import { TagIcon } from './TagIcon';

/** Everything the words of a paragraph need from the screen that owns the selection. */
export interface WordCtl {
  selection: { sectionId: string; start: number; end: number } | null;
  editingId: string | null;
  onWordClick: (sectionId: string, i: number) => void;
  onWordPointerDown: (sectionId: string, i: number, e: PointerEvent) => void;
  onStartEdit: (sectionId: string) => void;
  onSaveEdit: (sectionId: string, text: string) => void;
  onCancelEdit: () => void;
}

interface Props {
  section: Section;
  /** Position of the card in the video, starting at 1; shown in the left bar. */
  number: number;
  ctl: WordCtl;
  over?: boolean;
  /** Words of the current search that appear in this card get highlighted. */
  highlight?: string[];
  /** The coloured bar on the left: one tap toggles done. */
  onToggleDone: (id: string) => void;
  /** The location label above the text: opens the location box. */
  onOpenLocation: (id: string, anchor: Rect) => void;
  /** The shot tag icon: wide, medium, close-up, voiceover. */
  onCycleTag: (id: string) => void;
  /** The trash button: removes the card (Undo brings it back). */
  onDelete?: (id: string) => void;
  onAcceptSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
}

/** Lower-case and strip accents so "si" finds "și" and "Cadre" finds "cadre". */
export const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const wordHit = (w: string, tokens: string[]) => { const f = fold(w); return tokens.some((t) => f.includes(t)); };

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /><path d="M10 11v6" /><path d="M14 11v6" />
    </svg>
  );
}

function InlineEdit({ initial, onSave, onCancel }: { initial: string; onSave: (t: string) => void; onCancel: () => void }) {
  return (
    <div class="inline-edit">
      <AutoSaveText initial={initial} label="Section text" onSave={onSave} onCancel={onCancel} />
    </div>
  );
}

export function SectionView({ section, number, ctl, over, highlight, onToggleDone, onOpenLocation, onCycleTag, onDelete, onAcceptSuggestion, onDismissSuggestion }: Props) {
  const suggestion = !section.location && section.suggestedLocation ? section.suggestedLocation : null;
  const sel = ctl.selection && ctl.selection.sectionId === section.id ? ctl.selection : null;
  const editing = ctl.editingId === section.id;
  return (
    <div class={`section${section.done ? ' done' : ''}${over ? ' over' : ''}`} data-section={section.id}>
      <button
        class="done-btn"
        aria-label={section.done ? 'Mark not done' : 'Mark done'}
        aria-pressed={section.done}
        onClick={() => onToggleDone(section.id)}
      ><span class="card-no">{number}</span>{section.done && <span class="card-check">✓</span>}</button>
      <div class="section-body">
        <div class="section-top">
          <div class="section-meta">
          <button class={`loc loc-btn${section.location ? '' : ' empty'}`} onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onOpenLocation(section.id, { left: r.left, top: r.top, width: r.width, height: r.height });
          }}>
            {section.location ? `📍 ${section.location}` : '+ location'}
          </button>
          <button
            class={`tag-btn${section.tag ? '' : ' empty'}`}
            data-tag={section.tag ?? ''}
            aria-label={`Shot tag: ${section.tag ? TAG_INFO[section.tag].label : 'none'}`}
            title={section.tag ? TAG_INFO[section.tag].label : 'Shot tag'}
            onClick={() => onCycleTag(section.id)}
          ><span class="tag-letter" aria-hidden="true">{section.tag ? TAG_INFO[section.tag].label[0] : ''}</span><TagIcon tag={section.tag} /></button>
          </div>
          {!editing && onDelete && <button class="del-card" aria-label="Delete card" onClick={() => onDelete(section.id)}><TrashIcon /></button>}
          {!editing && <button class="edit-btn" aria-label="Edit text" onClick={() => ctl.onStartEdit(section.id)}>✎</button>}
        </div>
        {suggestion && (
          <div class="suggest">
            <span>{`📍 ${suggestion}?`}</span>
            <button aria-label="Accept suggested location" onClick={() => onAcceptSuggestion?.(section.id)}>Accept</button>
            <button aria-label="Dismiss suggested location" onClick={() => onDismissSuggestion?.(section.id)}>Dismiss</button>
          </div>
        )}
        {editing ? (
          <InlineEdit initial={section.text} onSave={(t) => ctl.onSaveEdit(section.id, t)} onCancel={ctl.onCancelEdit} />
        ) : (
          <div class="text">
            {wordsOf(section.text).map((w, i) => (
              <span key={i}>
                <span
                  class={`w${sel && i >= sel.start && i < sel.end ? ' sel' : ''}${highlight?.length && wordHit(w, highlight) ? ' hit' : ''}`}
                  onClick={() => ctl.onWordClick(section.id, i)}
                  onPointerDown={(e) => ctl.onWordPointerDown(section.id, i, e as unknown as PointerEvent)}
                >{w}</span>{' '}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
