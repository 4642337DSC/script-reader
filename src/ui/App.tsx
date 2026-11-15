import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ScriptDoc, Video } from '../model/types';
import type { Store } from '../storage/db';
import { ReaderScreen } from './ReaderScreen';

interface Props {
  store: Store;
  /** Runs a sync; resolves to a short status line. Optional until Drive is wired. */
  sync?: (interactive: boolean) => Promise<string>;
}

const progress = (v: Video[]) => {
  const all = v.flatMap((x) => x.sections);
  return { done: all.filter((s) => s.done).length, total: all.length };
};

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const go = (h: string) => { location.hash = h; setHash(h); };
  return [hash, go] as const;
}

export function App({ store, sync }: Props) {
  const [scripts, setScripts] = useState<ScriptDoc[] | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [fontScale, setFontScale] = useState(1);
  const [status, setStatus] = useState('');
  const [hash, go] = useHash();

  const refresh = useCallback(async () => {
    setScripts(await store.getScripts());
    setRecents(await store.getRecents());
    setFontScale((await store.getMeta<number>('fontScale')) ?? 1);
  }, [store]);
  useEffect(() => { void refresh(); }, [refresh]);

  const runSync = async (interactive = false) => {
    if (!sync) return;
    setStatus('Syncing…');
    try { setStatus(await sync(interactive)); } catch { setStatus('Sync failed (will retry)'); }
    await refresh();
  };
  useEffect(() => {
    void runSync();
    const on = () => void runSync(false);
    addEventListener('online', on);
    return () => removeEventListener('online', on);
  }, []);

  if (!scripts) return <p>Loading…</p>;
  const [, , fileId, sub] = hash.split('/'); // "#/s/<fileId>/<videoId|orphans>"
  const script = scripts.find((s) => s.fileId === fileId);

  const topbar = (back?: string) => (
    <div class="topbar">
      {back !== undefined ? <button onClick={() => go(back)}>← Back</button> : <strong>Script Reader</strong>}
      <span class="status">{status}</span>
      {sync && <button onClick={() => void runSync(true)}>Sync</button>}
    </div>
  );

  if (script && sub && sub !== 'orphans') {
    const video = script.videos.find((v) => v.id === sub);
    if (video) {
      return (
        <>
          {topbar(`#/s/${script.fileId}`)}
          <ReaderScreen
            key={video.id}
            video={video}
            recents={recents}
            fontScale={fontScale}
            onFontScale={(n) => { setFontScale(n); void store.putMeta('fontScale', n); }}
            onChange={async (v, r) => {
              const next: ScriptDoc = {
                ...script,
                videos: script.videos.map((x) => (x.id === v.id ? v : x)),
                updatedAt: Date.now(),
              };
              setScripts(scripts.map((s) => (s.fileId === next.fileId ? next : s)));
              setRecents(r);
              await store.putScript(next);
              await store.putRecents(r);
            }}
          />
        </>
      );
    }
  }

  if (script && sub === 'orphans') {
    return (
      <>
        {topbar(`#/s/${script.fileId}`)}
        <h2>No longer in script</h2>
        {script.orphans.map((o) => (
          <div class="section" key={o.id}>
            <div class="loc">{o.location ? `📍 ${o.location}` : '—'}{o.done ? ' ✓' : ''}</div>
            <div class="text">{o.text}</div>
          </div>
        ))}
      </>
    );
  }

  if (script) {
    return (
      <>
        {topbar('')}
        <h2>{script.name}</h2>
        {script.videos.map((v) => {
          const p = progress([v]);
          const locs = [...new Set(v.sections.map((s) => s.location).filter(Boolean))].join(', ');
          return (
            <button class="list-item" key={v.id} onClick={() => go(`#/s/${script.fileId}/${v.id}`)}>
              {v.title}
              <small>{p.done}/{p.total} done{locs ? ` · ${locs}` : ''}</small>
            </button>
          );
        })}
        {script.orphans.length > 0 && (
          <button class="list-item" onClick={() => go(`#/s/${script.fileId}/orphans`)}>
            {script.orphans.length} no longer in script
          </button>
        )}
      </>
    );
  }

  return (
    <>
      {topbar()}
      {scripts.length === 0 && <p>No scripts yet. Put a .docx in your Drive "Scripts" folder and tap Sync.</p>}
      {scripts.map((s) => {
        const p = progress(s.videos);
        return (
          <button class="list-item" key={s.fileId} onClick={() => go(`#/s/${s.fileId}`)}>
            {s.name}
            <small>{p.done}/{p.total} done</small>
          </button>
        );
      })}
    </>
  );
}
