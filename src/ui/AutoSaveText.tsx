import { useEffect, useRef, useState } from 'preact/hooks';

interface Props {
  initial: string;
  /** Accessible name of the box, e.g. "Section text". */
  label: string;
  placeholder?: string;
  multiline?: boolean;
  /** Enter saves (paragraphs, titles). Off for notes, where Enter is a new line and Ctrl+Enter saves. */
  enterSaves?: boolean;
  /** A cleared box is a valid result (notes); otherwise a blank text leaves the old text alone. */
  allowEmpty?: boolean;
  rows?: number;
  autoFocus?: boolean;
  /**
   * For "add something" boxes that stay on screen: after a save the box empties and is ready for the next entry.
   * If onSave returns false (the text was refused) the text stays so it can be corrected.
   */
  keepOpen?: boolean;
  class?: string;
  onSave: (text: string) => boolean | void;
  onCancel?: () => void;
}

/**
 * A text box with no Save button: tapping anywhere else (or leaving the box) saves a changed text, Enter saves,
 * Escape throws the changes away. An unchanged or blank text just closes the box. Used for every text box in the app.
 */
export function AutoSaveText({
  initial, label, placeholder, multiline = true, enterSaves = true, allowEmpty = false, rows = 4, autoFocus = true, keepOpen = false,
  class: cls = 'edit-box', onSave, onCancel,
}: Props) {
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
    if (save && changed && (allowEmpty || t.trim())) {
      const accepted = onSave(t);
      if (keepOpen && accepted !== false) { textRef.current = initial; setText(initial); }
    } else {
      onCancel?.();
      if (keepOpen && !save) { textRef.current = initial; setText(initial); }
    }
    if (keepOpen) finished.current = false;
  };

  useEffect(() => {
    // tapping a non-focusable area does not always blur the box on phones, so watch taps directly
    const outside = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) finish(true); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, []);

  const common = {
    ref: box as never,
    class: cls,
    'aria-label': label,
    placeholder,
    value: text,
    autoFocus,
    onInput: (e: Event) => setText((e.target as HTMLInputElement).value),
    onBlur: () => finish(true),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); return; }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && (enterSaves || e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
    },
  };
  return multiline ? <textarea {...common} rows={rows} /> : <input type="text" {...common} />;
}
