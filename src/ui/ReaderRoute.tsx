import { useEffect, useRef, useState } from 'preact/hooks';
import type { Repo, RepoError, ScriptData } from '../data/types';
import type { Video } from '../model/types';
import { ReaderScreen } from './ReaderScreen';

interface Props {
  repo: Repo;
  clientId: string;
  scriptId: string;
  videoId: string;
  onError: (e: RepoError) => void;
}

const loadScale = () => {
  const n = Number(localStorage.getItem('fontScale'));
  return n >= 0.75 && n <= 3 ? n : 1;
};

export function ReaderRoute({ repo, clientId, scriptId, videoId, onError }: Props) {
  const [data, setData] = useState<ScriptData | null | undefined>(undefined);
  const [recents, setRecents] = useState<string[]>([]);
  const [fontScale, setFontScale] = useState(loadScale);
  const latest = useRef<ScriptData | null>(null);

  useEffect(() => repo.watchScript(clientId, scriptId, (d) => { latest.current = d; setData(d); }, onError), [repo, clientId, scriptId]);
  useEffect(() => repo.watchRecents(clientId, setRecents), [repo, clientId]);

  if (data === undefined) return <p>Loading…</p>;
  if (data === null) return <p>This script was deleted.</p>;
  const video = data.doc.videos.find((v) => v.id === videoId);
  if (!video) return <p>This video is no longer in the script.</p>;

  const onChange = (v: Video, r: string[]) => {
    const base = latest.current ?? data;
    const doc = { ...base.doc, videos: base.doc.videos.map((x) => (x.id === v.id ? v : x)) };
    void repo.saveScript(clientId, scriptId, base, doc);
    if (r[0] && r[0] !== recents[0]) void repo.addRecent(clientId, r[0]);
  };

  return (
    <ReaderScreen
      key={videoId}
      video={video}
      recents={recents}
      fontScale={fontScale}
      onFontScale={(n) => { setFontScale(n); localStorage.setItem('fontScale', String(n)); }}
      onChange={onChange}
    />
  );
}
