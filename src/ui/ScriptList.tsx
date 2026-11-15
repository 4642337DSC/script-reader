import { useEffect, useState } from 'preact/hooks';
import type { Repo, RepoError, ScriptSummary } from '../data/types';
import { AddScript } from './AddScript';

interface Props {
  repo: Repo;
  clientId: string;
  go: (hash: string) => void;
  onError: (e: RepoError) => void;
}

export function ScriptList({ repo, clientId, go, onError }: Props) {
  const [scripts, setScripts] = useState<ScriptSummary[] | null>(null);
  useEffect(() => repo.watchScripts(clientId, setScripts, onError), [repo, clientId]);
  if (!scripts) return <p>Loading…</p>;
  return (
    <>
      <AddScript repo={repo} clientId={clientId} />
      {scripts.length === 0 && <p>No scripts yet — tap + to add one.</p>}
      {scripts.map((s) => (
        <button class="list-item" key={s.id} onClick={() => go(`#/c/${clientId}/s/${s.id}`)}>
          {s.name}
          <small>{s.videoCount} {s.videoCount === 1 ? 'video' : 'videos'}</small>
        </button>
      ))}
    </>
  );
}
