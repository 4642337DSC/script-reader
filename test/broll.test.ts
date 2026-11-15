import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { createFirestoreRepo } from '../src/data/firestoreRepo';
import { addBroll, removeBroll, setBrollText, toggleBroll } from '../src/model/sections';
import type { Repo, RepoError, ScriptData, Unsub } from '../src/data/types';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-script-reader-broll',
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
    await setDoc(doc(db, 'clients/c2'), { name: 'Beta', members: ['bob@x.com'] });
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
      (v) => { if (!done && pred(v)) { done = true; clearTimeout(t); queueMicrotask(() => unsub?.()); resolve(v); } },
      (e) => { if (!done) { done = true; clearTimeout(t); reject(new Error(e.code)); } },
    );
  });
}
const script = (r: Repo, id: string, pred: (d: ScriptData) => boolean = () => true) =>
  until<ScriptData | null>((cb, err) => r.watchScript('c1', id, cb, err), (d) => !!d && pred(d)) as Promise<ScriptData>;

const IMPORT = [{ title: 'T', group: null, notes: 'n', broll: ['one', 'two', 'three'], paragraphs: [{ source: 'p', text: 'p' }] }];

describe('B-roll documents', () => {
  test('rules: members can read and write them, non-members cannot', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'clients/c1/scripts/s1'), { name: 's', updatedAt: 1 });
      await setDoc(doc(ctx.firestore(), 'clients/c1/scripts/s1/broll/b1'), { videoId: 'v', text: 'x', order: 1000, done: false });
    });
    const anna = dbFor('anna@x.com');
    await assertSucceeds(getDoc(doc(anna, 'clients/c1/scripts/s1/broll/b1')));
    await assertSucceeds(setDoc(doc(anna, 'clients/c1/scripts/s1/broll/b1'), { videoId: 'v', text: 'y', order: 1000, done: true }));
    await assertFails(getDoc(doc(dbFor('eve@x.com'), 'clients/c1/scripts/s1/broll/b1')));
    await assertFails(getDocs(collection(anna, 'clients/c2/scripts/s1/broll')));
  });

  test('an imported shot list is stored and read back in order', async () => {
    const a = repoFor('anna@x.com');
    const { scriptId } = await a.addScript('c1', 's.docx', IMPORT);
    const d = await script(a, scriptId, (x) => (x.doc.videos[0]?.broll?.length ?? 0) === 3);
    expect(d.doc.videos[0].broll!.map((b) => [b.text, b.done])).toEqual([['one', false], ['two', false], ['three', false]]);
  });

  test('two members changing different shots from stale copies both keep their change', async () => {
    const a = repoFor('anna@x.com');
    const b = repoFor('bob@x.com');
    const { scriptId } = await a.addScript('c1', 's.docx', IMPORT);
    const sa = await script(a, scriptId, (x) => (x.doc.videos[0]?.broll?.length ?? 0) === 3);
    const sb = await script(b, scriptId, (x) => (x.doc.videos[0]?.broll?.length ?? 0) === 3);
    const [one, , three] = sa.doc.videos[0].broll!;
    await Promise.all([
      a.saveScript('c1', scriptId, sa, { ...sa.doc, videos: [toggleBroll(sa.doc.videos[0], one.id, Date.now())] }),
      b.saveScript('c1', scriptId, sb, { ...sb.doc, videos: [setBrollText(sb.doc.videos[0], three.id, 'three (bob)', Date.now())] }),
    ]);
    const d = await script(a, scriptId, (x) => !!x.doc.videos[0].broll![0].done && x.doc.videos[0].broll![2].text === 'three (bob)');
    expect(d.doc.videos[0].broll!.map((x) => [x.text, x.done])).toEqual([['one', true], ['two', false], ['three (bob)', false]]);
  });

  test('adding and removing shots syncs; deleting the script removes its shot documents', async () => {
    const a = repoFor('anna@x.com');
    const boss = repoFor('boss@x.com');
    const { scriptId } = await a.addScript('c1', 's.docx', IMPORT);
    const s = await script(a, scriptId, (x) => (x.doc.videos[0]?.broll?.length ?? 0) === 3);
    let v = addBroll(s.doc.videos[0], 'four', Date.now());
    v = removeBroll(v, v.broll![1].id);
    await a.saveScript('c1', scriptId, s, { ...s.doc, videos: [v] });
    const d = await script(a, scriptId, (x) => x.doc.videos[0].broll!.length === 3 && x.doc.videos[0].broll![2].text === 'four');
    expect(d.doc.videos[0].broll!.map((x) => x.text)).toEqual(['one', 'three', 'four']);
    await boss.deleteScript('c1', scriptId);
    const snap = await getDocs(collection(dbFor('boss@x.com'), 'clients/c1/scripts/' + scriptId + '/broll'));
    expect(snap.size).toBe(0);
  });

  test('a stale save after the script was deleted is dropped and leaves no shot documents behind', async () => {
    const a = repoFor('anna@x.com');
    const boss = repoFor('boss@x.com');
    const { scriptId } = await a.addScript('c1', 's.docx', IMPORT);
    const s = await script(a, scriptId, (x) => (x.doc.videos[0]?.broll?.length ?? 0) === 3);
    await boss.deleteScript('c1', scriptId);
    const res = await a.saveScript('c1', scriptId, s, { ...s.doc, videos: [toggleBroll(s.doc.videos[0], s.doc.videos[0].broll![0].id, Date.now())] });
    expect(res.droppedOnReject).toBeGreaterThan(0);
    const snap = await getDocs(collection(dbFor('boss@x.com'), 'clients/c1/scripts/' + scriptId + '/broll'));
    expect(snap.size).toBe(0);
  });
});
