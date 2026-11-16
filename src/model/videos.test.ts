import { describe, expect, test } from 'vitest';
import { mergeVideoIntoPrevious, splitVideoInDoc } from './videos';
import type { ScriptDoc, Section } from './types';

const sec = (id: string): Section => ({ id, text: id, location: null, done: false, updatedAt: 1 });
const doc = (): ScriptDoc => ({
  fileId: 'f', name: 'S', orphans: [], updatedAt: 1,
  videos: [
    { id: 'a', title: 'One', group: 'G', notes: 'na', originalNotes: 'na', sections: [sec('1'), sec('2'), sec('3')], broll: [{ id: 'b1', text: 'x', done: false, updatedAt: 1 }] },
    { id: 'b', title: 'Two', notes: 'nb', sections: [sec('4')], broll: [{ id: 'b2', text: 'y', done: true, updatedAt: 1 }] },
  ],
});

describe('splitVideoInDoc', () => {
  test('cards from the chosen one on become a new video right after, in the same group', () => {
    const r = splitVideoInDoc(doc(), 'a', 1)!;
    expect(r.doc.videos.map((v) => v.id)).toEqual(['a', r.newId, 'b']);
    expect(r.doc.videos[0].sections.map((s) => s.id)).toEqual(['1']);
    expect(r.doc.videos[1].sections.map((s) => s.id)).toEqual(['2', '3']);
    expect(r.doc.videos[1].title).toBe('One (2)');
    expect(r.doc.videos[1].group).toBe('G');
    expect(r.doc.videos[0].broll?.length).toBe(1);
    expect(r.doc.videos[1].broll).toBeUndefined();
  });
  test('refuses a split that would leave an empty video', () => {
    expect(splitVideoInDoc(doc(), 'a', 0)).toBeNull();
    expect(splitVideoInDoc(doc(), 'a', 3)).toBeNull();
    expect(splitVideoInDoc(doc(), 'nope', 1)).toBeNull();
  });
});

describe('mergeVideoIntoPrevious', () => {
  test('appends cards, joins notes and B-roll, keeps the first title', () => {
    const r = mergeVideoIntoPrevious(doc(), 'b')!;
    expect(r.doc.videos.length).toBe(1);
    const v = r.doc.videos[0];
    expect(v.title).toBe('One');
    expect(v.sections.map((s) => s.id)).toEqual(['1', '2', '3', '4']);
    expect(v.notes).toBe('na\n\nnb');
    expect(v.broll?.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(r.intoId).toBe('a');
  });
  test('the first video cannot merge upward', () => {
    expect(mergeVideoIntoPrevious(doc(), 'a')).toBeNull();
  });
  test('split then merge gets the cards back in order', () => {
    const s = splitVideoInDoc(doc(), 'a', 2)!;
    const m = mergeVideoIntoPrevious(s.doc, s.newId)!;
    expect(m.doc.videos[0].sections.map((x) => x.id)).toEqual(['1', '2', '3']);
  });
});
