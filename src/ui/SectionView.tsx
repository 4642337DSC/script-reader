import type { Section } from '../model/types';
import { wordsOf } from '../model/wordMoves';
import type { Rect } from './placePopover';
import { AutoSaveText } from './AutoSaveText';

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
  ctl: WordCtl;
  over?: boolean;
  /** The coloured bar on the left: one tap toggles done. */
  onToggleDone: (id: string) => void;
  /** The location label above the text: opens the location box. */
  onOpenLocation: (id: string, anchor: Rect) => void;
  onAcceptSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
}

function InlineEdit({ initial, onSave, onCancel }: { initial: string; onSave: (t: string) => void; onCancel: () => void }) {
  return (
    <div class="inline-edit">
      <AutoSaveText initial={initial} label="Section text" onSave={onSave} onCancel={onCancel} />
    </div>
  );
}

export function SectionView({ section, ctl, over, onToggleDone, onOpenLocation, onAcceptSuggestion, onDismissSuggestion }: Props) {
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
      >{section.done ? '✓' : ''}</button>
      <div class="section-body">
        <div class="section-top">
          <button class={`loc loc-btn${section.location ? '' : ' empty'}`} onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onOpenLocation(section.id, { left: r.left, top: r.top, width: r.width, height: r.height });
          }}>
            {section.location ? `📍 ${section.location}` : '+ location'}
          </button>
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
                  class={`w${sel && i >= sel.start && i < sel.end ? ' sel' : ''}`}
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
