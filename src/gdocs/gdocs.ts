export type GDocErrorCode = 'no-access' | 'not-a-doc' | 'network' | 'other';

export class GDocError extends Error {
  constructor(public code: GDocErrorCode, message = code) {
    super(message);
    this.name = 'GDocError';
  }
}

const API = 'https://www.googleapis.com/drive/v3/files';
const DOC_MIME = 'application/vnd.google-apps.document';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Returns the document id from a docs.google.com/document link, or null if it is not one. */
export function parseDocLink(text: string): string | null {
  const m = text.trim().match(/^https?:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

async function call(token: string, url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new GDocError('network');
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new GDocError('no-access');
  if (!res.ok) throw new GDocError('other');
  return res;
}

/** Reads a Google Doc with the signed-in person's own permission and returns it as .docx bytes. */
export async function fetchGoogleDoc(token: string, docId: string): Promise<{ name: string; bytes: ArrayBuffer }> {
  const id = encodeURIComponent(docId);
  const meta = await (await call(token, `${API}/${id}?fields=name,mimeType`)).json();
  if (meta.mimeType !== DOC_MIME) throw new GDocError('not-a-doc');
  const bytes = await (await call(token, `${API}/${id}/export?mimeType=${encodeURIComponent(DOCX_MIME)}`)).arrayBuffer();
  return { name: String(meta.name ?? 'Google Doc'), bytes };
}
