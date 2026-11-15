import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { suggest } from '../model/recentLocations';
import { placePopover, type Rect } from './placePopover';

interface Props {
  recents: string[];
  current: string | null;
  /** Where the label that was tapped is on screen; the popup opens right next to it. */
  anchor?: Rect;
  onPick: (loc: string | null) => void;
  onClose: () => void;
}

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
const DEFAULT_ANCHOR: Rect = { left: 16, top: 16, width: 0, height: 0 };

/** A small popup beside the tapped location label: Save sits next to the text box, recent places are one tap. */
export function LocationSheet({ recents, current, anchor = DEFAULT_ANCHOR, onPick, onClose }: Props) {
  const [text, setText] = useState(current ?? '');
  const chips = suggest(recents, text);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => placePopover(anchor, { width: 0, height: 0 }, viewport()));
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setPos(placePopover(anchor, { width: el.offsetWidth, height: el.offsetHeight }, viewport()));
  }, [anchor.left, anchor.top, anchor.width, anchor.height, chips.length]);

  // Closing the popup is saving: tapping outside keeps what was typed (an empty or unchanged box changes nothing).
  const closeAndSave = () => {
    const t = text.trim();
    if (t && t !== (current ?? '')) onPick(t);
    else onClose();
  };

  return (
    <>
      <div class="loc-backdrop" onClick={closeAndSave} />
      <div
        class="loc-pop"
        ref={ref}
        style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      >
        <div class="pop-row">
          <input
            placeholder="Location"
            value={text}
            autoFocus
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') closeAndSave(); }}
          />
          <button class="chip" onClick={() => onPick(null)}>Clear</button>
        </div>
        {chips.length > 0 && (
          <div class="chips">
            {chips.map((c) => (
              <button class="chip" key={c} onClick={() => onPick(c)}>{c}</button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
