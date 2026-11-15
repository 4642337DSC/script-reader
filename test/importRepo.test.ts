import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { createFirestoreRepo } from '../src/data/firestoreRepo';
import type { ImportedVideo } from '../src/model/types';
import type { Repo, RepoError, ScriptData, Unsub } from '../src/data/types';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-script-reader-import',
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

const repoFor = (email: string): Repo =>
  createFirestoreRepo(env.authenticatedContext('u-' + email, { email, email_verified: true }).firestore(), { email, name: email });

function until<T>(watch: (cb: (v: T) => void, err: (e: RepoError) => void) => Unsub, pred: (v: T) => boolean): Promise<T> {
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

const smart = (notes: string, ...paras: string[]): ImportedVideo[] => [{
  title: 'Video', group: 'Print', notes,
  paragraphs: paras.map((p) => ({ source: '„' + p + '”', text: p, suggestedLocation: p === 'b' ? 'tipografie' : null })),
}];

describe('import through the real repo', () => {
  test('hasScript is true only for an existing name in that client', async () => {
    const a = repoFor('anna@x.com');
    expect(await a.hasScript('c1', 's.docx')).toBe(false);
    await a.addScript('c1', 's.docx', smart('', 'a'));
    expect(await a.hasScript('c1', 's.docx')).toBe(true);
    expect(await a.hasScript('c1', 'other.docx')).toBe(false);
  });

  test('an imported video keeps group, notes, original text and suggested locations', async () => {
    const a = repoFor('anna@x.com');
    const { scriptId } = await a.addScript('c1', 's.docx', smart('Cadre: x', 'a', 'b'));
    const d = await until<ScriptData | null>((cb, err) => a.watchScript('c1', scriptId, cb, err), (x) => !!x && x.doc.videos.length === 1 && x.doc.videos[0].sections.length === 2) as ScriptData;
    const v = d.doc.videos[0];
    expect(v).toMatchObject({ group: 'Print', notes: 'Cadre: x', originalTitle: 'Video', originalNotes: 'Cadre: x' });
    expect(v.sections.map((s) => [s.text, s.originalText, s.suggestedLocation])).toEqual([
      ['a', '„a”', undefined],
      ['b', '„b”', 'tipografie'],
    ]);
  });

  test('re-import reports how many sections moved to "no longer in script" and keeps an edit', async () => {
    const a = repoFor('anna@x.com');
    const { scriptId } = await a.addScript('c1', 's.docx', smart('', 'a', 'b'));
    const before = await until<ScriptData | null>((cb, err) => a.watchScript('c1', scriptId, cb, err), (x) => !!x && x.doc.videos[0]?.sections.length === 2) as ScriptData;
    const edited = { ...before.doc.videos[0], sections: before.doc.videos[0].sections.map((s, i) => (i === 0 ? { ...s, text: 'a (fixed)', updatedAt: Date.now() } : s)) };
    await a.saveScript('c1', scriptId, before, { ...before.doc, videos: [edited] });
    const r = await a.addScript('c1', 's.docx', smart('', 'a'));
    expect(r).toEqual({ scriptId, reimported: true, orphanedCount: 1 });
    const after = await until<ScriptData | null>((cb, err) => a.watchScript('c1', scriptId, cb, err), (x) => !!x && x.doc.orphans.length === 1) as ScriptData;
    expect(after.doc.videos[0].sections.map((s) => s.text)).toEqual(['a (fixed)']);
    expect(after.doc.orphans.map((s) => s.text)).toEqual(['b']);
  });
});
