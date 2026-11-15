import { useEffect, useRef, useState } from 'preact/hooks';

interface Props {
  initial: string;
  /** Accessible name of the box, e.g. "Section text". */
  label: string;
  multiline?: boolean;
  /** Enter saves (paragraphs, titles). Off for notes, where Enter is a new line and Ctrl+Enter saves. */
  enterSaves?: boolean;
  /** A cleared box is a valid result (notes); otherwise a blank text leaves the old text alone. */
  allowEmpty?: boolean;
  rows?: number;
  onSave: (text: string) => void;
  onCancel: () => void;
}

/**
 * A text box with no Save button: tapping anywhere else (or leaving the box) saves a changed text, Enter saves,
 * Escape throws the changes away. An unchanged or blank text just closes the box.
 */
export function AutoSaveText({ initial, label, multiline = true, enterSaves = true, allowEmpty = false, rows = 4, onSave, onCancel }: Props) {
  const [text, setText] = useState(initial);
  const textRef = useRef(text);
  textRef.current = text;
  const box = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const finished = useRef(false);

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const t = textRef.current;
    const changed = t.trim() !== initial.trim();
    if (save && changed && (allowEmpty || t.trim())) onSave(t);
    else onCancel();
  };

  useEffect(() => {
    // tapping a non-focusable area does not always blur the box on phones, so watch taps directly
    const outside = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) finish(true); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, []);

  const common = {
    ref: box as never,
    class: 'edit-box',
    'aria-label': label,
    value: text,
    autoFocus: true,
    onInput: (e: Event) => setText((e.target as HTMLInputElement).value),
    onBlur: () => finish(true),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); return; }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && (enterSaves || e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
    },
  };
  return multiline ? <textarea {...common} rows={rows} /> : <input type="text" {...common} />;
}
