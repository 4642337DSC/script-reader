import { useEffect, useState } from 'preact/hooks';
import type { Video } from '../model/types';
import { mergeWithPrevious, setLocation, splitSection, toggleDone } from '../model/sections';
import { recordLocation } from '../model/recentLocations';
import { Reader } from './Reader';
import { SectionMenu } from './SectionMenu';
import { LocationSheet } from './LocationSheet';
import { SplitView } from './SplitView';

interface Props {
  video: Video;
  recents: string[];
  fontScale: number;
  onFontScale: (n: number) => void;
  onChange: (video: Video, recents: string[]) => void;
  now?: () => number;
}

type Mode = { kind: 'none' } | { kind: 'menu' | 'location' | 'split'; id: string };

export function ReaderScreen({ video: initial, recents: initialRecents, fontScale, onFontScale, onChange, now = Date.now }: Props) {
  const [video, setVideo] = useState(initial);
  useEffect(() => { setVideo(initial); }, [initial]);
  const [recents, setRecents] = useState(initialRecents);
  useEffect(() => { setRecents(initialRecents); }, [initialRecents]);
  const [mode, setMode] = useState<Mode>({ kind: 'none' });
  const [undoId, setUndoId] = useState<string | null>(null);

  const commit = (v: Video, r: string[] = recents) => {
    setVideo(v);
    setRecents(r);
    onChange(v, r);
  };
  const section = mode.kind === 'none' ? null : video.sections.find((s) => s.id === mode.id) ?? null;
  const index = section ? video.sections.indexOf(section) : -1;

  return (
    <>
      <Reader
        video={video}
        fontScale={fontScale}
        onFontScale={onFontScale}
        onSectionTap={(id) => { setUndoId(null); setMode({ kind: 'menu', id }); }}
      />
      {section && mode.kind === 'menu' && (
        <SectionMenu
          section={section}
          canMerge={index > 0}
          onLocation={() => setMode({ kind: 'location', id: section.id })}
          onToggleDone={() => { commit(toggleDone(video, section.id, now())); setMode({ kind: 'none' }); }}
          onSplit={() => setMode({ kind: 'split', id: section.id })}
          onMerge={() => { commit(mergeWithPrevious(video, section.id, now())); setMode({ kind: 'none' }); }}
          onClose={() => setMode({ kind: 'none' })}
        />
      )}
      {section && mode.kind === 'location' && (
        <LocationSheet
          recents={recents}
          current={section.location}
          onPick={(loc) => {
            commit(setLocation(video, section.id, loc, now()), loc ? recordLocation(recents, loc) : recents);
            setMode({ kind: 'none' });
          }}
          onClose={() => setMode({ kind: 'none' })}
        />
      )}
      {section && mode.kind === 'split' && (
        <SplitView
          text={section.text}
          onCancel={() => setMode({ kind: 'none' })}
          onSplitAt={(at) => {
            const next = splitSection(video, section.id, at, now());
            if (next !== video) {
              commit(next);
              setUndoId(next.sections[index + 1].id);
            }
            setMode({ kind: 'none' });
          }}
        />
      )}
      {undoId && (
        <div class="toast">
          Section split
          <button onClick={() => { commit(mergeWithPrevious(video, undoId, now())); setUndoId(null); }}>Undo</button>
        </div>
      )}
    </>
  );
}
