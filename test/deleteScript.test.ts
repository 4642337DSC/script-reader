import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { createFirestoreRepo } from '../src/data/firestoreRepo';
import type { Repo } from '../src/data/types';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-script-reader-delete',
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

const dbFor = (email: string) => env.authenticatedContext('u-' + email, { email, email_verified: true }).firestore();
const repoFor = (email: string): Repo => createFirestoreRepo(dbFor(email), { email, name: email });

describe('deleteScript', () => {
  test('the script itself disappears first, so it leaves everyone\'s list at once; the pieces are cleaned up after', async () => {
    const anna = repoFor('anna@x.com');
    const boss = repoFor('boss@x.com');
    const paragraphs = Array.from({ length: 1300 }, (_, i) => 'paragraph ' + i);
    const { scriptId } = await anna.addScript('c1', 'big.docx', [{ title: 'Big', paragraphs }]);
    const adminDb = dbFor('boss@x.com');
    const scriptRef = doc(adminDb, 'clients/c1/scripts/' + scriptId);
    expect((await getDoc(scriptRef)).exists()).toBe(true);

    let finished = false;
    const p = boss.deleteScript('c1', scriptId).then(() => { finished = true; });
    let sawGoneWhileRunning = false;
    for (let i = 0; i < 400 && !finished; i++) {
      if (!(await getDoc(scriptRef)).exists()) { sawGoneWhileRunning = !finished; break; }
      await new Promise((r) => setTimeout(r, 5));
    }
    await p;
    expect(sawGoneWhileRunning).toBe(true);
    expect((await getDocs(collection(adminDb, 'clients/c1/scripts/' + scriptId + '/sections'))).size).toBe(0);
  });

  test('deleting an already deleted script is harmless, so a second tap never errors', async () => {
    const anna = repoFor('anna@x.com');
    const boss = repoFor('boss@x.com');
    const { scriptId } = await anna.addScript('c1', 's.docx', [{ title: 'T', broll: ['a'], notes: 'n', group: null, paragraphs: [{ source: 'p', text: 'p' }] }]);
    await boss.deleteScript('c1', scriptId);
    await expect(boss.deleteScript('c1', scriptId)).resolves.toBeUndefined();
  });
});
