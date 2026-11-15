interface Props {
  text: string;
  onSplitAt: (charIndex: number) => void;
  onCancel: () => void;
}

export function SplitView({ text, onSplitAt, onCancel }: Props) {
  const words = Array.from(text.matchAll(/\S+/g)).map((m) => ({ w: m[0], at: m.index! }));
  return (
    <div class="sheet">
      <p>Tap the word that should start the new section.</p>
      <div class="text">
        {words.map((x, i) => (
          <span key={x.at}>
            <span class="word" onClick={() => { if (i > 0) onSplitAt(x.at); }}>{x.w}</span>{' '}
          </span>
        ))}
      </div>
      <div class="chips"><button class="chip" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}
