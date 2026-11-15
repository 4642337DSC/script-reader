import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { createFirestoreRepo } from '../src/data/firestoreRepo';
import { setVideoNotes, setVideoTitle, toggleDone } from '../src/model/sections';
import type { Repo, RepoError, ScriptData, Unsub } from '../src/data/types';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-script-reader-legacy',
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

function until<T>(watch: (cb: (v: T) => void, err: (e: RepoError) => void) => Unsub, pred: (v: T) => boolean, ms = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    let unsub: Unsub | undefined;
    let done = false;
    const t = setTimeout(() => { done = true; unsub?.(); reject(new Error('timeout')); }, ms);
    unsub = watch(
      (v) => { if (!done && pred(v)) { done = true; clearTimeout(t); queueMicrotask(() => unsub?.()); resolve(v); } },
      (e) => { if (!done) { done = true; clearTimeout(t); reject(new Error(e.code)); } },
    );
  });
}
const script = (r: Repo, id: string, pred: (d: ScriptData) => boolean = () => true) =>
  until<ScriptData | null>((cb, err) => r.watchScript('c1', id, cb, err), (d) => !!d && pred(d)) as Promise<ScriptData>;

async function seedLegacy() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'clients/c1/scripts/old'), { name: 'old.docx', updatedAt: 1, videos: [{ id: 'v1', title: 'Old A' }, { id: 'v2', title: 'Old B' }] });
    await setDoc(doc(db, 'clients/c1/scripts/old/sections/s1'), { videoId: 'v1', order: 1000, text: 'one', location: null, done: false, updatedAt: 1, orphaned: false });
    await setDoc(doc(db, 'clients/c1/scripts/old/sections/s2'), { videoId: 'v2', order: 2000, text: 'two', location: null, done: false, updatedAt: 1, orphaned: false });
  });
}

describe('legacy scripts under concurrent use', () => {
  test('I1: a stale save from a copy that still has the old videos array does not overwrite what another member converted', async () => {
    await seedLegacy();
    const anna = repoFor('anna@x.com');
    const bob = repoFor('bob@x.com');
    const annaCopy = await script(anna, 'old');
    const bobCopy = await script(bob, 'old');
    expect(annaCopy.legacy && bobCopy.legacy).toBe(true);
    const edited = setVideoNotes(setVideoTitle(annaCopy.doc.videos[0], 'Old A (anna)'), 'anna notes');
    await anna.saveScript('c1', 'old', annaCopy, { ...annaCopy.doc, videos: [edited, annaCopy.doc.videos[1]] });
    const ticked = toggleDone(bobCopy.doc.videos[1], bobCopy.doc.videos[1].sections[0].id, Date.now());
    await bob.saveScript('c1', 'old', bobCopy, { ...bobCopy.doc, videos: [bobCopy.doc.videos[0], ticked] });
    const snap = await getDocs(collection(dbFor('boss@x.com'), 'clients/c1/scripts/old/videos'));
    const stored = snap.docs.map((d) => d.data()).sort((a, b) => a.order - b.order).map((v) => [v.title, v.notes]);
    expect(stored).toEqual([['Old A (anna)', 'anna notes'], ['Old B', '']]);
    const d = await script(anna, 'old', (x) => !x.legacy && x.doc.videos[1].sections[0].done);
    expect(d.doc.videos[1].sections[0].done).toBe(true);
  });

  test('I5: a script whose videos have not arrived yet is not shown as having no videos', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'clients/c1/scripts/s9'), { name: 'new.docx', updatedAt: 1, videoCount: 2 });
      await setDoc(doc(db, 'clients/c1/scripts/s9/sections/a'), { videoId: 'v1', order: 1000, text: 'x', location: null, done: false, updatedAt: 1, orphaned: false });
    });
    const anna = repoFor('anna@x.com');
    const seen: number[] = [];
    const stop = anna.watchScript('c1', 's9', (d) => { if (d) seen.push(d.doc.videos.length); }, () => {});
    await new Promise((r) => setTimeout(r, 1200));
    expect(seen).toEqual([]);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'clients/c1/scripts/s9/videos/v1'), { title: 'V1', order: 1000 });
      await setDoc(doc(db, 'clients/c1/scripts/s9/videos/v2'), { title: 'V2', order: 2000 });
    });
    await until<number>((cb) => { const poll = setInterval(() => { if (seen.length) { cb(seen[seen.length - 1]); } }, 50); return () => clearInterval(poll); }, (n) => n === 2, 5000);
    stop();
  });
});
