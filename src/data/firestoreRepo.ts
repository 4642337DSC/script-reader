import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
  type Firestore, type DocumentData, type WriteBatch,
} from 'firebase/firestore';
import { reimport } from '../model/reimport';
import { buildVideos } from '../model/sections';
import { recordLocation } from '../model/recentLocations';
import { assembleDoc, assignOrders, chunk, diffRows, flattenDoc } from './docOps';
import type { AuthUser, Client, ParsedVideo, Repo, RepoError, ScriptData, ScriptDoc, SectionRow, SyncState, Unsub } from './types';

const BATCH = 450;
const lower = (s: string) => s.trim().toLowerCase();

function toError(e: unknown): RepoError {
  const code = (e as { code?: string })?.code;
  const message = e instanceof Error ? e.message : String(e);
  if (code === 'permission-denied') return { code: 'permission-denied', message };
  if (code === 'not-found') return { code: 'not-found', message };
  return { code: 'other', message };
}

/** Rows created by a merge-write to a section that was deleted meanwhile have no text; ignore them. */
function toRow(id: string, d: DocumentData): SectionRow | null {
  if (typeof d.text !== 'string' || typeof d.order !== 'number') return null;
  return {
    id, videoId: d.videoId ?? null, order: d.order, text: d.text, location: d.location ?? null,
    done: !!d.done, updatedAt: d.updatedAt ?? 0, orphaned: !!d.orphaned,
  };
}
const withoutId = ({ id: _id, ...rest }: SectionRow) => rest;

