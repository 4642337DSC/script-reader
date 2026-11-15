import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mergeDocs, runSync, syncAll, type DriveApi } from './sync';
import { openStore, type Store } from '../storage/db';
import { makeDocx } from '../testing/makeDocx';
import { TOKEN_KEY } from '../drive/auth';
import type { ScriptDoc, Section } from '../model/types';

beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); localStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

type Files = Record<string, { name: string; modifiedTime: string; bytes: ArrayBuffer }>;
function fakeDrive(files: Files, onDownload?: () => Promise<void>) {
  const state = { remote: null as ScriptDoc[] | null, lists: 0 };
  const api: DriveApi = {
    listScriptFiles: async () => { state.lists++; await Promise.resolve(); return Object.entries(files).map(([id, f]) => ({ id, name: f.name, modifiedTime: f.modifiedTime })); },
    downloadFile: async (_t, id) => { await onDownload?.(); return files[id].bytes; },
    readStateFile: async () => state.remote,
    writeStateFile: async (_t, docs) => { state.remote = docs; },
  };
  return { api, state };
}
const docx = (title: string, ...paras: string[]) =>
  makeDocx([{ text: title, style: 'Heading1' }, ...paras.map((text) => ({ text }))]);
const sec = (id: string, text: string, t: number, extra: Partial<Section> = {}): Section =>
  ({ id, text, location: null, done: false, updatedAt: t, ...extra });
const doc = (updatedAt: number, sections: Section[], orphans: Section[] = []): ScriptDoc =>
  ({ fileId: 'f', name: 'f.docx', updatedAt, orphans, videos: [{ id: 'v', title: 'T', sections }] });

describe('review fixes', () => {
  test('C2: split on one device vs tick on another loses neither text nor location', () => {
    const pc = doc(20, [sec('S', 'aa bb cc dd', 1), sec('T', 'other', 20, { done: true })]);
    const phone = doc(10, [sec('S', 'aa bb', 10), sec('S2', 'cc dd', 10, { location: 'Kitchen' }), sec('T', 'other', 1)]);
    const m = mergeDocs(pc, phone);
    expect(m.videos[0].sections.map((s) => s.text)).toEqual(['aa bb cc dd', 'other']);
    expect(m.videos[0].sections[1].done).toBe(true);
    expect(m.orphans.map((o) => [o.id, o.location])).toEqual([['S2', 'Kitchen']]);
  });

  test('C1: an edit made while files are downloading survives the sync', async () => {
    const files: Files = { a: { name: 'a.docx', modifiedTime: 't1', bytes: await docx('T', 'x', 'y') } };
    const store = await openStore();
    let hook: (() => Promise<void>) | undefined;
    const { api } = fakeDrive(files, async () => hook?.());
    await syncAll({ store, token: 't', now: () => 1, drive: api });
    files.a = { name: 'a.docx', modifiedTime: 't2', bytes: await docx('T', 'x', 'y2') };
    hook = async () => {
      const d = (await store.getScript('a'))!;
      d.videos[0].sections[0].done = true;
      d.videos[0].sections[0].updatedAt = 500;
      d.updatedAt = 500;
      await store.putScript(d);
    };
    await syncAll({ store, token: 't', now: () => 1000, drive: api });
    const s = (await store.getScript('a'))!.videos[0].sections;
    expect(s[0].done).toBe(true);
    expect(s[1].text).toBe('y2');
  });

  test('C3: a location set on another device after a docx edit is not lost on this device', async () => {
    const files: Files = { a: { name: 'a.docx', modifiedTime: 't1', bytes: await docx('T', 'x') } };
    const { api } = fakeDrive(files);
    const phone = await openStore();
    await syncAll({ store: phone, token: 't', now: () => 1, drive: api });
    (globalThis as any).indexedDB = new IDBFactory();
    const pc = await openStore();
    await syncAll({ store: pc, token: 't', now: () => 2, drive: api });
    files.a = { name: 'a.docx', modifiedTime: 't2', bytes: await docx('T', 'x', 'new') };
    await syncAll({ store: pc, token: 't', now: () => 300, drive: api });
    const d = (await pc.getScript('a'))!;
    d.videos[0].sections[1].location = 'Kitchen';
    d.videos[0].sections[1].updatedAt = 700;
    d.updatedAt = 700;
    await pc.putScript(d);
    await syncAll({ store: pc, token: 't', now: () => 710, drive: api });
    await syncAll({ store: phone, token: 't', now: () => 800, drive: api });
    const s = (await phone.getScript('a'))!.videos[0].sections;
    expect(s.map((x) => [x.text, x.location])).toEqual([['x', null], ['new', 'Kitchen']]);
  });

  test('I2: if saving fails, the re-import is retried on the next sync', async () => {
    const files: Files = { a: { name: 'a.docx', modifiedTime: 't1', bytes: await docx('T', 'x') } };
    const { api } = fakeDrive(files);
    const real = await openStore();
    await syncAll({ store: real, token: 't', now: () => 1, drive: api });
    let fail = true;
    const store: Store = { ...real, putScript: async (d) => { if (fail) { fail = false; throw new Error('disk'); } return real.putScript(d); } };
    files.a = { name: 'a.docx', modifiedTime: 't2', bytes: await docx('T', 'x', 'more') };
    await expect(syncAll({ store, token: 't', now: () => 5, drive: api })).rejects.toThrow('disk');
    const r = await syncAll({ store, token: 't', now: () => 6, drive: api });
    expect(r.updated).toBe(1);
    expect((await real.getScript('a'))!.videos[0].sections.map((s) => s.text)).toEqual(['x', 'more']);
  });

  test('I3: concurrent syncs share one run', async () => {
    const store = await openStore();
    const { api, state } = fakeDrive({ a: { name: 'a.docx', modifiedTime: 't', bytes: await docx('T', 'x') } });
    await Promise.all([
      syncAll({ store, token: 't', now: () => 1, drive: api }),
      syncAll({ store, token: 't', now: () => 1, drive: api }),
    ]);
    expect(state.lists).toBe(1);
  });

  test('I6: a rejected token (401) is cleared and the status says to sign in again', async () => {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: 'bad', exp: Date.now() + 3_600_000 }));
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    const status = await runSync(await openStore(), false);
    expect(status).toMatch(/sign/i);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
