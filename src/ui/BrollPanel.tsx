import { useState } from 'preact/hooks';
import type { BrollItem } from '../model/types';
import { AutoSaveText } from './AutoSaveText';

interface Props {
  items: BrollItem[];
  onToggle: (id: string) => void;
  onEditText: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onAdd: (text: string) => void;
}

/** A video's B-roll shot list: checkable, editable in place, and open to additions. Collapsed by default. */
export function BrollPanel({ items, onToggle, onEditText, onRemove, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const done = items.filter((i) => i.done).length;
  return (
    <div class="broll-panel">
      <button class="broll-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {items.length ? `B-roll ${done}/${items.length}` : 'B-roll'}
      </button>
      {open && (
        <div class="broll-body">
          {items.length === 0 && <p class="status">No shots yet</p>}
          {items.map((it) => (
            <div class="broll-item" key={it.id}>
              <button
                class="broll-check"
                role="checkbox"
                aria-checked={it.done}
                aria-label={`Check shot: ${it.text}`}
                onClick={() => onToggle(it.id)}
              >{it.done ? '✓' : ''}</button>
              {editingId === it.id ? (
                <AutoSaveText
                  multiline={false}
                  class="inline-input"
                  label="Shot text"
                  initial={it.text}
                  onSave={(t) => { setEditingId(null); onEditText(it.id, t); }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <span class={`broll-text${it.done ? ' done' : ''}`} onClick={() => setEditingId(it.id)}>{it.text}</span>
              )}
              <button class="broll-x" aria-label={`Remove shot: ${it.text}`} onClick={() => onRemove(it.id)}>✕</button>
            </div>
          ))}
          <AutoSaveText
            keepOpen
            multiline={false}
            autoFocus={false}
            class="inline-input"
            initial=""
            label="Add a shot"
            placeholder="Add a shot"
            onSave={(t) => { onAdd(t); return true; }}
          />
        </div>
      )}
    </div>
  );
}
