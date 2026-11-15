import { useState } from 'preact/hooks';
import { suggest } from '../model/recentLocations';

interface Props {
  recents: string[];
  current: string | null;
  onPick: (loc: string | null) => void;
  onClose: () => void;
}

export function LocationSheet({ recents, current, onPick, onClose }: Props) {
  const [text, setText] = useState(current ?? '');
  const chips = suggest(recents, text);
  return (
    <div class="sheet">
      <input
        placeholder="Location"
        value={text}
        autoFocus
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) onPick(text.trim()); }}
      />
      <div class="chips">
        {chips.map((c) => (
          <button class="chip" key={c} onClick={() => onPick(c)}>{c}</button>
        ))}
      </div>
      <div class="chips">
        <button class="chip" disabled={!text.trim()} onClick={() => onPick(text.trim())}>Save</button>
        <button class="chip" onClick={() => onPick(null)}>Clear</button>
        <button class="chip" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
