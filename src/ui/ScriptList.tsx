import { useEffect, useState } from 'preact/hooks';
import type { Repo, RepoError, ScriptSummary } from '../data/types';
import { AddScript } from './AddScript';
import type { Classifier } from '../ai/classify';

interface Props {
  repo: Repo;
  clientId: string;
  go: (hash: string) => void;
  onError: (e: RepoError) => void;
  isAdmin: boolean;
  getDriveToken?: () => Promise<string>;
  classify?: Classifier;
}

export function ScriptList({ repo, clientId, go, onError, isAdmin, getDriveToken, classify }: Props) {
  const [scripts, setScripts] = useState<ScriptSummary[] | null>(null);
  useEffect(() => repo.watchScripts(clientId, setScripts, onError), [repo, clientId]);
  if (!scripts) return <p>Loading…</p>;
  return (
    <>
      <AddScript repo={repo} clientId={clientId} getDriveToken={getDriveToken} classify={classify} />
      {scripts.length === 0 && <p>No scripts yet — tap + to add one.</p>}
      {scripts.map((s) => (
        <div class="script-row" key={s.id}>
          <button class="list-item" onClick={() => go(`#/c/${clientId}/s/${s.id}`)}>
            {s.name}
            <small>{s.videoCount} {s.videoCount === 1 ? 'video' : 'videos'}</small>
          </button>
          {isAdmin && (
            <button
              class="del-btn"
              aria-label={`Delete ${s.name}`}
              onClick={() => {
                if (window.confirm(`Delete ${s.name} for everyone?`)) void repo.deleteScript(clientId, s.id);
              }}
            >Delete</button>
          )}
        </div>
      ))}
    </>
  );
}
