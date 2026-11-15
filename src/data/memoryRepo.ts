import { countNewOrphans, reimport } from '../model/reimport';
import { buildVideosFromImport, normalizeImport } from '../import/importModel';
import { recordLocation } from '../model/recentLocations';
import { assembleDoc, assignOrders, assignVideoOrders, diffRows, diffVideos, flattenDoc } from './docOps';
import type {
  AuthUser, Client, ImportedVideo, ParsedVideo, Repo, RepoError, ScriptData, ScriptDoc, ScriptSummary, SectionRow, SyncState, Unsub, VideoRow,
} from './types';

/** In-memory Repo used by UI tests. Mirrors the real repo's contract, including access checks. */
interface MScript { id: string; name: string; videos: VideoRow[]; rows: SectionRow[]; updatedAt: number }
interface MClient { id: string; name: string; members: string[]; scripts: Map<string, MScript>; recents: string[] }

export interface MemoryBackend {
  clients: Map<string, MClient>;
  listeners: Set<() => void>;
  seq: number;
  notify(): void;
}

export function createMemoryBackend(): MemoryBackend {
  const b: MemoryBackend = {
    clients: new Map(), listeners: new Set(), seq: 0,
    notify() { [...b.listeners].forEach((l) => l()); },
  };
  return b;
}

class Denied extends Error { code = 'permission-denied' as const; }
const lower = (s: string) => s.trim().toLowerCase();
const denied = (message = 'permission denied'): RepoError => ({ code: 'permission-denied', message });

interface Opts { user: AuthUser; adminEmail?: string; now?: () => number; backend?: MemoryBackend }
export type MemoryRepo = Repo & { setOnline(v: boolean): void; simulateRemoveAccess(clientId: string): void };

