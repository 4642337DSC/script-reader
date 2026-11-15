import { openDB } from 'idb';
import type { ScriptDoc } from '../model/types';

export interface Store {
  getScripts(): Promise<ScriptDoc[]>;
  getScript(fileId: string): Promise<ScriptDoc | undefined>;
  putScript(doc: ScriptDoc): Promise<void>;
  getRecents(): Promise<string[]>;
  putRecents(list: string[]): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  putMeta(key: string, value: unknown): Promise<void>;
}

export async function openStore(): Promise<Store> {
  const db = await openDB('script-reader', 1, {
    upgrade(d) {
      d.createObjectStore('scripts', { keyPath: 'fileId' });
      d.createObjectStore('meta');
    },
  });
  return {
    getScripts: () => db.getAll('scripts'),
    getScript: (id) => db.get('scripts', id),
    putScript: async (doc) => { await db.put('scripts', doc); },
    getRecents: async () => (await db.get('meta', 'recents')) ?? [],
    putRecents: async (l) => { await db.put('meta', l, 'recents'); },
    getMeta: (k) => db.get('meta', k),
    putMeta: async (k, v) => { await db.put('meta', v, k); },
  };
}
