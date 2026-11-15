import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { createFirestoreRepo } from '../src/data/firestoreRepo';
import { toggleDone, setLocation } from '../src/model/sections';
import type { Client, Repo, RepoError, ScriptData, Unsub } from '../src/data/types';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-script-reader',
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

describe('FirestoreRepo', () => {
  test('addScript then watchScript assembles videos and sections in order', async () => {
    const anna = repoFor('anna@x.com');
    const { scriptId, reimported } = await anna.addScript('c1', 's.docx', [
      { title: 'T1', paragraphs: ['a', 'b'] },
      { title: 'T2', paragraphs: ['c'] },
    ]);
    expect(reimported).toBe(false);
    const d = await script(anna, scriptId);
    expect(d.doc.videos.map((v) => [v.title, v.sections.map((s) => s.text)])).toEqual([
      ['T1', ['a', 'b']],
      ['T2', ['c']],
    ]);
  });

  test('two people editing different sections from stale copies both survive', async () => {
    const a = repoFor('anna@x.com');
    const b = repoFor('bob@x.com');
    const { scriptId } = await a.addScript('c1', 's.docx', [{ title: 'T', paragraphs: ['one', 'two', 'three'] }]);
    const staleA = await script(a, scriptId);
    const staleB = await script(b, scriptId);
    const v1 = toggleDone(staleA.doc.videos[0], staleA.doc.videos[0].sections[0].id, Date.now());
    const v2 = setLocation(staleB.doc.videos[0], staleB.doc.videos[0].sections[2].id, 'Kitchen', Date.now());
    await Promise.all([
      a.saveScript('c1', scriptId, staleA, { ...staleA.doc, videos: [v1] }),
      b.saveScript('c1', scriptId, staleB, { ...staleB.doc, videos: [v2] }),
    ]);
    const d = await script(
      a,
      scriptId,
      (x) => x.doc.videos[0].sections[0].done && x.doc.videos[0].sections[2].location === 'Kitchen',
    );
    expect(d.doc.videos[0].sections.map((s) => [s.done, s.location])).toEqual([
      [true, null],
      [false, null],
      [false, 'Kitchen'],
    ]);
  });

  test('re-import leaves a concurrent tick on an unchanged section intact', async () => {
    const a = repoFor('anna@x.com');
    const b = repoFor('bob@x.com');
    const { scriptId } = await a.addScript('c1', 's.docx', [{ title: 'T', paragraphs: ['one', 'two'] }]);
    const cur = await script(b, scriptId);
    const tick = toggleDone(cur.doc.videos[0], cur.doc.videos[0].sections[0].id, Date.now());
    await Promise.all([
      a.addScript('c1', 's.docx', [{ title: 'T', paragraphs: ['one', 'two changed'] }]),
      b.saveScript('c1', scriptId, cur, { ...cur.doc, videos: [tick] }),
    ]);
    const d = await script(
      a,
      scriptId,
      (x) => x.doc.videos[0].sections[0].done && x.doc.videos[0].sections[1].text === 'two changed',
    );
    expect(d.doc.videos[0].sections.map((s) => s.text)).toEqual(['one', 'two changed']);
    expect(d.doc.orphans.map((s) => s.text)).toEqual(['two']);
  });

  test('a 1201-section script saves through multiple batches', async () => {
    const a = repoFor('anna@x.com');
    const paragraphs = Array.from({ length: 1201 }, (_, i) => 'p' + i);
    const { scriptId } = await a.addScript('c1', 'big.docx', [{ title: 'Big', paragraphs }]);
    const d = await script(a, scriptId, (x) => x.doc.videos[0].sections.length === 1201);
    expect(d.doc.videos[0].sections[1200].text).toBe('p1200');
  });

  test('deleteScript removes its sections; members cannot delete', async () => {
    const a = repoFor('anna@x.com');
    const boss = repoFor('boss@x.com');
    const { scriptId } = await a.addScript('c1', 's.docx', [{ title: 'T', paragraphs: ['one', 'two'] }]);
    await expect(a.deleteScript('c1', scriptId)).rejects.toThrow();
    await boss.deleteScript('c1', scriptId);
    const snap = await getDocs(collection(dbFor('boss@x.com'), 'clients/c1/scripts/' + scriptId + '/sections'));
    expect(snap.size).toBe(0);
    await until<ScriptData | null>((cb, err) => boss.watchScript('c1', scriptId, cb, err), (d) => d === null);
  });

  test('setMembers lowercases and de-duplicates', async () => {
    const boss = repoFor('boss@x.com');
    await boss.setMembers('c1', ['Anna@X.com', 'ANNA@x.com', ' Bob@X.com ']);
    const list = await until<Client[]>(
      (cb, err) => boss.watchClients(cb, err),
      (c) => c.some((x) => x.id === 'c1' && x.members.length === 2),
    );
    expect(list.find((c) => c.id === 'c1')!.members).toEqual(['anna@x.com', 'bob@x.com']);
  });

  test('watchClients as a member returns only their clients; admin sees all', async () => {
    const anna = repoFor('anna@x.com');
    const boss = repoFor('boss@x.com');
    const mine = await until<Client[]>((cb, err) => anna.watchClients(cb, err), (c) => c.length > 0);
    expect(mine.map((c) => c.name)).toEqual(['Acme']);
    expect(await boss.isAdmin()).toBe(true);
    expect(await anna.isAdmin()).toBe(false);
    const all = await until<Client[]>((cb, err) => boss.watchClients(cb, err), (c) => c.length === 2);
    expect(all.map((c) => c.name).sort()).toEqual(['Acme', 'Beta']);
  });

  test('permission-denied surfaces as RepoError.code', async () => {
    const eve = repoFor('eve@x.com');
    await expect(until((cb, err) => eve.watchScripts('c1', cb, err), () => true)).rejects.toThrow('permission-denied');
  });
});
