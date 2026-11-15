import { useEffect, useState } from 'preact/hooks';
import type { Repo, RepoError, ScriptSummary } from '../data/types';
import { AddScript } from './AddScript';
import type { Classifier } from '../ai/classify';
import type { Broller } from '../ai/broll';

interface Props {
  repo: Repo;
  clientId: string;
  go: (hash: string) => void;
  onError: (e: RepoError) => void;
  isAdmin: boolean;
  getDriveToken?: () => Promise<string>;
  classify?: Classifier;
  extractBroll?: Broller;
}

export function ScriptList({ repo, clientId, go, onError, isAdmin, getDriveToken, classify, extractBroll }: Props) {
  const [scripts, setScripts] = useState<ScriptSummary[] | null>(null);
  /** Scripts being deleted: hidden at once so a slow deletion never looks like nothing happened. */
  const [deleting, setDeleting] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState('');
  useEffect(() => repo.watchScripts(clientId, setScripts, onError), [repo, clientId]);
  if (!scripts) return <p>Loading…</p>;

  const remove = async (s: ScriptSummary) => {
    if (deleting[s.id] || !window.confirm(`Delete ${s.name} for everyone?`)) return;
    setFailed('');
    setDeleting((d) => ({ ...d, [s.id]: s.name }));
    try {
      await repo.deleteScript(clientId, s.id);
    } catch {
      setFailed(`Couldn't delete ${s.name}. Try again.`);
    } finally {
      setDeleting((d) => { const { [s.id]: _gone, ...rest } = d; return rest; });
    }
  };

  const visible = scripts.filter((s) => !deleting[s.id]);
  return (
    <>
      <AddScript repo={repo} clientId={clientId} getDriveToken={getDriveToken} classify={classify} extractBroll={extractBroll} />
      {Object.values(deleting).map((name) => <p class="status" key={name}>{`Deleting ${name}…`}</p>)}
      {failed && <p class="status inline-msg" role="status">{failed}</p>}
      {visible.length === 0 && Object.keys(deleting).length === 0 && <p>No scripts yet — tap + to add one.</p>}
      {visible.map((s) => (
        <div class="script-row" key={s.id}>
          <button class="list-item" onClick={() => go(`#/c/${clientId}/s/${s.id}`)}>
            {s.name}
            <small>{s.videoCount} {s.videoCount === 1 ? 'video' : 'videos'}</small>
          </button>
          {isAdmin && (
            <button class="del-btn" aria-label={`Delete ${s.name}`} onClick={() => void remove(s)}>Delete</button>
          )}
        </div>
      ))}
    </>
  );
}
