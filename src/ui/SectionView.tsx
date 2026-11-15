import type { Section } from '../model/types';

export function SectionView({ section, onTap }: { section: Section; onTap: (id: string) => void }) {
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
      <div class="text">{section.text}</div>
    </div>
  );
}
