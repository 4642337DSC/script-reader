export const TOKEN_KEY = 'sr-google-token';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.appdata';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const TIMEOUT_MS = 10_000;

declare const google: any;

function loadGis(): Promise<void> {
  if (typeof google !== 'undefined' && google.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gis load failed'));
    document.head.appendChild(s);
  });
}

function requestToken(clientId: string, interactive: boolean): Promise<{ token: string; exp: number }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (r: any) => {
        clearTimeout(timer);
        if (r.error || !r.access_token) reject(new Error(r.error ?? 'no token'));
        else resolve({ token: r.access_token, exp: Date.now() + Number(r.expires_in ?? 3600) * 1000 });
      },
      error_callback: () => { clearTimeout(timer); reject(new Error('auth error')); },
    });
    client.requestAccessToken({ prompt: interactive ? '' : 'none' });
  });
}

/** Returns a usable token, or null (never throws): offline, not signed in, or silent refresh failed. */
export async function getAccessToken(interactive: boolean): Promise<string | null> {
  try {
    const cached = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null');
    if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  } catch { /* ignore corrupt cache */ }
  if (!navigator.onLine) return null;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) return null;
  try {
    await loadGis();
    const t = await requestToken(clientId, interactive);
    localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
    return t.token;
  } catch {
    return null;
  }
}