export function createFirestoreRepo(db: Firestore, user: AuthUser): Repo {
  const email = lower(user.email);
  let adminP: Promise<boolean> | null = null;
  let pending = 0;
  const syncListeners = new Set<(s: SyncState) => void>();
  const isOnline = () => typeof navigator === 'undefined' || (navigator as Navigator).onLine !== false;
  // Writes queued earlier (before a reload, or by another tab) are only visible through snapshot metadata.
  const snapPending = new Map<string, boolean>();
  const anyPending = () => pending > 0 || [...snapPending.values()].some(Boolean);
  const emitSync = () => syncListeners.forEach((l) => l({ online: isOnline(), pending: anyPending() }));
  if (typeof addEventListener === 'function') {
    addEventListener('online', emitSync);
    addEventListener('offline', emitSync);
  }
  const track = async <T,>(p: Promise<T>): Promise<T> => {
    pending++;
    emitSync();
    try { return await p; } finally { pending--; emitSync(); }
  };

  const scriptsCol = (c: string) => collection(db, 'clients', c, 'scripts');
  const sectionsCol = (c: string, s: string) => collection(db, 'clients', c, 'scripts', s, 'sections');

  async function loadSections(c: string, s: string): Promise<SectionRow[]> {
    const snap = await getDocs(sectionsCol(c, s));
    return snap.docs.map((d) => toRow(d.id, d.data())).filter((r): r is SectionRow => !!r);
  }

  async function commitOps(c: string, s: string, ops: ((b: WriteBatch) => void)[]) {
    for (const group of chunk(ops, BATCH)) {
      const b = writeBatch(db);
      group.forEach((op) => op(b));
      await b.commit();
    }
  }

  async function save(c: string, s: string, before: ScriptData, after: ScriptDoc): Promise<{ droppedOnReject?: number }> {
    const orders = assignOrders(after, before.orders);
    const beforeRows = flattenDoc(before.doc, before.orders).rows;
    const flat = flattenDoc(after, orders);
    const d = diffRows(beforeRows, flat.rows);
    const total = d.sets.length + d.updates.length + d.deletes.length;
    const videosChanged = JSON.stringify(before.doc.videos.map((v) => [v.id, v.title])) !== JSON.stringify(flat.videos.map((v) => [v.id, v.title]));
    if (!total && !videosChanged) return {};
    const ops: ((b: WriteBatch) => void)[] = [
      ...d.sets.map((r) => (b: WriteBatch) => b.set(doc(sectionsCol(c, s), r.id), withoutId(r))),
      // merge-set, not update: if the section was deleted meanwhile this must not fail the whole batch
      ...d.updates.map((u) => (b: WriteBatch) => b.set(doc(sectionsCol(c, s), u.id), u.patch, { merge: true })),
      ...d.deletes.map((id) => (b: WriteBatch) => b.delete(doc(sectionsCol(c, s), id))),
    ];
    const scriptRef = doc(scriptsCol(c), s);
    // Every batch carries an update() of the script doc: update fails if the script was deleted meanwhile,
    // so a stale save can neither resurrect the script nor leave ghost sections behind it.
    const run = async () => {
      const groups = ops.length ? chunk(ops, BATCH - 1) : [[]];
      for (let i = 0; i < groups.length; i++) {
        const b = writeBatch(db);
        groups[i].forEach((op) => op(b));
        b.update(scriptRef, i === 0 && videosChanged ? { videos: flat.videos, updatedAt: Date.now() } : { updatedAt: Date.now() });
        await b.commit();
      }
    };
    try {
      await track(run());
      return {};
    } catch (e) {
      const code = toError(e).code;
      if (code === 'permission-denied' || code === 'not-found') return { droppedOnReject: total || 1 };
      throw e;
    }
  }

  const repo: Repo = {
    isAdmin() {
      adminP ??= getDoc(doc(db, 'config', 'admin')).then(() => true, () => false);
      return adminP;
    },

    watchClients(cb, onError) {
      let unsub: Unsub | null = null;
      let cancelled = false;
      void repo.isAdmin().then((admin) => {
        if (cancelled) return;
        const q = admin ? collection(db, 'clients') : query(collection(db, 'clients'), where('members', 'array-contains', email));
        unsub = onSnapshot(
          q,
          (snap) => cb(snap.docs.map((d): Client => ({ id: d.id, name: d.data().name ?? '', members: d.data().members ?? [] }))),
          (e) => onError(toError(e)),
        );
      });
      return () => { cancelled = true; unsub?.(); };
    },

    watchScripts(clientId, cb, onError) {
      return onSnapshot(
        scriptsCol(clientId),
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, name: d.data().name ?? '', videoCount: (d.data().videos ?? []).length, updatedAt: d.data().updatedAt ?? 0 }))),
        (e) => onError(toError(e)),
      );
    },

    watchScript(clientId, scriptId, cb, onError) {
      let meta: DocumentData | null | undefined;
      let rows: SectionRow[] | undefined;
      const emit = () => {
        if (meta === undefined || rows === undefined) return;
        cb(meta === null ? null : assembleDoc(scriptId, meta.name ?? '', meta.videos ?? [], rows));
      };
      const key = `${clientId}/${scriptId}/${Math.random()}`;
      let metaPending = false;
      let rowsPending = false;
      const markPending = () => { snapPending.set(key, metaPending || rowsPending); emitSync(); };
      // includeMetadataChanges so the pending flag clears when the server acknowledges a write;
      // data is only re-emitted to the UI when it actually changed.
      const u1 = onSnapshot(
        doc(scriptsCol(clientId), scriptId),
        { includeMetadataChanges: true },
        (s) => {
          const next = s.exists() ? s.data() : null;
          const changed = meta === undefined || JSON.stringify(next) !== JSON.stringify(meta);
          meta = next;
          metaPending = s.metadata.hasPendingWrites;
          markPending();
          if (changed) emit();
        },
        (e) => onError(toError(e)),
      );
      const u2 = onSnapshot(
        sectionsCol(clientId, scriptId),
        { includeMetadataChanges: true },
        (snap) => {
          const first = rows === undefined;
          rows = snap.docs.map((d) => toRow(d.id, d.data())).filter((r): r is SectionRow => !!r);
          rowsPending = snap.metadata.hasPendingWrites;
          markPending();
          if (first || snap.docChanges().length > 0) emit();
        },
        (e) => onError(toError(e)),
      );
      return () => { u1(); u2(); snapPending.delete(key); emitSync(); };
    },

    watchRecents(clientId, cb) {
      return onSnapshot(doc(db, 'clients', clientId, 'meta', 'recents'), (s) => cb(s.exists() ? (s.data().list ?? []) : []), () => {});
    },

    watchSyncState(cb) {
      syncListeners.add(cb);
      cb({ online: isOnline(), pending: anyPending() });
      return () => syncListeners.delete(cb);
    },

    async createClient(name) {
      const ref = await addDoc(collection(db, 'clients'), { name, members: [] });
      return ref.id;
    },
    async renameClient(id, name) { await updateDoc(doc(db, 'clients', id), { name }); },
    async deleteClient(id) {
      const scripts = await getDocs(scriptsCol(id));
      for (const s of scripts.docs) await repo.deleteScript(id, s.id);
      await deleteDoc(doc(db, 'clients', id, 'meta', 'recents'));
      await deleteDoc(doc(db, 'clients', id));
    },
    async setMembers(id, emails) {
      await updateDoc(doc(db, 'clients', id), { members: [...new Set(emails.map(lower).filter(Boolean))] });
    },

    async addScript(clientId, name, parsed: ParsedVideo[]) {
      const found = await getDocs(query(scriptsCol(clientId), where('name', '==', name)));
      if (!found.empty) {
        const s = found.docs[0];
        const rows = await loadSections(clientId, s.id);
        const before = assembleDoc(s.id, name, s.data().videos ?? [], rows);
        await save(clientId, s.id, before, reimport(before.doc, parsed, Date.now()));
        return { scriptId: s.id, reimported: true };
      }
      const ref = doc(scriptsCol(clientId));
      const docNew: ScriptDoc = { fileId: ref.id, name, videos: buildVideos(parsed, Date.now()), orphans: [], updatedAt: Date.now() };
      const flat = flattenDoc(docNew, assignOrders(docNew, {}));
      await track(commitOps(clientId, ref.id, [
        (b) => b.set(ref, { name, videos: flat.videos, updatedAt: Date.now() }),
        ...flat.rows.map((r) => (b: WriteBatch) => b.set(doc(sectionsCol(clientId, ref.id), r.id), withoutId(r))),
      ]));
      return { scriptId: ref.id, reimported: false };
    },

    async deleteScript(clientId, scriptId) {
      const snap = await getDocs(sectionsCol(clientId, scriptId));
      await commitOps(clientId, scriptId, snap.docs.map((d) => (b: WriteBatch) => b.delete(d.ref)));
      await deleteDoc(doc(scriptsCol(clientId), scriptId));
    },

    saveScript: (clientId, scriptId, before, after) => save(clientId, scriptId, before, after),

    async addRecent(clientId, location) {
      const ref = doc(db, 'clients', clientId, 'meta', 'recents');
      const cur = await getDoc(ref).catch(() => null);
      const list: string[] = cur?.exists() ? (cur.data().list ?? []) : [];
      await track(setDoc(ref, { list: recordLocation(list, location) }));
    },
  };
  return repo;
}
