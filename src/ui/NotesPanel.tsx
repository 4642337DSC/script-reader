import { useState } from 'preact/hooks';
import { EditText } from './EditText';

interface Props { notes: string; onSave: (notes: string) => void }

/** Filming and publishing notes for one video: collapsed by default, editable by anyone with access. */
export function NotesPanel({ notes, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <div class="notes-panel">
      <button class="notes-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>Notes</button>
      {open && (
        <div class="notes-body">
          {notes.trim() ? <p class="notes-text">{notes}</p> : <p class="status">No notes</p>}
          <button class="chip" onClick={() => setEditing(true)}>Edit notes</button>
        </div>
      )}
      {editing && (
        <EditText
          initial={notes}
          label="Notes text"
          allowEmpty
          onSave={(t) => { onSave(t.trim()); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
