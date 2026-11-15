import { parseDocx } from '../docx/parseDocx';
import * as realDrive from '../drive/drive';
import { AuthExpired } from '../drive/drive';
import { getAccessToken, TOKEN_KEY } from '../drive/auth';
import { buildVideos } from '../model/sections';
import { reimport } from '../model/reimport';
import type { ParsedVideo, ScriptDoc, Section, Video } from '../model/types';
import type { Store } from '../storage/db';

export interface DriveApi {
  listScriptFiles: typeof realDrive.listScriptFiles;
  downloadFile: typeof realDrive.downloadFile;
  readStateFile: typeof realDrive.readStateFile;
  writeStateFile: typeof realDrive.writeStateFile;
}

export interface SyncDeps {
  store: Store;
  token: string | null;
  now: () => number;
  drive?: DriveApi;
}

export interface SyncResult {
  added: number;
  updated: number;
  failed: { name: string; reason: string }[];
  pushed: boolean;
}

const newer = (a: Section, b: Section) => (b.updatedAt > a.updatedAt ? b : a);
const hasState = (s: Section) => s.done || !!s.location;

/**
 * Structure (section order, splits, merges, text) comes from whichever copy of the script was edited last.
 * location/done come from the newest copy of each section id. A section that exists only in the other copy
 * and carries state (location or done) is kept under orphans rather than dropped. Orphans are unioned.
 */
export function mergeDocs(a: ScriptDoc, b: ScriptDoc): ScriptDoc {
  const [base, other] = b.updatedAt > a.updatedAt ? [b, a] : [a, b];
  const otherSections = new Map<string, Section>();
  other.videos.forEach((v) => v.sections.forEach((s) => otherSections.set(s.id, s)));
  const baseIds = new Set<string>();
  const videos: Video[] = base.videos.map((v) => ({
    ...v,
    sections: v.sections.map((s) => {
      baseIds.add(s.id);
      const o = otherSections.get(s.id);
      return o && o.updatedAt > s.updatedAt
        ? { ...s, location: o.location, done: o.done, updatedAt: o.updatedAt }
        : s;
    }),
  }));
  const orphans = new Map<string, Section>();
  [...base.orphans, ...other.orphans].forEach((s) => {
    const prev = orphans.get(s.id);
    orphans.set(s.id, prev ? newer(prev, s) : s);
  });
  otherSections.forEach((s, id) => {
    if (!baseIds.has(id) && !orphans.has(id) && hasState(s)) orphans.set(id, s);
  });
  for (const id of baseIds) orphans.delete(id);
  return { ...base, videos, orphans: [...orphans.values()], updatedAt: Math.max(a.updatedAt, b.updatedAt) };
}

type Downloaded = { parsed: ParsedVideo[] } | { error: string };

let running: Promise<SyncResult> | null = null;

/** Only one sync runs at a time; callers that arrive meanwhile share its result. */
export function syncAll(deps: SyncDeps): Promise<SyncResult> {
  if (running) return running;
  running = doSync(deps).finally(() => { running = null; });
  return running;
}

async function doSync({ store, token, now, drive = realDrive }: SyncDeps): Promise<SyncResult> {
  const result: SyncResult = { added: 0, updated: 0, failed: [], pushed: false };
  if (!token) return result;

  // Phase 1 — all network reads. Nothing local is written here.
  const files = await drive.listScriptFiles(token);
  const remoteDocs = (await drive.readStateFile(token)) ?? [];
  const remoteById = new Map(remoteDocs.map((d) => [d.fileId, d]));
  const downloaded = new Map<string, Downloaded>();
  for (const f of files) {
    const local = await store.getScript(f.id);
    const lastMod = await store.getMeta<string>(`modified:${f.id}`);
    if (local && lastMod === f.modifiedTime) continue;
    try {
      downloaded.set(f.id, { parsed: await parseDocx(await drive.downloadFile(token, f.id)) });
    } catch (e) {
      downloaded.set(f.id, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Phase 2 — read the latest local copy and write straight back, so edits made during phase 1 survive.
  const merged: ScriptDoc[] = [];
  for (const f of files) {
    const local = await store.getScript(f.id);
    const remote = remoteById.get(f.id);
    const dl = downloaded.get(f.id);
    let doc: ScriptDoc | undefined = local;
    if (dl && 'error' in dl) {
      result.failed.push({ name: f.name, reason: dl.error });
    } else if (dl) {
      const base = local && remote ? mergeDocs(local, remote) : (local ?? remote);
      doc = base
        ? reimport({ ...base, name: f.name }, dl.parsed, now())
        : { fileId: f.id, name: f.name, videos: buildVideos(dl.parsed, now()), orphans: [], updatedAt: now() };
      if (local) result.updated++;
      else result.added++;
    }
    if (!doc) continue;
    const final = remote ? mergeDocs(doc, remote) : doc;
    await store.putScript(final);
    if (dl && 'parsed' in dl) await store.putMeta(`modified:${f.id}`, f.modifiedTime);
    merged.push(final);
  }

  // Phase 3 — push. Local data is already safe if this throws; the next sync pushes again.
  const pushedIds = new Set(merged.map((d) => d.fileId));
  const keptRemote = remoteDocs.filter((d) => !pushedIds.has(d.fileId));
  await drive.writeStateFile(token, [...merged, ...keptRemote]);
  result.pushed = true;
  return result;
}

/** Entry point used by the UI. Resolves to a one-line status; never throws for auth/offline. */
export async function runSync(store: Store, interactive: boolean): Promise<string> {
  const token = await getAccessToken(interactive);
  if (!token) return navigator.onLine ? 'Not signed in — tap Sync' : 'Offline — using saved scripts';
  try {
    const r = await syncAll({ store, token, now: Date.now });
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return r.failed.length ? `Synced ${t} · ${r.failed.length} file(s) failed` : `Synced ${t}`;
  } catch (e) {
    if (e instanceof AuthExpired) {
      localStorage.removeItem(TOKEN_KEY);
      return 'Signed out — tap Sync to sign in again';
    }
    return 'Sync failed (will retry)';
  }
}
