import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, test } from 'vitest';
import { openStore } from './db';
import type { ScriptDoc } from '../model/types';

const doc = (id: string): ScriptDoc => ({ fileId: id, name: `${id}.docx`, videos: [], orphans: [], updatedAt: 1 });

describe('store', () => {
  beforeEach(async () => { (globalThis as any).indexedDB = new IDBFactory(); });

  test('put/get roundtrip and list', async () => {
    const s = await openStore();
    await s.putScript(doc('a')); await s.putScript(doc('b'));
    expect((await s.getScript('a'))?.name).toBe('a.docx');
    expect((await s.getScripts()).map((d) => d.fileId).sort()).toEqual(['a', 'b']);
    expect(await s.getScript('zzz')).toBeUndefined();
  });
  test('recents and meta roundtrip', async () => {
    const s = await openStore();
    await s.putRecents(['Kitchen']);
    await s.putMeta('fontScale', 1.5);
    expect(await s.getRecents()).toEqual(['Kitchen']);
    expect(await s.getMeta<number>('fontScale')).toBe(1.5);
    expect(await s.getRecents()).toEqual(['Kitchen']);
  });
  test('data survives reopening', async () => {
    await (await openStore()).putScript(doc('a'));
    expect((await (await openStore()).getScripts()).length).toBe(1);
  });
  test('recents default to empty', async () => {
    expect(await (await openStore()).getRecents()).toEqual([]);
  });
});
