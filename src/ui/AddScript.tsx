import { useState } from 'preact/hooks';
import { parseDocx } from '../docx/parseDocx';
import { readFileBytes } from '../docx/readFile';
import { fetchGoogleDoc, GDocError, parseDocLink } from '../gdocs/gdocs';
import type { Repo } from '../data/types';

interface Props {
  repo: Repo;
  clientId: string;
  /** When present, "+" offers "From Google Docs link" as well as the file picker. */
  getDriveToken?: () => Promise<string>;
}

const FILE_ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function AddScript({ repo, clientId, getDriveToken }: Props) {
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  const importBytes = async (name: string, bytes: ArrayBuffer) => {
    const parsed = await parseDocx(bytes);
    const r = await repo.addScript(clientId, name, parsed);
    setStatus(r.reimported ? `Updated ${name} (kept your locations and ticks)` : `Added ${name}`);
  };

  const onPick = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setOpen(false);
    try {
      await importBytes(file.name, await readFileBytes(file));
    } catch {
      setStatus(`Couldn't read ${file.name}`);
    }
  };

  const importLink = async () => {
    const id = parseDocLink(link);
    if (!id) { setStatus("That doesn't look like a Google Docs link."); return; }
    setBusy(true);
    try {
      let token: string;
      try {
        token = await getDriveToken!();
      } catch {
        setStatus("Google permission wasn't granted, so nothing was imported.");
        return;
      }
      const doc = await fetchGoogleDoc(token, id);
      await importBytes(doc.name, doc.bytes);
      setOpen(false);
      setLinkMode(false);
      setLink('');
    } catch (e) {
      const code = e instanceof GDocError ? e.code : 'other';
      setStatus(
        code === 'no-access' ? "Your Google account can't open that document. Ask the owner to share it with you."
        : code === 'not-a-doc' ? "That link isn't a Google Doc."
        : "Couldn't import that document. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!getDriveToken) {
    return (
      <div class="topbar">
        <span class="status">{status}</span>
        <label class="add-btn" aria-label="Add script file">
          +
          <input type="file" accept={FILE_ACCEPT} hidden onChange={onPick} />
        </label>
      </div>
    );
  }

  return (
    <>
      <div class="topbar">
        <span class="status">{status}</span>
        <button class="add-btn" aria-label="Add script" onClick={() => { setOpen(!open); setLinkMode(false); }}>+</button>
      </div>
      {open && !linkMode && (
        <div class="menu">
          <label class="menu-item">
            From .docx file
            <input type="file" accept={FILE_ACCEPT} hidden onChange={onPick} />
          </label>
          <button onClick={() => setLinkMode(true)}>From Google Docs link</button>
        </div>
      )}
      {open && linkMode && (
        <div class="topbar">
          <input
            class="inline-input"
            placeholder="Paste Google Docs link"
            value={link}
            onInput={(e) => setLink((e.target as HTMLInputElement).value)}
          />
          <button disabled={busy || !link.trim()} onClick={() => void importLink()}>Import</button>
          <button onClick={() => { setLinkMode(false); setOpen(false); }}>Cancel</button>
        </div>
      )}
    </>
  );
}