export function createMemoryRepo(opts: Opts): MemoryRepo {
  const backend = opts.backend ?? createMemoryBackend();
  const now = opts.now ?? Date.now;
  const me = lower(opts.user.email);
  const admin = !!opts.adminEmail && lower(opts.adminEmail) === me;
  const canOpen = (c: MClient | undefined): c is MClient => !!c && (admin || c.members.includes(me));
  let online = true;
  const queue: (() => void)[] = [];
  const syncListeners = new Set<(s: SyncState) => void>();
  const emitSync = () => syncListeners.forEach((l) => l({ online, pending: queue.length > 0 }));

  const subscribe = (fn: () => void): Unsub => {
    backend.listeners.add(fn);
    fn();
    return () => backend.listeners.delete(fn);
  };
  const requireAdmin = () => { if (!admin) throw new Denied(); };
  const requireClient = (id: string) => {
    const c = backend.clients.get(id);
    if (!canOpen(c)) throw new Denied();
    return c;
  };
  const write = <T,>(fn: () => T): Promise<T> => {
    if (online) return Promise.resolve().then(fn).then((r) => { backend.notify(); return r; });
    return new Promise<T>((resolve, reject) => {
      queue.push(() => { try { resolve(fn()); } catch (e) { reject(e); } });
      emitSync();
    });
  };

  const scriptData = (s: MScript): ScriptData => assembleDoc(s.id, s.name, s.videos, s.rows);

  function applySave(clientId: string, scriptId: string, before: ScriptData, after: ScriptDoc): { droppedOnReject?: number } {
    const orders = assignOrders(after, before.orders);
    const videoOrders = assignVideoOrders(after, before.videoOrders);
    const beforeFlat = flattenDoc(before.doc, before.orders, before.videoOrders);
    const flat = flattenDoc(after, orders, videoOrders);
    const d = diffRows(beforeFlat.rows, flat.rows);
    const vd = diffVideos(beforeFlat.videos, flat.videos);
    const total = d.sets.length + d.updates.length + d.deletes.length + vd.sets.length + vd.updates.length + vd.deletes.length;
    const c = backend.clients.get(clientId);
    const s = c?.scripts.get(scriptId);
    if (!canOpen(c) || !s) return { droppedOnReject: total };
    const byId = new Map(s.rows.map((r) => [r.id, r]));
    d.sets.forEach((r) => byId.set(r.id, r));
    d.updates.forEach((u) => { const r = byId.get(u.id); if (r) byId.set(u.id, { ...r, ...u.patch }); });
    d.deletes.forEach((id) => byId.delete(id));
    s.rows = [...byId.values()];
    const vById = new Map(s.videos.map((v) => [v.id, v]));
    vd.sets.forEach((v) => vById.set(v.id, v));
    vd.updates.forEach((u) => { const v = vById.get(u.id); if (v) vById.set(u.id, { ...v, ...u.patch }); });
    vd.deletes.forEach((id) => vById.delete(id));
    s.videos = [...vById.values()];
    s.updatedAt = now();
    return {};
  }

  const repo: MemoryRepo = {
    setOnline(v) {
      online = v;
      if (v) { queue.splice(0).forEach((q) => q()); backend.notify(); }
      emitSync();
    },
    simulateRemoveAccess(clientId) {
      const c = backend.clients.get(clientId);
      if (c) c.members = c.members.filter((m) => m !== me);
      backend.notify();
    },
    async isAdmin() { return admin; },
    watchClients(cb) {
      return subscribe(() => {
        const list: Client[] = [...backend.clients.values()].filter(canOpen).map((c) => ({ id: c.id, name: c.name, members: [...c.members] }));
        cb(list);
      });
    },
    watchScripts(clientId, cb, onError) {
      return subscribe(() => {
        const c = backend.clients.get(clientId);
        if (!canOpen(c)) return onError(denied());
        const list: ScriptSummary[] = [...c.scripts.values()].map((s) => ({ id: s.id, name: s.name, videoCount: s.videos.length, updatedAt: s.updatedAt }));
        cb(list);
      });
    },
    watchScript(clientId, scriptId, cb, onError) {
      return subscribe(() => {
        const c = backend.clients.get(clientId);
        if (!canOpen(c)) return onError(denied());
        const s = c.scripts.get(scriptId);
        cb(s ? scriptData(s) : null);
      });
    },
    watchRecents(clientId, cb) {
      return subscribe(() => {
        const c = backend.clients.get(clientId);
        if (canOpen(c)) cb([...c.recents]);
      });
    },
    watchSyncState(cb) {
      syncListeners.add(cb);
      cb({ online, pending: queue.length > 0 });
      return () => syncListeners.delete(cb);
    },
    createClient(name) {
      return write(() => {
        requireAdmin();
        const id = `c${++backend.seq}`;
        backend.clients.set(id, { id, name, members: [], scripts: new Map(), recents: [] });
        return id;
      });
    },
    renameClient(id, name) {
      return write(() => { requireAdmin(); const c = backend.clients.get(id); if (c) c.name = name; });
    },
    deleteClient(id) {
      return write(() => { requireAdmin(); backend.clients.delete(id); });
    },
    setMembers(id, emails) {
      return write(() => {
        requireAdmin();
        const c = backend.clients.get(id);
        if (c) c.members = [...new Set(emails.map(lower))];
      });
    },
    addScript(clientId, name, parsed: ImportedVideo[] | ParsedVideo[]) {
      return write(() => {
        const c = requireClient(clientId);
        const existing = [...c.scripts.values()].find((s) => s.name === name);
        if (existing) {
          const before = scriptData(existing);
          const next = reimport(before.doc, parsed, now());
          applySave(clientId, existing.id, before, next);
          return { scriptId: existing.id, reimported: true, orphanedCount: countNewOrphans(before.doc, next) };
        }
        const id = `s${++backend.seq}`;
        const doc: ScriptDoc = { fileId: id, name, videos: buildVideosFromImport(normalizeImport(parsed), now()), orphans: [], updatedAt: now() };
        const flat = flattenDoc(doc, assignOrders(doc, {}), assignVideoOrders(doc, {}));
        c.scripts.set(id, { id, name, videos: flat.videos, rows: flat.rows, updatedAt: now() });
        return { scriptId: id, reimported: false, orphanedCount: 0 };
      });
    },
    async hasScript(clientId, name) {
      const c = requireClient(clientId);
      return [...c.scripts.values()].some((s) => s.name === name);
    },
    deleteScript(clientId, scriptId) {
      return write(() => { requireAdmin(); backend.clients.get(clientId)?.scripts.delete(scriptId); });
    },
    saveScript(clientId, scriptId, before, after) {
      return write(() => applySave(clientId, scriptId, before, after));
    },
    addRecent(clientId, location) {
      return write(() => { const c = requireClient(clientId); c.recents = recordLocation(c.recents, location); });
    },
  };
  return repo;
}
