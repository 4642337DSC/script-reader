import { useState } from 'preact/hooks';
import { AutoSaveText } from './AutoSaveText';

interface Props { notes: string; onSave: (notes: string) => void }

/** Filming and publishing notes for one video: collapsed by default, editable in place by anyone with access. */
export function NotesPanel({ notes, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <div class="notes-panel">
      <button class="notes-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>Notes</button>
      {open && (
        <div class="notes-body">
          {editing ? (
            <AutoSaveText
              initial={notes}
              label="Notes text"
              allowEmpty
              enterSaves={false}
              rows={5}
              onSave={(t) => { onSave(t.trim()); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              {notes.trim() ? <p class="notes-text">{notes}</p> : <p class="status">No notes</p>}
              <button class="chip" onClick={() => setEditing(true)}>Edit notes</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
