import { parseDocx } from '../docx/parseDocx';
import { buildVideos } from './sections';
import { reimport } from './reimport';
import type { ScriptDoc } from './types';
import type { Store } from '../storage/db';

export const LOCAL_PREFIX = 'local-';

export function readFileBytes(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

/**
 * Adds a .docx picked on this device. Picking a file with the same name again re-imports it,
 * keeping locations/done on unchanged text. Throws if the file is not a readable .docx.
 */
export async function importLocalFile(store: Store, name: string, bytes: ArrayBuffer, now: number): Promise<ScriptDoc> {
  const parsed = await parseDocx(bytes);
  const existing = (await store.getScripts()).find((s) => s.fileId.startsWith(LOCAL_PREFIX) && s.name === name);
  const doc: ScriptDoc = existing
    ? reimport(existing, parsed, now)
    : { fileId: `${LOCAL_PREFIX}${crypto.randomUUID()}`, name, videos: buildVideos(parsed, now), orphans: [], updatedAt: now };
  await store.putScript(doc);
  return doc;
}
