import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, test } from 'vitest';
import { syncAll, type DriveApi } from './sync';
import { openStore } from '../storage/db';
import { makeDocx } from '../testing/makeDocx';
import type { ScriptDoc } from '../model/types';

beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); });

type Files = Record<string, { name: string; modifiedTime: string; bytes: ArrayBuffer }>;

function fakeDrive(files: Files, remote: ScriptDoc[] | null = null) {
  const state = { remote, fail: false };
  const api: DriveApi = {
    listScriptFiles: async () => Object.entries(files).map(([id, f]) => ({ id, name: f.name, modifiedTime: f.modifiedTime })),
    downloadFile: async (_t, id) => files[id].bytes,
    readStateFile: async () => state.remote,
    writeStateFile: async (_t, docs) => {
      if (state.fail) throw new Error('network');
      state.remote = docs;
    },
  };
  return { api, state };
}
const docx = (title: string, ...paras: string[]) =>
  makeDocx([{ text: title, style: 'Heading1' }, ...paras.map((text) => ({ text }))]);

describe('syncAll', () => {
  test('null token is a no-op', async () => {
    const store = await openStore();
    const { api } = fakeDrive({ a: { name: 'a.docx', modifiedTime: 't1', bytes: await docx('T', 'x') } });
    const r = await syncAll({ store, token: null, now: () => 1, drive: api });
    expect(r).toMatchObject({ added: 0, updated: 0, pushed: false });
    expect(await store.getScripts()).toEqual([]);
  });

  test('new docx is added and pushed', async () => {
    const store = await openStore();
    const { api, state } = fakeDrive({ a: { name: 'a.docx', modifiedTime: 't1', bytes: await docx('T', 'x', 'y') } });
    const r = await syncAll({ store, token: 'tok', now: () => 1, drive: api });
    expect(r).toMatchObject({ added: 1, pushed: true });
    expect((await store.getScript('a'))!.videos[0].sections.map((s) => s.text)).toEqual(['x', 'y']);
    expect(state.remote![0].fileId).toBe('a');
  });

  test('modified docx is reimported and keeps state on unchanged text', async () => {
    const store = await openStore();
    const files: Files = { a: { name: 'a.docx', modifiedTime: 't1', bytes: await docx('T', 'x', 'y') } };
    const { api } = fakeDrive(files);
    await syncAll({ store, token: 't', now: () => 1, drive: api });
    const d = (await store.getScript('a'))!;
    d.videos[0].sections[0].done = true;
    d.videos[0].sections[0].updatedAt = 5;
    d.updatedAt = 5;
    await store.putScript(d);
    files.a = { name: 'a.docx', modifiedTime: 't2', bytes: await docx('T', 'x', 'y changed') };
    const r = await syncAll({ store, token: 't', now: () => 9, drive: api });
    expect(r.updated).toBe(1);
    const s = (await store.getScript('a'))!;
    expect(s.videos[0].sections[0]).toMatchObject({ text: 'x', done: true });
    expect(s.videos[0].sections[1].text).toBe('y changed');
    expect(s.orphans.map((o) => o.text)).toEqual(['y']);
  });

  test('corrupt docx lands in failed; others still sync', async () => {
    const store = await openStore();
    const { api } = fakeDrive({
      bad: { name: 'bad.docx', modifiedTime: 't', bytes: new Uint8Array([1, 2]).buffer },
      ok: { name: 'ok.docx', modifiedTime: 't', bytes: await docx('T', 'x') },
    });
    const r = await syncAll({ store, token: 't', now: () => 1, drive: api });
    expect(r.failed.map((f) => f.name)).toEqual(['bad.docx']);
    expect(r.added).toBe(1);
    expect((await store.getScripts()).map((s) => s.fileId)).toEqual(['ok']);
  });

  test('newer remote done flag beats older local, and newer local beats older remote', async () => {
    const store = await openStore();
    const { api, state } = fakeDrive({ a: { name: 'a.docx', modifiedTime: 't', bytes: await docx('T', 'x', 'y') } });
    await syncAll({ store, token: 't', now: () => 1, drive: api });
    const local = (await store.getScript('a'))!;
    const remote: ScriptDoc = JSON.parse(JSON.stringify(local));
    remote.updatedAt = 50;
    remote.videos[0].sections[0].done = true;
    remote.videos[0].sections[0].updatedAt = 50;
    local.videos[0].sections[1].done = true;
    local.videos[0].sections[1].updatedAt = 60;
    local.updatedAt = 60;
    await store.putScript(local);
    state.remote = [remote];
    await syncAll({ store, token: 't', now: () => 100, drive: api });
    expect((await store.getScript('a'))!.videos[0].sections.map((s) => s.done)).toEqual([true, true]);
    expect(state.remote![0].videos[0].sections.map((s) => s.done)).toEqual([true, true]);
  });

  test('second device bootstraps from remote state instead of starting fresh', async () => {
    const bytes = await docx('T', 'x', 'y');
    const { api, state } = fakeDrive({ a: { name: 'a.docx', modifiedTime: 't', bytes } });
    await syncAll({ store: await openStore(), token: 't', now: () => 1, drive: api });
    state.remote![0].videos[0].sections[0].location = 'Kitchen';
    state.remote![0].videos[0].sections[0].updatedAt = 7;
    (globalThis as any).indexedDB = new IDBFactory();
    const second = await openStore();
    await syncAll({ store: second, token: 't', now: () => 9, drive: api });
    expect((await second.getScript('a'))!.videos[0].sections[0].location).toBe('Kitchen');
  });

  test('push failure keeps local edits and a retry succeeds', async () => {
    const store = await openStore();
    const { api, state } = fakeDrive({ a: { name: 'a.docx', modifiedTime: 't', bytes: await docx('T', 'x') } });
    state.fail = true;
    await expect(syncAll({ store, token: 't', now: () => 1, drive: api })).rejects.toThrow('network');
    const d = (await store.getScript('a'))!;
    d.videos[0].sections[0].done = true;
    d.videos[0].sections[0].updatedAt = 5;
    d.updatedAt = 5;
    await store.putScript(d);
    state.fail = false;
    const r = await syncAll({ store, token: 't', now: () => 9, drive: api });
    expect(r.pushed).toBe(true);
    expect(state.remote![0].videos[0].sections[0].done).toBe(true);
  });
});
