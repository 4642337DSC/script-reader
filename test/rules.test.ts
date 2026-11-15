import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

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
    await setDoc(doc(db, 'clients/c1'), { name: 'Acme', members: ['anna@x.com'] });
    await setDoc(doc(db, 'clients/c2'), { name: 'Beta', members: ['bob@x.com'] });
    await setDoc(doc(db, 'clients/c1/scripts/s1'), { name: 's.docx', videos: [], updatedAt: 1 });
    await setDoc(doc(db, 'clients/c1/scripts/s1/sections/a'), { text: 'hi', done: false });
    await setDoc(doc(db, 'clients/c1/meta/recents'), { list: ['Kitchen'] });
  });
});

const as = (email: string, verified = true) => env.authenticatedContext(`u-${email}`, { email, email_verified: verified }).firestore();
const admin = () => as('Boss@X.com');
const anna = () => as('Anna@X.com');

describe('security rules', () => {
  test('non-member cannot read a client\'s sections', async () => {
    await assertFails(getDoc(doc(as('bob@x.com'), 'clients/c1/scripts/s1/sections/a')));
  });
  test('member can read and write sections and meta', async () => {
    const db = anna();
    await assertSucceeds(getDoc(doc(db, 'clients/c1/scripts/s1/sections/a')));
    await assertSucceeds(updateDoc(doc(db, 'clients/c1/scripts/s1/sections/a'), { done: true }));
    await assertSucceeds(setDoc(doc(db, 'clients/c1/meta/recents'), { list: ['Office'] }));
    await assertSucceeds(deleteDoc(doc(db, 'clients/c1/scripts/s1/sections/a')));
  });
  test('member cannot create, rename or delete clients or edit members', async () => {
    const db = anna();
    await assertFails(setDoc(doc(db, 'clients/new'), { name: 'X', members: [] }));
    await assertFails(updateDoc(doc(db, 'clients/c1'), { name: 'Renamed' }));
    await assertFails(updateDoc(doc(db, 'clients/c1'), { members: ['anna@x.com', 'eve@x.com'] }));
    await assertFails(deleteDoc(doc(db, 'clients/c1')));
  });
  test('member cannot delete a script, admin can', async () => {
    await assertFails(deleteDoc(doc(anna(), 'clients/c1/scripts/s1')));
    await assertSucceeds(deleteDoc(doc(admin(), 'clients/c1/scripts/s1')));
  });
  test('admin reads and writes any client without being a member', async () => {
    const db = admin();
    await assertSucceeds(getDoc(doc(db, 'clients/c2')));
    await assertSucceeds(setDoc(doc(db, 'clients/c2/scripts/s9'), { name: 'n', videos: [], updatedAt: 1 }));
    await assertSucceeds(setDoc(doc(db, 'clients/new'), { name: 'New', members: ['x@y.z'] }));
    await assertSucceeds(updateDoc(doc(db, 'clients/c2'), { members: [] }));
  });
  test('unverified email is denied everywhere', async () => {
    const db = as('anna@x.com', false);
    await assertFails(getDoc(doc(db, 'clients/c1')));
    await assertFails(getDoc(doc(db, 'clients/c1/scripts/s1/sections/a')));
    await assertFails(getDoc(doc(as('boss@x.com', false), 'config/admin')));
  });
  test('token email Anna@X.com matches member anna@x.com', async () => {
    await assertSucceeds(getDoc(doc(anna(), 'clients/c1')));
  });
  test('only admin can read config/admin and nobody can write it', async () => {
    await assertFails(getDoc(doc(anna(), 'config/admin')));
    await assertSucceeds(getDoc(doc(admin(), 'config/admin')));
    await assertFails(setDoc(doc(admin(), 'config/admin'), { email: 'eve@x.com' }));
    await assertFails(setDoc(doc(anna(), 'config/admin'), { email: 'anna@x.com' }));
  });
  test('member list query with array-contains own email succeeds, unfiltered list fails', async () => {
    const db = anna();
    await assertSucceeds(getDocs(query(collection(db, 'clients'), where('members', 'array-contains', 'anna@x.com'))));
    await assertFails(getDocs(collection(db, 'clients')));
  });
  test('admin can list all clients', async () => {
    await assertSucceeds(getDocs(collection(admin(), 'clients')));
  });
  test('signed-out is denied', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'clients/c1')));
    await assertFails(getDoc(doc(db, 'config/admin')));
  });
});
