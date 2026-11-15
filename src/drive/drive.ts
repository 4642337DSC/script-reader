import type { ScriptDoc } from '../model/types';

export class AuthExpired extends Error {
  constructor() { super('Google sign-in expired'); this.name = 'AuthExpired'; }
}

export const SCRIPTS_FOLDER = 'Scripts';
export const STATE_FILE = 'script-reader-state.json';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers as object), Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new AuthExpired();
  if (!res.ok) throw new Error(`Drive ${res.status}`);
  return res;
}

const q = (s: string) => encodeURIComponent(s);

export async function listScriptFiles(token: string): Promise<{ id: string; name: string; modifiedTime: string }[]> {
  const folderQ = `name='${SCRIPTS_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const folders = await (await call(token, `${API}?q=${q(folderQ)}&fields=files(id)`)).json();
  const folderId = folders.files?.[0]?.id;
  if (!folderId) return [];
  const filesQ = `'${folderId}' in parents and trashed=false`;
  const res = await (await call(token, `${API}?q=${q(filesQ)}&fields=files(id,name,modifiedTime)&pageSize=200`)).json();
  return (res.files ?? []).filter((f: { name: string }) => /\.docx$/i.test(f.name) && !f.name.startsWith('~$'));
}

export async function downloadFile(token: string, id: string): Promise<ArrayBuffer> {
  return (await call(token, `${API}/${id}?alt=media`)).arrayBuffer();
}

async function findStateId(token: string): Promise<string | null> {
  const res = await (await call(token, `${API}?spaces=appDataFolder&q=${q(`name='${STATE_FILE}'`)}&fields=files(id)`)).json();
  return res.files?.[0]?.id ?? null;
}

export async function readStateFile(token: string): Promise<ScriptDoc[] | null> {
  const id = await findStateId(token);
  if (!id) return null;
  return (await call(token, `${API}/${id}?alt=media`)).json();
}

export async function writeStateFile(token: string, docs: ScriptDoc[]): Promise<void> {
  const id = await findStateId(token);
  const meta = id ? { name: STATE_FILE } : { name: STATE_FILE, parents: ['appDataFolder'] };
  const boundary = 'sr-boundary';
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(docs)}\r\n--${boundary}--`;
  const url = id ? `${UPLOAD}/${id}?uploadType=multipart` : `${UPLOAD}?uploadType=multipart`;
  await call(token, url, {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}
