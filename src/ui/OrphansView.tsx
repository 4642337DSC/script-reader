import { useEffect, useState } from 'preact/hooks';
import type { Repo, RepoError, ScriptData } from '../data/types';

interface Props { repo: Repo; clientId: string; scriptId: string; onError: (e: RepoError) => void }

export function OrphansView({ repo, clientId, scriptId, onError }: Props) {
  const [data, setData] = useState<ScriptData | null | undefined>(undefined);
  useEffect(() => repo.watchScript(clientId, scriptId, setData, onError), [repo, clientId, scriptId]);
  if (data === undefined) return <p>Loading…</p>;
  if (data === null) return <p>This script was deleted.</p>;
  const { doc } = data;
  return (
    <>
      <h2>No longer in script</h2>
      <p class="status">These paragraphs were removed when the file was updated.</p>
      {doc.orphans.length === 0 && <p>Nothing here.</p>}
      {doc.orphans.map((o) => (
        <div class="section" key={o.id}>
          <div class="loc">{o.location ? `📍 ${o.location}` : '—'}{o.done ? ' ✓' : ''}</div>
          <div class="text">{o.text}</div>
          <button
            class="chip"
            onClick={() => void repo.saveScript(clientId, scriptId, data, { ...doc, orphans: doc.orphans.filter((x) => x.id !== o.id) })}
          >Clear</button>
        </div>
      ))}
    </>
  );
}
