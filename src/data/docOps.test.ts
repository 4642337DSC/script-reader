import { describe, expect, test } from 'vitest';
import { assembleDoc, assignOrders, chunk, diffRows, flattenDoc } from './docOps';
import { buildVideos, splitSection, mergeWithPrevious, toggleDone } from '../model/sections';
import type { ScriptDoc } from '../model/types';

const mkDoc = (paras: string[][]): ScriptDoc => ({
  fileId: 's', name: 'n.docx', orphans: [], updatedAt: 1,
  videos: buildVideos(paras.map((p, i) => ({ title: `V${i}`, paragraphs: p })), 1),
});

describe('assignOrders', () => {
  test('empty known starts at 1000 step 1000', () => {
    const d = mkDoc([['a', 'b', 'c']]);
    const o = assignOrders(d, {});
    expect(d.videos[0].sections.map((s) => o[s.id])).toEqual([1000, 2000, 3000]);
  });
  test('new section gets a value between neighbours', () => {
    const d = mkDoc([['aa bb', 'z']]);
    const known = assignOrders(d, {});
    const v = splitSection(d.videos[0], d.videos[0].sections[0].id, 2, 2);
    expect(v.sections).toHaveLength(3);
    const o = assignOrders({ ...d, videos: [v] }, known);
    const [x, y, z] = v.sections.map((q) => o[q.id]);
    expect(x < y && y < z).toBe(true);
  });
  test('two consecutive new sections are spread and ordered', () => {
    const d = mkDoc([['a', 'b', 'c', 'd']]);
    const known = assignOrders(d, {});
    const [a, b, c, dd] = d.videos[0].sections;
    const partial = { [a.id]: known[a.id], [dd.id]: known[dd.id] };
    const o = assignOrders(d, partial);
    expect(o[a.id] < o[b.id] && o[b.id] < o[c.id] && o[c.id] < o[dd.id]).toBe(true);
  });
  test('first and last insertion use ±1000', () => {
    const d = mkDoc([['a', 'b', 'c']]);
    const [a, b, c] = d.videos[0].sections;
    const o = assignOrders(d, { [b.id]: 5000 });
    expect(o[a.id]).toBe(4000); expect(o[c.id]).toBe(6000);
  });
  test('out-of-order known values are reassigned so the sequence is increasing', () => {
    const d = mkDoc([['a', 'b', 'c']]);
    const [a, b, c] = d.videos[0].sections;
    const o = assignOrders(d, { [a.id]: 3000, [b.id]: 1000, [c.id]: 2000 });
    expect(o[a.id] < o[b.id] && o[b.id] < o[c.id]).toBe(true);
  });
});

describe('diffRows', () => {
  const rowsOf = (d: ScriptDoc, o = assignOrders(d, {})) => ({ rows: flattenDoc(d, o).rows, o });

  test('tick produces patch {done, updatedAt} only', () => {
    const d = mkDoc([['a', 'b']]);
    const { rows, o } = rowsOf(d);
    const v = toggleDone(d.videos[0], d.videos[0].sections[0].id, 9);
    const after = flattenDoc({ ...d, videos: [v] }, o).rows;
    const r = diffRows(rows, after);
    expect(r.sets).toEqual([]); expect(r.deletes).toEqual([]);
    expect(r.updates).toEqual([{ id: d.videos[0].sections[0].id, patch: { done: true, updatedAt: 9 } }]);
  });
  test('split gives one update (text) and one set', () => {
    const d = mkDoc([['aa bb']]);
    const { rows, o } = rowsOf(d);
    const v = splitSection(d.videos[0], d.videos[0].sections[0].id, 3, 5);
    const d2 = { ...d, videos: [v] };
    const r = diffRows(rows, flattenDoc(d2, assignOrders(d2, o)).rows);
    expect(r.updates.map((u) => Object.keys(u.patch).sort())).toEqual([['text', 'updatedAt']]);
    expect(r.sets).toHaveLength(1); expect(r.deletes).toEqual([]);
  });
  test('merge gives one update and one delete', () => {
    const d = mkDoc([['aa', 'bb']]);
    const { rows, o } = rowsOf(d);
    const v = mergeWithPrevious(d.videos[0], d.videos[0].sections[1].id, 5);
    const d2 = { ...d, videos: [v] };
    const r = diffRows(rows, flattenDoc(d2, assignOrders(d2, o)).rows);
    expect(r.updates).toHaveLength(1); expect(r.deletes).toEqual([d.videos[0].sections[1].id]);
  });
});

describe('flatten/assemble', () => {
  test('roundtrips a doc with orphans', () => {
    const d = mkDoc([['a', 'b'], ['c']]);
    d.orphans = [{ id: 'o1', text: 'gone', location: 'K', done: true, updatedAt: 3 }];
    const o = assignOrders(d, {});
    const { videos, rows } = flattenDoc(d, o);
    const back = assembleDoc('s', 'n.docx', videos, [...rows].reverse());
    expect(back.doc.videos.map((v) => v.sections.map((s) => s.text))).toEqual([['a', 'b'], ['c']]);
    expect(back.doc.orphans).toEqual(d.orphans);
    expect(back.orders).toEqual(o);
  });
});

test('chunk splits 1201 items into 500/500/201', () => {
  expect(chunk(Array.from({ length: 1201 }, (_, i) => i), 500).map((c) => c.length)).toEqual([500, 500, 201]);
});
