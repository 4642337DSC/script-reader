import { useRef, useState } from 'preact/hooks';
import { readFileBytes } from '../docx/readFile';
import { fetchGoogleDoc, GDocError, parseDocLink } from '../gdocs/gdocs';
import { AiUnavailable, type Classifier } from '../ai/classify';
import { AutoSaveText } from './AutoSaveText';
import { basicImport, smartImport } from '../import/smartImport';
import type { Repo } from '../data/types';

interface Props {
  repo: Repo;
  clientId: string;
  /** When present, "+" offers "From Google Docs link" as well as the file picker. */
  getDriveToken?: () => Promise<string>;
  /** When present, documents are read with Gemini; otherwise the basic rule-based reading is used. */
  classify?: Classifier;
}

const FILE_ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const AI_NOTICE = "Importing sends the document text to Google's Gemini service to read its structure. As we understand Google's terms, content sent on the free tier may be used by Google to improve its products.";

export function AddScript({ repo, clientId, getDriveToken, classify }: Props) {
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [unavailable, setUnavailable] = useState<{ name: string; bytes: ArrayBuffer; reason: string } | null>(null);
  const [aiSeen, setAiSeen] = useState(() => localStorage.getItem('aiNoticeSeen') === '1');

  const finish = (name: string, r: { reimported: boolean; orphanedCount: number }, notice?: string, why?: string) => {
    setStatus(r.reimported ? `Updated ${name} (kept your locations, ticks and edits)` : `Added ${name}`);
    const n = r.orphanedCount;
    setNotes([
      ...(n > 0 ? [`${n} ${n === 1 ? 'paragraph' : 'paragraphs'} moved to "no longer in script"`] : []),
      ...(notice ? [notice] : []),
      ...(why ? [`AI problem: ${why}`] : []),
    ]);
  };

  // One import at a time: a second tap while Gemini is still reading would otherwise create the script twice.
  const running = useRef(false);
  const exclusive = async (fn: () => Promise<void>) => {
    if (running.current) { setStatus('Another import is still running.'); return; }
    running.current = true;
    try { await fn(); } finally { running.current = false; }
  };

  const importBytes = async (name: string, bytes: ArrayBuffer) => {
    setUnavailable(null);
    setNotes([]);
    setStatus(`Reading ${name}…`);
    if (!classify) {
      finish(name, await repo.addScript(clientId, name, await basicImport(bytes)));
      return;
    }
    const exists = await repo.hasScript(clientId, name);
    try {
      const res = await smartImport(bytes, { classify, scriptExists: exists });
      finish(name, await repo.addScript(clientId, name, res.videos), res.notice, res.reason ? `${res.reason}${res.detail && res.detail !== res.reason ? ' (' + res.detail.slice(0, 400) + ')' : ''}` : undefined);
    } catch (e) {
      if (e instanceof AiUnavailable) { setUnavailable({ name, bytes, reason: `${e.reason}${e.message && e.message !== e.reason ? ' (' + e.message.slice(0, 400) + ')' : ''}` }); return; }
      throw e;
    }
  };

  const importBasicAnyway = async () => {
    if (!unavailable) return;
    const { name, bytes } = unavailable;
    setUnavailable(null);
    await exclusive(async () => {
      try {
        finish(name, await repo.addScript(clientId, name, await basicImport(bytes)));
      } catch {
        setStatus(`Couldn't read ${name}`);
      }
    });
  };

  const onPick = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setOpen(false);
    await exclusive(async () => {
      try {
        await importBytes(file.name, await readFileBytes(file));
      } catch {
        setStatus(`Couldn't read ${file.name}`);
        setNotes([]);
      }
    });
  };

  /** Called when the link box is left or Enter is pressed. Returns false when the text is not a Docs link, so it stays to be fixed. */
  const importLink = (text: string): boolean => {
    const id = parseDocLink(text);
    if (!id) { setStatus("That doesn't look like a Google Docs link."); return false; }
    void exclusive(() => importLinkNow(id));
    return true;
  };

  const importLinkNow = async (id: string) => {
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
    } catch (e) {
      const code = e instanceof GDocError ? e.code : 'other';
      setStatus(
        code === 'no-access' ? "Your Google account can't open that document. Ask the owner to share it with you."
        : code === 'not-a-doc' ? "That link isn't a Google Doc."
        : "Couldn't import that document. Check your connection and try again.",
      );
      setNotes([]);
    }
  };

  const banner = classify && !aiSeen ? (
    <div class="notice">
      <span>{AI_NOTICE}</span>
      <button onClick={() => { localStorage.setItem('aiNoticeSeen', '1'); setAiSeen(true); }}>OK</button>
    </div>
  ) : null;

  const dialog = unavailable ? (
    <div class="toast" role="alert">
      <span>The AI reading is unavailable right now.</span>
      <small>{`Reason: ${unavailable.reason}`}</small>
      <button onClick={() => void importBasicAnyway()}>Import with basic reading anyway</button>
      <button onClick={() => setUnavailable(null)}>Try again later</button>
    </div>
  ) : null;

  const statusLine = (
    <>
      <span class="status">{status}</span>
      {notes.map((n) => <span class="status" key={n}>{n}</span>)}
    </>
  );

  if (!getDriveToken) {
    return (
      <>
        {banner}
        <div class="topbar">
          <span class="status-col">{statusLine}</span>
          <label class="add-btn" aria-label="Add script file">
            +
            <input type="file" accept={FILE_ACCEPT} hidden onChange={onPick} />
          </label>
        </div>
        {dialog}
      </>
    );
  }

  return (
    <>
      {banner}
      <div class="topbar">
        <span class="status-col">{statusLine}</span>
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
          <AutoSaveText
            keepOpen
            multiline={false}
            class="inline-input"
            initial=""
            label="Google Docs link"
            placeholder="Paste Google Docs link"
            onSave={importLink}
            onCancel={() => { setLinkMode(false); setOpen(false); }}
          />
        </div>
      )}
      {dialog}
    </>
  );
}
