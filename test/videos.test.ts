import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { createFirestoreRepo } from '../src/data/firestoreRepo';
import { setVideoTitle, setVideoNotes } from '../src/model/sections';
import type { Repo, RepoError, ScriptData, Unsub } from '../src/data/types';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-script-reader-videos',
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

describe('video documents', () => {
  test('members can read and write video docs under their client; others cannot', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'clients/c1/scripts/s1'), { name: 's', updatedAt: 1 });
      await setDoc(doc(ctx.firestore(), 'clients/c1/scripts/s1/videos/v1'), { title: 'T', order: 1000 });
    });
    const anna = dbFor('anna@x.com');
    await assertSucceeds(getDoc(doc(anna, 'clients/c1/scripts/s1/videos/v1')));
    await assertSucceeds(setDoc(doc(anna, 'clients/c1/scripts/s1/videos/v1'), { title: 'T2', order: 1000 }));
    const eve = dbFor('eve@x.com');
    await assertFails(getDoc(doc(eve, 'clients/c1/scripts/s1/videos/v1')));
    await assertFails(setDoc(doc(eve, 'clients/c1/scripts/s1/videos/v1'), { title: 'x', order: 1 }));
    await assertFails(getDocs(collection(anna, 'clients/c2/scripts/s1/videos')));
  });

  test('two members renaming different videos concurrently both survive', async () => {
    const a = repoFor('anna@x.com');
    const b = repoFor('bob@x.com');
    const { scriptId } = await a.addScript('c1', 's.docx', [{ title: 'First', paragraphs: ['x'] }, { title: 'Second', paragraphs: ['y'] }]);
    const staleA = await script(a, scriptId);
    const staleB = await script(b, scriptId);
    const va = setVideoTitle(staleA.doc.videos[0], 'First (anna)');
    const vb = setVideoNotes(staleB.doc.videos[1], 'bob notes');
    await Promise.all([
      a.saveScript('c1', scriptId, staleA, { ...staleA.doc, videos: [va, staleA.doc.videos[1]] }),
      b.saveScript('c1', scriptId, staleB, { ...staleB.doc, videos: [staleB.doc.videos[0], vb] }),
    ]);
    const d = await script(a, scriptId, (x) => x.doc.videos[0].title === 'First (anna)' && x.doc.videos[1].notes === 'bob notes');
    expect(d.doc.videos.map((v) => [v.title, v.notes])).toEqual([['First (anna)', ''], ['Second', 'bob notes']]);
    expect(d.doc.videos[0].originalTitle).toBe('First');
  });

  test('a script saved with the old videos array opens and is converted on its next save', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'clients/c1/scripts/old'), { name: 'old.docx', updatedAt: 1, videos: [{ id: 'v1', title: 'Old A' }, { id: 'v2', title: 'Old B' }] });
      await setDoc(doc(db, 'clients/c1/scripts/old/sections/s1'), { videoId: 'v1', order: 1000, text: 'one', location: null, done: false, updatedAt: 1, orphaned: false });
      await setDoc(doc(db, 'clients/c1/scripts/old/sections/s2'), { videoId: 'v2', order: 2000, text: 'two', location: null, done: false, updatedAt: 1, orphaned: false });
    });
    const anna = repoFor('anna@x.com');
    const before = await script(anna, 'old');
    expect(before.legacy).toBe(true);
    expect(before.doc.videos.map((v) => [v.title, v.sections.map((s) => s.text)])).toEqual([['Old A', ['one']], ['Old B', ['two']]]);
    const renamed = setVideoTitle(before.doc.videos[0], 'Old A (edited)');
    await anna.saveScript('c1', 'old', before, { ...before.doc, videos: [renamed, before.doc.videos[1]] });
    const after = await script(anna, 'old', (d) => !d.legacy && d.doc.videos[0].title === 'Old A (edited)');
    expect(after.doc.videos.map((v) => v.title)).toEqual(['Old A (edited)', 'Old B']);
    const raw = await getDoc(doc(dbFor('boss@x.com'), 'clients/c1/scripts/old'));
    expect(raw.data()!.videos).toBeUndefined();
    expect(raw.data()!.videoCount).toBe(2);
  });

  test('deleteScript removes video documents too', async () => {
    const a = repoFor('anna@x.com');
    const boss = repoFor('boss@x.com');
    const { scriptId } = await a.addScript('c1', 's.docx', [{ title: 'T', paragraphs: ['x'] }]);
    await boss.deleteScript('c1', scriptId);
    const snap = await getDocs(collection(dbFor('boss@x.com'), 'clients/c1/scripts/' + scriptId + '/videos'));
    expect(snap.size).toBe(0);
  });
});
