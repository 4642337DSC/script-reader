import { parseDocx } from '../docx/parseDocx';
import * as realDrive from '../drive/drive';
import { getAccessToken } from '../drive/auth';
import { buildVideos } from '../model/sections';
import { reimport } from '../model/reimport';
import type { ScriptDoc, Section, Video } from '../model/types';
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

/**
 * Structure (section order, splits, merges) comes from whichever copy of the script was edited last;
 * per-section fields (location, done) come from the newest copy of each section id. Orphans are unioned.
 */
export function mergeDocs(a: ScriptDoc, b: ScriptDoc): ScriptDoc {
  const [base, other] = b.updatedAt > a.updatedAt ? [b, a] : [a, b];
  const otherSections = new Map<string, Section>();
  other.videos.forEach((v) => v.sections.forEach((s) => otherSections.set(s.id, s)));
  const videos: Video[] = base.videos.map((v) => ({
    ...v,
    sections: v.sections.map((s) => {
      const o = otherSections.get(s.id);
      return o ? newer(s, o) : s;
    }),
  }));
  const orphans = new Map<string, Section>();
  [...a.orphans, ...b.orphans].forEach((s) => {
    const prev = orphans.get(s.id);
    orphans.set(s.id, prev ? newer(prev, s) : s);
  });
  return { ...base, videos, orphans: [...orphans.values()], updatedAt: Math.max(a.updatedAt, b.updatedAt) };
}

export async function syncAll({ store, token, now, drive = realDrive }: SyncDeps): Promise<SyncResult> {
  const result: SyncResult = { added: 0, updated: 0, failed: [], pushed: false };
  if (!token) return result;

  // Network reads first: if either throws, nothing local has been touched.
  const files = await drive.listScriptFiles(token);
  const remoteDocs = (await drive.readStateFile(token)) ?? [];
  const remoteById = new Map(remoteDocs.map((d) => [d.fileId, d]));

  const merged: ScriptDoc[] = [];
  for (const f of files) {
    const local = await store.getScript(f.id);
    const lastMod = await store.getMeta<string>(`modified:${f.id}`);
    let doc = local;
    if (!local || lastMod !== f.modifiedTime) {
      try {
        const parsed = await parseDocx(await drive.downloadFile(token, f.id));
        const base = local ?? remoteById.get(f.id);
        doc = base
          ? reimport({ ...base, name: f.name }, parsed, now())
          : { fileId: f.id, name: f.name, videos: buildVideos(parsed, now()), orphans: [], updatedAt: now() };
        if (local) result.updated++;
        else result.added++;
        await store.putMeta(`modified:${f.id}`, f.modifiedTime);
      } catch (e) {
        result.failed.push({ name: f.name, reason: e instanceof Error ? e.message : String(e) });
        if (!local) continue;
      }
    }
    const remote = remoteById.get(f.id);
    merged.push(doc && remote ? mergeDocs(doc, remote) : doc!);
  }

  for (const d of merged) await store.putScript(d);

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
  } catch {
    return 'Sync failed (will retry)';
  }
}
