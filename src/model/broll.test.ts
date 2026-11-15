import { describe, expect, test } from 'vitest';
import { addBroll, removeBroll, setBrollText, toggleBroll } from './sections';
import { reimport } from './reimport';
import { buildVideosFromImport } from '../import/importModel';
import type { ImportedVideo, ScriptDoc, Video } from './types';

const base = (): Video => ({ id: 'v', title: 'T', sections: [] });

describe('B-roll list operations', () => {
  test('addBroll appends a new unchecked shot with trimmed text; blank is ignored', () => {
    const v = addBroll(base(), '  penița pe hârtie  ', 5);
    expect(v.broll).toHaveLength(1);
    expect(v.broll![0]).toMatchObject({ text: 'penița pe hârtie', done: false, updatedAt: 5 });
    expect(addBroll(v, 'agenda', 6).broll!.map((b) => b.text)).toEqual(['penița pe hârtie', 'agenda']);
    expect(addBroll(v, '   ', 6)).toBe(v);
  });

  test('toggleBroll checks and unchecks, bumping updatedAt for that shot only', () => {
    let v = addBroll(addBroll(base(), 'a', 1), 'b', 1);
    const [a, b] = v.broll!;
    v = toggleBroll(v, a.id, 9);
    expect(v.broll!.map((x) => [x.done, x.updatedAt])).toEqual([[true, 9], [false, 1]]);
    expect(toggleBroll(v, a.id, 10).broll![0].done).toBe(false);
    expect(toggleBroll(v, 'nope', 10)).toBe(v);
    expect(v.broll![1]).toBe(b);
  });

  test('setBrollText edits a shot; blank text is refused', () => {
    const v = addBroll(base(), 'a', 1);
    const id = v.broll![0].id;
    expect(setBrollText(v, id, '  agenda ', 4).broll![0]).toMatchObject({ text: 'agenda', updatedAt: 4 });
    expect(setBrollText(v, id, '   ', 4)).toBe(v);
  });

  test('removeBroll deletes one shot', () => {
    const v = addBroll(addBroll(base(), 'a', 1), 'b', 1);
    expect(removeBroll(v, v.broll![0].id).broll!.map((b) => b.text)).toEqual(['b']);
    expect(removeBroll(v, 'nope')).toBe(v);
  });
});

describe('B-roll from an import', () => {
  const imported = (broll?: string[]): ImportedVideo => ({
    title: 'T', group: null, notes: 'n', ...(broll ? { broll } : {}), paragraphs: [{ source: 'a', text: 'a' }],
  });

  test('shots listed in the import become unchecked items that remember their original text', () => {
    const [v] = buildVideosFromImport([imported(['penița', 'agenda'])], 3);
    expect(v.broll!.map((b) => [b.text, b.originalText, b.done, b.updatedAt])).toEqual([
      ['penița', 'penița', false, 3],
      ['agenda', 'agenda', false, 3],
    ]);
    expect(new Set(v.broll!.map((b) => b.id)).size).toBe(2);
  });

  test('a video with no shots has no broll field at all', () => {
    expect('broll' in buildVideosFromImport([imported()], 3)[0]).toBe(false);
    expect('broll' in buildVideosFromImport([imported([])], 3)[0]).toBe(false);
  });
});

describe('re-import and B-roll', () => {
  const docOf = (broll: string[]): ScriptDoc => ({
    fileId: 's', name: 'n', orphans: [], updatedAt: 1,
    videos: buildVideosFromImport([{ title: 'T', group: null, notes: 'n', broll, paragraphs: [{ source: 'a', text: 'a' }] }], 1),
  });

  test('a re-import never changes the B-roll list: checks, edits, additions and deletions all stay', () => {
    const d = docOf(['one', 'two']);
    let v = toggleBroll(d.videos[0], d.videos[0].broll![0].id, 2);
    v = removeBroll(v, v.broll![1].id);
    v = addBroll(v, 'mine', 3);
    const r = reimport({ ...d, videos: [v] }, [{ title: 'T', group: null, notes: 'n', broll: ['one', 'two', 'three'], paragraphs: [{ source: 'a', text: 'a' }] }], 9);
    expect(r.videos[0].broll!.map((b) => [b.text, b.done])).toEqual([['one', true], ['mine', false]]);
  });

  test('a video that is new in the re-import gets its shots from the import', () => {
    const d = docOf(['one']);
    const r = reimport(d, [
      { title: 'T', group: null, notes: 'n', paragraphs: [{ source: 'a', text: 'a' }] },
      { title: 'Brand new', group: null, notes: 'x', broll: ['fresh shot'], paragraphs: [{ source: 'b', text: 'b' }] },
    ], 9);
    expect(r.videos[1].broll!.map((b) => b.text)).toEqual(['fresh shot']);
  });
});
