import { useEffect, useState } from 'preact/hooks';
import type { Video } from '../model/types';
import { acceptSuggestion, dismissSuggestion, setLocation, setVideoNotes, setVideoTitle, toggleDone } from '../model/sections';
import { recordLocation } from '../model/recentLocations';
import { Reader } from './Reader';
import { LocationSheet } from './LocationSheet';
import { EditText } from './EditText';
import { NotesPanel } from './NotesPanel';
import { MoveWords } from './MoveWords';

interface Props {
  video: Video;
  recents: string[];
  fontScale: number;
  onFontScale: (n: number) => void;
  onChange: (video: Video, recents: string[]) => void;
  now?: () => number;
}

type Mode = { kind: 'none' } | { kind: 'title' } | { kind: 'location' | 'editor'; id: string };

/**
 * Three direct taps, no popup menu: the bar on the left toggles done, the location label opens the location box,
 * and the text opens the paragraph editor (edit text, split, merge, move words).
 */
export function ReaderScreen({ video: initial, recents: initialRecents, fontScale, onFontScale, onChange, now = Date.now }: Props) {
  const [video, setVideo] = useState(initial);
  useEffect(() => { setVideo(initial); }, [initial]);
  const [recents, setRecents] = useState(initialRecents);
  useEffect(() => { setRecents(initialRecents); }, [initialRecents]);
  const [mode, setMode] = useState<Mode>({ kind: 'none' });

  const commit = (v: Video, r: string[] = recents) => {
    setVideo(v);
    setRecents(r);
    onChange(v, r);
  };
  const section = mode.kind === 'location' || mode.kind === 'editor' ? video.sections.find((s) => s.id === mode.id) ?? null : null;

  return (
    <>
      <Reader
        video={video}
        fontScale={fontScale}
        onFontScale={onFontScale}
        onToggleDone={(id) => commit(toggleDone(video, id, now()))}
        onOpenLocation={(id) => setMode({ kind: 'location', id })}
        onOpenEditor={(id) => setMode({ kind: 'editor', id })}
        onEditTitle={() => setMode({ kind: 'title' })}
        onAcceptSuggestion={(id) => {
          const s = video.sections.find((x) => x.id === id);
          if (s?.suggestedLocation) commit(acceptSuggestion(video, id, now()), recordLocation(recents, s.suggestedLocation));
        }}
        onDismissSuggestion={(id) => commit(dismissSuggestion(video, id, now()))}
        afterHeader={<NotesPanel notes={video.notes ?? ''} onSave={(n) => commit(setVideoNotes(video, n))} />}
      />
      {mode.kind === 'title' && (
        <EditText
          initial={video.title}
          label="Title"
          onSave={(t) => { commit(setVideoTitle(video, t)); setMode({ kind: 'none' }); }}
          onCancel={() => setMode({ kind: 'none' })}
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
      {section && mode.kind === 'editor' && (
        <MoveWords
          video={video}
          sectionId={section.id}
          now={now}
          onApply={(v) => { commit(v); setMode({ kind: 'none' }); }}
          onCancel={() => setMode({ kind: 'none' })}
        />
      )}
    </>
  );
}
