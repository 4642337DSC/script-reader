import {
  addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
  type Firestore, type DocumentData, type WriteBatch,
} from 'firebase/firestore';
import { buildVideosFromImport, normalizeImport } from '../import/importModel';
import { countNewOrphans, reimport } from '../model/reimport';
import { recordLocation } from '../model/recentLocations';
import { assembleDoc, assignBrollOrders, assignOrders, assignVideoOrders, chunk, diffBroll, diffRows, diffVideos, flattenDoc, legacyVideoRows } from './docOps';
import type {
  AuthUser, Client, ImportedVideo, ParsedVideo, Repo, RepoError, ScriptData, ScriptDoc, SectionRow, SyncState, Unsub, VideoRow, BrollRow,
} from './types';

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
    originalText: d.originalText ?? null, suggestedLocation: d.suggestedLocation ?? null, tag: d.tag ?? null,
  };
}
/** Same ghost rule for video documents. */
function toVideoRow(id: string, d: DocumentData): VideoRow | null {
  if (typeof d.title !== 'string' || typeof d.order !== 'number') return null;
  return {
    id, title: d.title, group: d.group ?? null, notes: d.notes ?? '',
    originalTitle: d.originalTitle ?? d.title, originalNotes: d.originalNotes ?? '', order: d.order,
  };
}
/** Same ghost rule for B-roll documents. */
function toBrollRow(id: string, d: DocumentData): BrollRow | null {
  if (typeof d.text !== 'string' || typeof d.order !== 'number' || typeof d.videoId !== 'string') return null;
  return { id, videoId: d.videoId, order: d.order, text: d.text, done: !!d.done, updatedAt: d.updatedAt ?? 0, originalText: d.originalText ?? null };
}
const withoutId = <T extends { id: string }>({ id: _id, ...rest }: T) => rest;

