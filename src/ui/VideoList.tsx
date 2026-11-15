import { useEffect, useState } from 'preact/hooks';
import type { Repo, RepoError, ScriptData } from '../data/types';

interface Props {
  repo: Repo;
  clientId: string;
  scriptId: string;
  go: (hash: string) => void;
  onError: (e: RepoError) => void;
}

export function VideoList({ repo, clientId, scriptId, go, onError }: Props) {
  const [data, setData] = useState<ScriptData | null | undefined>(undefined);
  useEffect(() => repo.watchScript(clientId, scriptId, setData, onError), [repo, clientId, scriptId]);
  if (data === undefined) return <p>Loading…</p>;
  if (data === null) return <p>This script was deleted.</p>;
  const { doc } = data;
  return (
    <>
      <h2>{doc.name}</h2>
      {doc.videos.map((v, idx) => {
        const prevGroup = idx > 0 ? doc.videos[idx - 1].group ?? null : null;
        const showGroup = !!v.group && v.group !== prevGroup;
        const done = v.sections.filter((s) => s.done).length;
        const locs = [...new Set(v.sections.map((s) => s.location).filter(Boolean))].join(', ');
        const shots = v.broll ?? [];
        const shotsDone = shots.filter((b) => b.done).length;
        return (
          <div key={v.id}>
          {showGroup && <h3 class="group-head">{v.group}</h3>}
          <button class="list-item" onClick={() => go(`#/c/${clientId}/s/${scriptId}/v/${v.id}`)}>
            {v.title}
            <small>{done}/{v.sections.length} done{locs ? ` · ${locs}` : ''}{shots.length ? ` · B-roll ${shotsDone}/${shots.length}` : ''}</small>
          </button>
          </div>
        );
      })}
      {doc.orphans.length > 0 && (
        <button class="list-item" onClick={() => go(`#/c/${clientId}/s/${scriptId}/orphans`)}>
          {doc.orphans.length} no longer in script
        </button>
      )}
    </>
  );
}
