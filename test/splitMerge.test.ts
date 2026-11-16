import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { createFirestoreRepo } from '../src/data/firestoreRepo';
import { mergeVideoIntoPrevious, splitVideoInDoc } from '../src/model/videos';
import type { Repo, RepoError, ScriptData, Unsub } from '../src/data/types';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-script-reader-splitmerge',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'config/admin'), { email: 'boss@x.com' });
    await setDoc(doc(db, 'clients/c1'), { name: 'Acme', members: ['anna@x.com'] });
  });
});

const repo = (): Repo => createFirestoreRepo(env.authenticatedContext('u', { email: 'anna@x.com', email_verified: true }).firestore(), { email: 'anna@x.com', name: 'a' });
function until<T>(watch: (cb: (v: T) => void, err: (e: RepoError) => void) => Unsub, pred: (v: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    let unsub: Unsub | undefined; let done = false;
    const t = setTimeout(() => { done = true; unsub?.(); reject(new Error('timeout')); }, 10000);
    unsub = watch((v) => { if (!done && pred(v)) { done = true; clearTimeout(t); queueMicrotask(() => unsub?.()); resolve(v); } }, (e) => { if (!done) { done = true; clearTimeout(t); reject(new Error(e.code)); } });
  });
}

describe('split and merge videos in Firestore', () => {
  test('split then merge round-trips through the real database', async () => {
    const r = repo();
    const { scriptId: id } = await r.addScript('c1', 'S', [
      { title: 'A', group: null, notes: 'n', broll: ['shot'], paragraphs: ['1', '2', '3'].map((t) => ({ source: t, text: t })) },
      { title: 'B', group: null, notes: '', paragraphs: [{ source: '4', text: '4' }] },
    ]);
    const get = (pred: (d: ScriptData) => boolean) => until<ScriptData | null>((cb, err) => r.watchScript('c1', id, cb, err), (d) => !!d && pred(d)) as Promise<ScriptData>;
    const d0 = await get(() => true);
    const sp = splitVideoInDoc(d0.doc, d0.doc.videos[0].id, 1)!;
    await r.saveScript('c1', id, d0, sp.doc);
    const d1 = await get((d) => d.doc.videos.length === 3);
    expect(d1.doc.videos.map((v) => v.sections.map((s) => s.text).join(''))).toEqual(['1', '23', '4']);
    expect(d1.doc.videos[0].broll?.length).toBe(1);
    const mg = mergeVideoIntoPrevious(d1.doc, d1.doc.videos[2].id)!;
    await r.saveScript('c1', id, d1, mg.doc);
    const d2 = await get((d) => d.doc.videos.length === 2);
    expect(d2.doc.videos.map((v) => v.sections.map((s) => s.text).join(''))).toEqual(['1', '234']);
    expect(d2.doc.orphans.length).toBe(0);
  });
});
