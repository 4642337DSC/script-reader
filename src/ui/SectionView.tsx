import type { Section } from '../model/types';

interface Props {
  section: Section;
  onTap: (id: string) => void;
  onAcceptSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
}

export function SectionView({ section, onTap, onAcceptSuggestion, onDismissSuggestion }: Props) {
  const suggestion = !section.location && section.suggestedLocation ? section.suggestedLocation : null;
  return (
    <div
      class={`section${section.done ? ' done' : ''}`}
      data-section={section.id}
      onClick={() => onTap(section.id)}
    >
      <div class={`loc${section.location ? '' : ' empty'}`}>
        <span>{section.location ? `📍 ${section.location}` : '+ location'}</span>
        {section.done ? <span class="check"> ✓</span> : null}
      </div>
      {suggestion && (
        <div class="suggest" onClick={(e) => e.stopPropagation()}>
          <span>{`📍 ${suggestion}?`}</span>
          <button aria-label="Accept suggested location" onClick={() => onAcceptSuggestion?.(section.id)}>Accept</button>
          <button aria-label="Dismiss suggested location" onClick={() => onDismissSuggestion?.(section.id)}>Dismiss</button>
        </div>
      )}
      <div class="text">{section.text}</div>
    </div>
  );
}
