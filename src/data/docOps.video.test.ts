import { describe, expect, test } from 'vitest';
import { assembleDoc, assignOrders, assignVideoOrders, diffVideos, flattenDoc, legacyVideoRows } from './docOps';
import { buildVideosFromImport } from '../import/importModel';
import type { ImportedVideo, ScriptDoc } from '../model/types';

const imp = (title: string, group: string | null, notes: string, ...paras: string[]): ImportedVideo => ({
  title, group, notes, paragraphs: paras.map((p) => ({ source: '„' + p + '”', text: p, suggestedLocation: p === 'b' ? 'tipografie' : null })),
});
const docOf = (imported: ImportedVideo[]): ScriptDoc => ({
  fileId: 's', name: 'n.docx', orphans: [], updatedAt: 1, videos: buildVideosFromImport(imported, 1),
});

describe('assignVideoOrders', () => {
  test('starts at 1000 with a 1000 step', () => {
    const d = docOf([imp('A', null, ''), imp('B', null, ''), imp('C', null, '')]);
    const o = assignVideoOrders(d, {});
    expect(d.videos.map((v) => o[v.id])).toEqual([1000, 2000, 3000]);
  });
  test('a new video between two known ones gets a value between them', () => {
    const d = docOf([imp('A', null, ''), imp('B', null, ''), imp('C', null, '')]);
    const [a, b, c] = d.videos;
    const o = assignVideoOrders(d, { [a.id]: 1000, [c.id]: 2000 });
    expect(o[a.id] < o[b.id] && o[b.id] < o[c.id]).toBe(true);
  });
});

describe('diffVideos', () => {
  const rowsOf = (d: ScriptDoc) => flattenDoc(d, assignOrders(d, {}), assignVideoOrders(d, {})).videos;

  test('a title edit produces a patch with only the title', () => {
    const d = docOf([imp('A', 'G', 'n'), imp('B', 'G', 'n')]);
    const before = rowsOf(d);
    const after = before.map((v, i) => (i === 0 ? { ...v, title: 'A edited' } : v));
    expect(diffVideos(before, after)).toEqual({ sets: [], updates: [{ id: before[0].id, patch: { title: 'A edited' } }], deletes: [] });
  });
  test('notes edit, new video and removed video', () => {
    const d = docOf([imp('A', null, 'x'), imp('B', null, '')]);
    const before = rowsOf(d);
    const added = { ...before[0], id: 'new', order: 5000 };
    const after = [{ ...before[0], notes: 'y' }, added];
    const r = diffVideos(before, after);
    expect(r.updates).toEqual([{ id: before[0].id, patch: { notes: 'y' } }]);
    expect(r.sets).toEqual([added]);
    expect(r.deletes).toEqual([before[1].id]);
  });
});

describe('flatten / assemble with the new fields', () => {
  test('round trip keeps group, notes, originals, suggestions and orders', () => {
    const d = docOf([imp('A', 'Print', 'Cadre: x', 'a', 'b'), imp('B', 'Shop', '', 'c')]);
    const o = assignOrders(d, {});
    const vo = assignVideoOrders(d, {});
    const { videos, rows } = flattenDoc(d, o, vo);
    const back = assembleDoc('s', 'n.docx', [...videos].reverse(), [...rows].reverse());
    expect(back.doc.videos).toEqual(d.videos);
    expect(back.videoOrders).toEqual(vo);
    expect(back.orders).toEqual(o);
    expect(back.legacy).toBeUndefined();
  });
  test('legacy video entries get safe defaults and mark the script as legacy-shaped', () => {
    const rows = legacyVideoRows([{ id: 'v1', title: 'One' }, { id: 'v2', title: 'Two' }]);
    expect(rows).toEqual([
      { id: 'v1', title: 'One', group: null, notes: '', originalTitle: 'One', originalNotes: '', order: 1000 },
      { id: 'v2', title: 'Two', group: null, notes: '', originalTitle: 'Two', originalNotes: '', order: 2000 },
    ]);
  });
});
