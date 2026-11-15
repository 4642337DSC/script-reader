import { useEffect, useState } from 'preact/hooks';

export function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const go = (h: string) => { location.hash = h; setHash(h); };
  return [hash, go] as const;
}

export type Route =
  | { name: 'clients' }
  | { name: 'admin' }
  | { name: 'scripts'; c: string }
  | { name: 'videos'; c: string; s: string }
  | { name: 'reader'; c: string; s: string; v: string }
  | { name: 'orphans'; c: string; s: string };

export function parseRoute(hash: string): Route {
  const p = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (p[0] === 'admin') return { name: 'admin' };
  if (p[0] === 'c' && p[1]) {
    if (p[2] === 's' && p[3]) {
      if (p[4] === 'v' && p[5]) return { name: 'reader', c: p[1], s: p[3], v: p[5] };
      if (p[4] === 'orphans') return { name: 'orphans', c: p[1], s: p[3] };
      return { name: 'videos', c: p[1], s: p[3] };
    }
    return { name: 'scripts', c: p[1] };
  }
  return { name: 'clients' };
}
