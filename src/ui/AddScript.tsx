import { useState } from 'preact/hooks';
import { parseDocx } from '../docx/parseDocx';
import { readFileBytes } from '../docx/readFile';
import type { Repo } from '../data/types';

export function AddScript({ repo, clientId }: { repo: Repo; clientId: string }) {
  const [status, setStatus] = useState('');

  const onPick = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const parsed = await parseDocx(await readFileBytes(file));
      const r = await repo.addScript(clientId, file.name, parsed);
      setStatus(r.reimported ? `Updated ${file.name} (kept your locations and ticks)` : `Added ${file.name}`);
    } catch {
      setStatus(`Couldn't read ${file.name}`);
    }
  };

  return (
    <div class="topbar">
      <span class="status">{status}</span>
      <label class="add-btn" aria-label="Add script file">
        +
        <input
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={onPick}
        />
      </label>
    </div>
  );
}
