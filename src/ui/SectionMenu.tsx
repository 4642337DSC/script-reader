import type { Section } from '../model/types';

interface Props {
  section: Section;
  canMerge: boolean;
  onLocation: () => void;
  onEdit: () => void;
  onToggleDone: () => void;
  onSplit: () => void;
  onMerge: () => void;
  onClose: () => void;
}

export function SectionMenu({ section, canMerge, onLocation, onEdit, onToggleDone, onSplit, onMerge, onClose }: Props) {
  return (
    <div class="sheet menu">
      <button onClick={onLocation}>Set location</button>
      <button onClick={onEdit}>Edit text</button>
      <button onClick={onToggleDone}>{section.done ? 'Mark not done' : 'Mark done'}</button>
      <button onClick={onSplit}>Split here</button>
      <button disabled={!canMerge} onClick={onMerge}>Merge with previous</button>
      <button onClick={onClose}>Close</button>
    </div>
  );
}
