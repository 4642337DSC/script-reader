import { describe, expect, test } from 'vitest';
import { assembleDoc, assignBrollOrders, assignOrders, assignVideoOrders, diffBroll, flattenDoc } from './docOps';
import { createMemoryBackend, createMemoryRepo } from './memoryRepo';
import { addBroll, removeBroll, setBrollText, toggleBroll } from '../model/sections';
import { buildVideosFromImport } from '../import/importModel';
import type { ScriptData } from './types';
import type { ScriptDoc } from '../model/types';

const docOf = (broll: string[][]): ScriptDoc => ({
  fileId: 's', name: 'n', orphans: [], updatedAt: 1,
  videos: buildVideosFromImport(broll.map((b, i) => ({ title: 'V' + i, group: null, notes: '', broll: b, paragraphs: [{ source: 'p' + i, text: 'p' + i }] })), 1),
});
const flat = (d: ScriptDoc, known: Record<string, number> = {}) =>
  flattenDoc(d, assignOrders(d, {}), assignVideoOrders(d, {}), assignBrollOrders(d, known));

describe('B-roll in the data layer', () => {
  test('orders run across all videos and a new shot slots between neighbours', () => {
    const d = docOf([['a', 'b'], ['c']]);
    const o = assignBrollOrders(d, {});
    const ids = d.videos.flatMap((v) => v.broll!.map((b) => b.id));
    expect(ids.map((i) => o[i])).toEqual([1000, 2000, 3000]);
    const v0 = addBroll(d.videos[0], 'inserted', 2);
    const moved: ScriptDoc = { ...d, videos: [{ ...v0, broll: [v0.broll![0], v0.broll![2], v0.broll![1]] }, d.videos[1]] };
    const o2 = assignBrollOrders(moved, o);
    const [first, ins, second] = moved.videos[0].broll!.map((b) => o2[b.id]);
    expect(first < ins && ins < second).toBe(true);
  });

  test('flatten and assemble round trip, in order, with no broll key on videos that have none', () => {
    const d = docOf([['a', 'b'], []]);
    const f = flat(d);
    expect(f.broll).toHaveLength(2);
    const back = assembleDoc('s', 'n', f.videos, f.rows, [...f.broll].reverse());
    expect(back.doc.videos[0].broll!.map((b) => b.text)).toEqual(['a', 'b']);
    expect('broll' in back.doc.videos[1]).toBe(false);
    expect(back.brollOrders).toEqual(assignBrollOrders(d, {}));
  });

  test('a check is a one-field patch; an edit, an addition and a removal are found too', () => {
    const d = docOf([['a', 'b']]);
    const before = flat(d).broll;
    const [a, b] = d.videos[0].broll!;
    let v = toggleBroll(d.videos[0], a.id, 7);
    v = setBrollText(v, b.id, 'b2', 8);
    v = addBroll(v, 'c', 9);
    const after = flattenDoc({ ...d, videos: [v] }, assignOrders(d, {}), assignVideoOrders(d, {}), assignBrollOrders({ ...d, videos: [v] }, assignBrollOrders(d, {}))).broll;
    const r = diffBroll(before, after);
    expect(r.updates).toEqual([
      { id: a.id, patch: { done: true, updatedAt: 7 } },
      { id: b.id, patch: { text: 'b2', updatedAt: 8 } },
    ]);
    expect(r.sets.map((x) => x.text)).toEqual(['c']);
    const removed = diffBroll(before, flattenDoc({ ...d, videos: [removeBroll(d.videos[0], a.id)] }, assignOrders(d, {}), assignVideoOrders(d, {}), assignBrollOrders(d, assignBrollOrders(d, {}))).broll);
    expect(removed.deletes).toEqual([a.id]);
  });
});

describe('B-roll through the repo', () => {
  async function world() {
    const backend = createMemoryBackend();
    const boss = createMemoryRepo({ backend, user: { email: 'boss@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
    const c1 = await boss.createClient('Acme');
    await boss.setMembers(c1, ['anna@x.com', 'bob@x.com']);
    const anna = createMemoryRepo({ backend, user: { email: 'anna@x.com', name: 'A' }, adminEmail: 'boss@x.com' });
    const bob = createMemoryRepo({ backend, user: { email: 'bob@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
    const { scriptId } = await anna.addScript(c1, 's.docx', [{ title: 'T', group: null, notes: 'n', broll: ['one', 'two', 'three'], paragraphs: [{ source: 'p', text: 'p' }] }]);
    const get = (r: typeof anna) => { let d: ScriptData | null = null; r.watchScript(c1, scriptId, (x) => { d = x; }, () => {})(); return d!; };
    return { c1, scriptId, anna, bob, get };
  }

  test('an imported shot list is stored and readable by everyone with access', async () => {
    const w = await world();
    expect(w.get(w.bob).doc.videos[0].broll!.map((b) => [b.text, b.done])).toEqual([['one', false], ['two', false], ['three', false]]);
  });

  test('two members changing different shots from stale copies both keep their change', async () => {
    const w = await world();
    const sa = w.get(w.anna);
    const sb = w.get(w.bob);
    const [one, , three] = sa.doc.videos[0].broll!;
    await w.anna.saveScript(w.c1, w.scriptId, sa, { ...sa.doc, videos: [toggleBroll(sa.doc.videos[0], one.id, 5)] });
    await w.bob.saveScript(w.c1, w.scriptId, sb, { ...sb.doc, videos: [setBrollText(sb.doc.videos[0], three.id, 'three (bob)', 6)] });
    expect(w.get(w.anna).doc.videos[0].broll!.map((b) => [b.text, b.done])).toEqual([['one', true], ['two', false], ['three (bob)', false]]);
  });

  test('adding and removing shots syncs', async () => {
    const w = await world();
    const s = w.get(w.anna);
    let v = addBroll(s.doc.videos[0], 'four', 5);
    v = removeBroll(v, v.broll![1].id);
    await w.anna.saveScript(w.c1, w.scriptId, s, { ...s.doc, videos: [v] });
    expect(w.get(w.bob).doc.videos[0].broll!.map((b) => b.text)).toEqual(['one', 'three', 'four']);
  });

  test('a re-import leaves the shot list alone', async () => {
    const w = await world();
    const s = w.get(w.anna);
    await w.anna.saveScript(w.c1, w.scriptId, s, { ...s.doc, videos: [toggleBroll(s.doc.videos[0], s.doc.videos[0].broll![0].id, 5)] });
    await w.anna.addScript(w.c1, 's.docx', [{ title: 'T', group: null, notes: 'n', broll: ['one', 'two', 'three', 'four'], paragraphs: [{ source: 'p', text: 'p' }] }]);
    expect(w.get(w.bob).doc.videos[0].broll!.map((b) => [b.text, b.done])).toEqual([['one', true], ['two', false], ['three', false]]);
  });
});
