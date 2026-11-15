import type { Section } from '../model/types';

interface Props {
  section: Section;
  /** The coloured bar on the left: one tap toggles done. */
  onToggleDone: (id: string) => void;
  /** The location label above the text: opens the location box. */
  onOpenLocation: (id: string) => void;
  /** The text itself: opens the paragraph editor (edit, split, merge, move words). */
  onOpenEditor: (id: string) => void;
  onAcceptSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
}

export function SectionView({ section, onToggleDone, onOpenLocation, onOpenEditor, onAcceptSuggestion, onDismissSuggestion }: Props) {
  const suggestion = !section.location && section.suggestedLocation ? section.suggestedLocation : null;
  return (
    <div class={`section${section.done ? ' done' : ''}`} data-section={section.id}>
      <button
        class="done-btn"
        aria-label={section.done ? 'Mark not done' : 'Mark done'}
        aria-pressed={section.done}
        onClick={() => onToggleDone(section.id)}
      >{section.done ? '✓' : ''}</button>
      <div class="section-body">
        <button class={`loc loc-btn${section.location ? '' : ' empty'}`} onClick={() => onOpenLocation(section.id)}>
          {section.location ? `📍 ${section.location}` : '+ location'}
        </button>
        {suggestion && (
          <div class="suggest">
            <span>{`📍 ${suggestion}?`}</span>
            <button aria-label="Accept suggested location" onClick={() => onAcceptSuggestion?.(section.id)}>Accept</button>
            <button aria-label="Dismiss suggested location" onClick={() => onDismissSuggestion?.(section.id)}>Dismiss</button>
          </div>
        )}
        <div class="text" onClick={() => onOpenEditor(section.id)}>{section.text}</div>
      </div>
    </div>
  );
}
