import { useState } from 'preact/hooks';

interface Props {
  initial: string;
  /** Used as the accessible name of the text box, e.g. "Section text". */
  label: string;
  allowEmpty?: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}

export function EditText({ initial, label, allowEmpty = false, onSave, onCancel }: Props) {
  const [text, setText] = useState(initial);
  const blank = text.trim().length === 0;
  return (
    <div class="sheet">
      <textarea
        class="edit-box"
        aria-label={label}
        value={text}
        rows={6}
        autoFocus
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
      />
      <div class="chips">
        <button class="chip" disabled={blank && !allowEmpty} onClick={() => onSave(text)}>Save</button>
        <button class="chip" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
