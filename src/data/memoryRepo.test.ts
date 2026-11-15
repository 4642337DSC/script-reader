import { describe, expect, test } from 'vitest';
import { createMemoryBackend, createMemoryRepo } from './memoryRepo';
import { toggleDone } from '../model/sections';
import type { Client, RepoError, ScriptData } from './types';

const admin = { email: 'boss@x.com', name: 'Boss' };
const anna = { email: 'anna@x.com', name: 'Anna' };
const bob = { email: 'bob@x.com', name: 'Bob' };
const noErr = () => {};

async function world() {
  const backend = createMemoryBackend();
  const a = createMemoryRepo({ backend, user: admin, adminEmail: 'Boss@X.com' });
  const c1 = await a.createClient('Acme');
  const c2 = await a.createClient('Beta');
  await a.setMembers(c1, ['Anna@X.com']);
  await a.setMembers(c2, ['bob@x.com']);
  return { backend, a, c1, c2, anna: createMemoryRepo({ backend, user: anna, adminEmail: 'boss@x.com' }), bob: createMemoryRepo({ backend, user: bob, adminEmail: 'boss@x.com' }) };
}
const names = (repo: ReturnType<typeof createMemoryRepo>) => {
  let out: Client[] = [];
  repo.watchClients((c) => { out = c; }, noErr)();
  return out.map((c) => c.name);
};

describe('MemoryRepo', () => {
  test('member sees only own clients; admin sees all', async () => {
    const w = await world();
    expect(names(w.anna)).toEqual(['Acme']);
    expect(names(w.bob)).toEqual(['Beta']);
    expect(names(w.a).sort()).toEqual(['Acme', 'Beta']);
    expect(await w.a.isAdmin()).toBe(true);
    expect(await w.anna.isAdmin()).toBe(false);
  });

  test('non-admin cannot create clients or edit members', async () => {
    const w = await world();
    await expect(w.anna.createClient('X')).rejects.toThrow();
    await expect(w.anna.setMembers(w.c1, ['a@b.c'])).rejects.toThrow();
  });

  test('a tick saved by one member reaches another watcher', async () => {
    const w = await world();
    await w.a.setMembers(w.c1, ['anna@x.com', 'bob@x.com']);
    const bob2 = createMemoryRepo({ backend: w.backend, user: bob, adminEmail: 'boss@x.com' });
    const { scriptId } = await w.anna.addScript(w.c1, 's.docx', [{ title: 'T', paragraphs: ['one', 'two'] }]);
    let seen: ScriptData | null = null;
    let mine: ScriptData | null = null;
    w.anna.watchScript(w.c1, scriptId, (d) => { mine = d; }, noErr);
    bob2.watchScript(w.c1, scriptId, (d) => { seen = d; }, noErr);
    const before = mine!;
    const v = toggleDone(before.doc.videos[0], before.doc.videos[0].sections[0].id, 9);
    await w.anna.saveScript(w.c1, scriptId, before, { ...before.doc, videos: [v] });
    expect(seen!.doc.videos[0].sections.map((s) => s.done)).toEqual([true, false]);
  });

  test('adding a same-named file keeps done on unchanged text', async () => {
    const w = await world();
    const { scriptId } = await w.anna.addScript(w.c1, 's.docx', [{ title: 'T', paragraphs: ['one', 'two'] }]);
    let cur: ScriptData | null = null;
    w.anna.watchScript(w.c1, scriptId, (d) => { cur = d; }, noErr);
    const v = toggleDone(cur!.doc.videos[0], cur!.doc.videos[0].sections[0].id, 9);
    await w.anna.saveScript(w.c1, scriptId, cur!, { ...cur!.doc, videos: [v] });
    const r = await w.anna.addScript(w.c1, 's.docx', [{ title: 'T', paragraphs: ['one', 'two changed'] }]);
    expect(r).toEqual({ scriptId, reimported: true });
    expect(cur!.doc.videos[0].sections.map((s) => [s.text, s.done])).toEqual([['one', true], ['two changed', false]]);
  });

  test('removed access triggers onError and later saves report dropped edits', async () => {
    const w = await world();
    const { scriptId } = await w.anna.addScript(w.c1, 's.docx', [{ title: 'T', paragraphs: ['one'] }]);
    let cur: ScriptData | null = null;
    let err: RepoError | null = null;
    w.anna.watchScript(w.c1, scriptId, (d) => { cur = d; }, (e) => { err = e; });
    const keep = cur!;
    await w.a.setMembers(w.c1, []);
    expect(err!.code).toBe('permission-denied');
    const v = toggleDone(keep.doc.videos[0], keep.doc.videos[0].sections[0].id, 9);
    const res = await w.anna.saveScript(w.c1, scriptId, keep, { ...keep.doc, videos: [v] });
    expect(res.droppedOnReject).toBe(1);
  });

  test('deleteScript makes watchers emit null; only admin may delete', async () => {
    const w = await world();
    const { scriptId } = await w.anna.addScript(w.c1, 's.docx', [{ title: 'T', paragraphs: ['one'] }]);
    let cur: ScriptData | null | undefined;
    w.anna.watchScript(w.c1, scriptId, (d) => { cur = d; }, noErr);
    await expect(w.anna.deleteScript(w.c1, scriptId)).rejects.toThrow();
    await w.a.deleteScript(w.c1, scriptId);
    expect(cur).toBeNull();
  });

  test('offline writes are queued, report pending, and apply on reconnect', async () => {
    const w = await world();
    const { scriptId } = await w.anna.addScript(w.c1, 's.docx', [{ title: 'T', paragraphs: ['one'] }]);
    let cur: ScriptData | null = null;
    w.a.watchScript(w.c1, scriptId, (d) => { cur = d; }, noErr);
    let st = { online: true, pending: false };
    w.anna.watchSyncState((s) => { st = s; });
    const before = cur!;
    w.anna.setOnline(false);
    const v = toggleDone(before.doc.videos[0], before.doc.videos[0].sections[0].id, 9);
    void w.anna.saveScript(w.c1, scriptId, before, { ...before.doc, videos: [v] });
    expect(st).toEqual({ online: false, pending: true });
    expect(cur!.doc.videos[0].sections[0].done).toBe(false);
    w.anna.setOnline(true);
    await Promise.resolve();
    expect(st).toEqual({ online: true, pending: false });
    expect(cur!.doc.videos[0].sections[0].done).toBe(true);
  });
});
