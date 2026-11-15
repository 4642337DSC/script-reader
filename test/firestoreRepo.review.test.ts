import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, disableNetwork, doc, enableNetwork, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { createFirestoreRepo } from '../src/data/firestoreRepo';
import { toggleDone } from '../src/model/sections';
import type { Repo, RepoError, ScriptData, SyncState, Unsub } from '../src/data/types';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-script-reader-review',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'config/admin'), { email: 'boss@x.com' });
    await setDoc(doc(db, 'clients/c1'), { name: 'Acme', members: ['anna@x.com', 'bob@x.com'] });
  });
});

const dbFor = (email: string) => env.authenticatedContext('u-' + email, { email, email_verified: true }).firestore();
const repoFor = (email: string): Repo => createFirestoreRepo(dbFor(email), { email, name: email });

function until<T>(
  watch: (cb: (v: T) => void, err: (e: RepoError) => void) => Unsub,
  pred: (v: T) => boolean,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let unsub: Unsub | undefined;
    let done = false;
    const t = setTimeout(() => { done = true; unsub?.(); reject(new Error('timeout')); }, 10000);
    unsub = watch(
      (v) => {
        if (!done && pred(v)) {
          done = true;
          clearTimeout(t);
          queueMicrotask(() => unsub?.());
          resolve(v);
        }
      },
      (e) => { if (!done) { done = true; clearTimeout(t); reject(new Error(e.code)); } },
    );
  });
}
const script = (r: Repo, id: string, pred: (d: ScriptData) => boolean = () => true) =>
  until<ScriptData | null>((cb, err) => r.watchScript('c1', id, cb, err), (d) => !!d && pred(d)) as Promise<ScriptData>;

describe('review fixes (emulator)', () => {
  test('I1: a save made after the script was deleted is dropped and does not bring it back', async () => {
    const anna = repoFor('anna@x.com');
    const boss = repoFor('boss@x.com');
    const { scriptId } = await anna.addScript('c1', 's.docx', [{ title: 'T', paragraphs: ['one', 'two'] }]);
    const stale = await script(anna, scriptId);
    await boss.deleteScript('c1', scriptId);
    const tick = toggleDone(stale.doc.videos[0], stale.doc.videos[0].sections[0].id, Date.now());
    const res = await anna.saveScript('c1', scriptId, stale, { ...stale.doc, videos: [tick] });
    expect(res.droppedOnReject).toBeGreaterThan(0);
    const adminDb = dbFor('boss@x.com');
    expect((await getDoc(doc(adminDb, 'clients/c1/scripts/' + scriptId))).exists()).toBe(false);
    expect((await getDocs(collection(adminDb, 'clients/c1/scripts/' + scriptId + '/sections'))).size).toBe(0);
  });

  test('I2: re-importing a file where only a video title changed updates the title', async () => {
    const anna = repoFor('anna@x.com');
    const { scriptId } = await anna.addScript('c1', 's.docx', [{ title: 'Old title', paragraphs: ['a'] }]);
    await anna.addScript('c1', 's.docx', [{ title: 'New title', paragraphs: ['a'] }]);
    const d = await script(anna, scriptId, (x) => x.doc.videos[0].title === 'New title');
    expect(d.doc.videos[0].sections.map((s) => s.text)).toEqual(['a']);
  });

  test('I4: pending changes queued through another repo on the same database show as pending', async () => {
    const db = dbFor('anna@x.com');
    const a = createFirestoreRepo(db, { email: 'anna@x.com', name: 'a' });
    const b = createFirestoreRepo(db, { email: 'anna@x.com', name: 'b' });
    const { scriptId } = await a.addScript('c1', 's.docx', [{ title: 'T', paragraphs: ['one'] }]);
    const cur = await script(a, scriptId);
    const stop = b.watchScript('c1', scriptId, () => {}, () => {});
    await disableNetwork(db);
    const tick = toggleDone(cur.doc.videos[0], cur.doc.videos[0].sections[0].id, Date.now());
    void a.saveScript('c1', scriptId, cur, { ...cur.doc, videos: [tick] });
    await until<SyncState>((cb) => b.watchSyncState(cb), (s) => s.pending);
    await enableNetwork(db);
    await until<SyncState>((cb) => b.watchSyncState(cb), (s) => !s.pending);
    stop();
  });
});
