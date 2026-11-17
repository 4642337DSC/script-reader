import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { createFirestoreRepo } from '../src/data/firestoreRepo';
import { toggleDone, setVideoTitle, cycleTag, splitSection } from '../src/model/sections';
import type { Video } from '../src/model/types';
import type { ScriptData } from '../src/data/types';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-script-reader', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'clients/c1'), { name: 'Acme', members: ['anna@x.com'] });
  });
});

// Regression: Undo was always greyed out because the first snapshot after a save was a half-updated script, which the
// reader treats as someone else's edit (and drops its undo history). Same fingerprint as ReaderScreen.
const fingerprint = (v: Video) =>
  JSON.stringify([v.title, v.notes ?? '', v.sections.map((s) => [s.id, s.text, s.location, s.done, s.tag ?? null]), (v.broll ?? []).map((b) => [b.id, b.text, b.done])]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('echo of our own save must match what the reader committed', () => {
  const cases: [string, (v: Video) => Video][] = [
    ['tick', (v) => toggleDone(v, v.sections[0].id, 5)],
    ['title', (v) => setVideoTitle(v, 'New title')],
    ['tag', (v) => cycleTag(v, v.sections[0].id, 5)],
    ['split', (v) => splitSection(v, v.sections[0].id, 5, 5)],
  ];
  for (const [name, edit] of cases) {
    test(name, async () => {
      const repo = createFirestoreRepo(env.authenticatedContext('u', { email: 'anna@x.com', email_verified: true }).firestore(), { email: 'anna@x.com', name: 'A' });
      const { scriptId } = await repo.addScript('c1', 'S.docx', [{ title: 'Vid', paragraphs: ['first para here', 'second para'] }]);
      const seen: ScriptData[] = [];
      const un = repo.watchScript('c1', scriptId, (d) => { if (d) seen.push(d); }, () => {});
      while (!seen.length) await sleep(20);
      await sleep(1500);
      const base = seen.at(-1)!;
      const next = edit(base.doc.videos[0]);
      const committed = fingerprint(next);
      seen.length = 0;
      await repo.saveScript('c1', scriptId, base, { ...base.doc, videos: [next] });
      await sleep(800);
      un();
      const echoes = seen.map((d) => fingerprint(d.doc.videos[0]));
      expect(echoes.length).toBeGreaterThan(0);
      expect(echoes.filter((e) => e !== committed)).toEqual([]);
    });
  }
});