/** Videos live in their own documents; scripts saved before that carry a `videos` array on the script document. */
function assemble(scriptId: string, meta: DocumentData, rows: SectionRow[], videoRows: VideoRow[], brollRows: BrollRow[] = []): ScriptData {
  const legacyList: { id: string; title: string }[] = videoRows.length === 0 ? (meta.videos ?? []) : [];
  const legacy = legacyList.length > 0;
  const data = assembleDoc(scriptId, meta.name ?? '', legacy ? legacyVideoRows(legacyList) : videoRows, rows, brollRows);
  return legacy ? { ...data, legacy: true } : data;
}

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
  const videosCol = (c: string, s: string) => collection(db, 'clients', c, 'scripts', s, 'videos');
  const brollCol = (c: string, s: string) => collection(db, 'clients', c, 'scripts', s, 'broll');

  async function loadScript(c: string, s: string, meta: DocumentData): Promise<ScriptData> {
    const [sec, vid, br] = await Promise.all([getDocs(sectionsCol(c, s)), getDocs(videosCol(c, s)), getDocs(brollCol(c, s))]);
    return assemble(
      s, meta,
      sec.docs.map((d) => toRow(d.id, d.data())).filter((r): r is SectionRow => !!r),
      vid.docs.map((d) => toVideoRow(d.id, d.data())).filter((r): r is VideoRow => !!r),
      br.docs.map((d) => toBrollRow(d.id, d.data())).filter((r): r is BrollRow => !!r),
    );
  }

  async function commitOps(ops: ((b: WriteBatch) => void)[]) {
    for (const group of chunk(ops, BATCH)) {
      const b = writeBatch(db);
      group.forEach((op) => op(b));
      await b.commit();
    }
  }

  async function save(c: string, s: string, before: ScriptData, after: ScriptDoc): Promise<{ droppedOnReject?: number }> {
    const orders = assignOrders(after, before.orders);
    const videoOrders = assignVideoOrders(after, before.videoOrders);
    const beforeBroll = before.brollOrders ?? assignBrollOrders(before.doc, {});
    const brollOrders = assignBrollOrders(after, beforeBroll);
    const beforeFlat = flattenDoc(before.doc, before.orders, before.videoOrders, beforeBroll);
    const flat = flattenDoc(after, orders, videoOrders, brollOrders);
    const bd = diffBroll(beforeFlat.broll, flat.broll);
    const d = diffRows(beforeFlat.rows, flat.rows);
    let vd = diffVideos(beforeFlat.videos, flat.videos);
    // First save of a script that still has the old `videos` array: write every video document once.
    // But if someone else already converted it (video documents exist), only write this user's own edits,
    // otherwise a stale legacy copy would overwrite their titles, notes and ordering.
    let converting = false;
    if (before.legacy) {
      const cur = await getDocs(videosCol(c, s)).catch(() => null);
      if (cur && cur.empty) {
        converting = true;
        vd = { sets: flat.videos, updates: [], deletes: [] };
      }
    }
    const total = d.sets.length + d.updates.length + d.deletes.length + vd.sets.length + vd.updates.length + vd.deletes.length + bd.sets.length + bd.updates.length + bd.deletes.length;
    if (!total) return {};
    const secDoc = (id: string) => doc(sectionsCol(c, s), id);
    const vidDoc = (id: string) => doc(videosCol(c, s), id);
    const brDoc = (id: string) => doc(brollCol(c, s), id);
    const ops: ((b: WriteBatch) => void)[] = [
      ...d.sets.map((r) => (b: WriteBatch) => b.set(secDoc(r.id), withoutId(r))),
      // merge-set, not update: if the section was deleted meanwhile this must not fail the whole batch
      ...d.updates.map((u) => (b: WriteBatch) => b.set(secDoc(u.id), u.patch, { merge: true })),
      ...d.deletes.map((id) => (b: WriteBatch) => b.delete(secDoc(id))),
      ...vd.sets.map((v) => (b: WriteBatch) => b.set(vidDoc(v.id), withoutId(v), converting ? { merge: true } : {})),
      ...vd.updates.map((u) => (b: WriteBatch) => b.set(vidDoc(u.id), u.patch, { merge: true })),
      ...vd.deletes.map((id) => (b: WriteBatch) => b.delete(vidDoc(id))),
      ...bd.sets.map((r) => (b: WriteBatch) => b.set(brDoc(r.id), withoutId(r))),
      ...bd.updates.map((u) => (b: WriteBatch) => b.set(brDoc(u.id), u.patch, { merge: true })),
      ...bd.deletes.map((id) => (b: WriteBatch) => b.delete(brDoc(id))),
    ];
    const scriptRef = doc(scriptsCol(c), s);
    const scriptPatch = {
      updatedAt: Date.now(),
      videoCount: flat.videos.length,
      ...(before.legacy ? { videos: deleteField() } : {}),
    };
    // Every batch carries an update() of the script doc: update fails if the script was deleted meanwhile,
    // so a stale save can neither resurrect the script nor leave ghost documents behind it.
    const run = async () => {
      const groups = chunk(ops, BATCH - 1);
      for (let i = 0; i < groups.length; i++) {
        const b = writeBatch(db);
        groups[i].forEach((op) => op(b));
        b.update(scriptRef, scriptPatch);
        await b.commit();
      }
    };
    try {
      await track(run());
      return {};
    } catch (e) {
      const code = toError(e).code;
      if (code === 'permission-denied' || code === 'not-found') return { droppedOnReject: total };
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
        (snap) => cb(snap.docs.map((d) => ({
          id: d.id, name: d.data().name ?? '',
          videoCount: d.data().videoCount ?? (d.data().videos ?? []).length,
          updatedAt: d.data().updatedAt ?? 0,
        }))),
        (e) => onError(toError(e)),
      );
    },

    watchScript(clientId, scriptId, cb, onError) {
      let meta: DocumentData | null | undefined;
      let rows: SectionRow[] | undefined;
      let vrows: VideoRow[] | undefined;
      let brows: BrollRow[] | undefined;
      const emit = () => {
        if (meta === undefined || rows === undefined || vrows === undefined || brows === undefined) return;
        // The script, section and video listeners fire separately. A script that says it has videos
        // (videoCount) but shows none yet is a half-arrived update, not an empty script: wait for the rest.
        if (meta !== null && vrows.length === 0 && !(meta.videos?.length) && (meta.videoCount ?? 0) > 0) return;
        cb(meta === null ? null : assemble(scriptId, meta, rows, vrows, brows));
      };
      const key = `${clientId}/${scriptId}/${Math.random()}`;
      const flags = { meta: false, rows: false, videos: false, broll: false };
      const markPending = () => { snapPending.set(key, flags.meta || flags.rows || flags.videos || flags.broll); emitSync(); };
      // includeMetadataChanges so the pending flag clears when the server acknowledges a write;
      // data is only re-emitted to the UI when it actually changed.
      const u1 = onSnapshot(
        doc(scriptsCol(clientId), scriptId),
        { includeMetadataChanges: true },
        (s) => {
          const next = s.exists() ? s.data() : null;
          const changed = meta === undefined || JSON.stringify(next) !== JSON.stringify(meta);
          meta = next;
          flags.meta = s.metadata.hasPendingWrites;
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
          flags.rows = snap.metadata.hasPendingWrites;
          markPending();
          if (first || snap.docChanges().length > 0) emit();
        },
        (e) => onError(toError(e)),
      );
      const u3 = onSnapshot(
        videosCol(clientId, scriptId),
        { includeMetadataChanges: true },
        (snap) => {
          const first = vrows === undefined;
          vrows = snap.docs.map((d) => toVideoRow(d.id, d.data())).filter((r): r is VideoRow => !!r);
          flags.videos = snap.metadata.hasPendingWrites;
          markPending();
          if (first || snap.docChanges().length > 0) emit();
        },
        (e) => onError(toError(e)),
      );
      const u4 = onSnapshot(
        brollCol(clientId, scriptId),
        { includeMetadataChanges: true },
        (snap) => {
          const first = brows === undefined;
          brows = snap.docs.map((d) => toBrollRow(d.id, d.data())).filter((r): r is BrollRow => !!r);
          flags.broll = snap.metadata.hasPendingWrites;
          markPending();
          if (first || snap.docChanges().length > 0) emit();
        },
        (e) => onError(toError(e)),
      );
      return () => { u1(); u2(); u3(); u4(); snapPending.delete(key); emitSync(); };
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

    async hasScript(clientId, name) {
      const found = await getDocs(query(scriptsCol(clientId), where('name', '==', name)));
      return !found.empty;
    },

    async addScript(clientId, name, input: ImportedVideo[] | ParsedVideo[]) {
      const imported = normalizeImport(input);
      const found = await getDocs(query(scriptsCol(clientId), where('name', '==', name)));
      if (!found.empty) {
        const s = found.docs[0];
        const before = await loadScript(clientId, s.id, s.data());
        const next = reimport(before.doc, imported, Date.now());
        await save(clientId, s.id, before, next);
        return { scriptId: s.id, reimported: true, orphanedCount: countNewOrphans(before.doc, next) };
      }
      const ref = doc(scriptsCol(clientId));
      const docNew: ScriptDoc = { fileId: ref.id, name, videos: buildVideosFromImport(imported, Date.now()), orphans: [], updatedAt: Date.now() };
      const flat = flattenDoc(docNew, assignOrders(docNew, {}), assignVideoOrders(docNew, {}), assignBrollOrders(docNew, {}));
      await track(commitOps([
        (b) => b.set(ref, { name, updatedAt: Date.now(), videoCount: flat.videos.length }),
        ...flat.videos.map((v) => (b: WriteBatch) => b.set(doc(videosCol(clientId, ref.id), v.id), withoutId(v))),
        ...flat.rows.map((r) => (b: WriteBatch) => b.set(doc(sectionsCol(clientId, ref.id), r.id), withoutId(r))),
        ...flat.broll.map((r) => (b: WriteBatch) => b.set(doc(brollCol(clientId, ref.id), r.id), withoutId(r))),
      ]));
      return { scriptId: ref.id, reimported: false, orphanedCount: 0 };
    },

    async deleteScript(clientId, scriptId) {
      const [sec, vid, br] = await Promise.all([getDocs(sectionsCol(clientId, scriptId)), getDocs(videosCol(clientId, scriptId)), getDocs(brollCol(clientId, scriptId))]);
      await commitOps([...sec.docs, ...vid.docs, ...br.docs].map((d) => (b: WriteBatch) => b.delete(d.ref)));
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
