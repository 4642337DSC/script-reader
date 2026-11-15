import { describe, test, expect } from 'vitest';
import { buildVideos, setLocation, toggleDone, splitSection } from './sections';
import { reimport } from './reimport';
import type { ScriptDoc } from './types';

const doc = (parsed: { title: string; paragraphs: string[] }[]): ScriptDoc => ({
  fileId: 'f', name: 'n.docx', videos: buildVideos(parsed, 1), orphans: [], updatedAt: 1,
});

describe('reimport', () => {
  test('unchanged text keeps ids, location and done', () => {
    let d = doc([{ title: 'T', paragraphs: ['one', 'two'] }]);
    let v = setLocation(d.videos[0], d.videos[0].sections[0].id, 'Kitchen', 2);
    v = toggleDone(v, v.sections[1].id, 3);
    d = { ...d, videos: [v] };
    const r = reimport(d, [{ title: 'T', paragraphs: ['one', 'two'] }], 9);
    // matched sections now also remember their source paragraph (originalText); everything else is unchanged
    expect(r.videos[0].sections).toMatchObject(v.sections.map((s) => ({ ...s })));
    expect(r.videos[0].sections.map((s) => s.originalText)).toEqual(['one', 'two']);
    expect(r.videos[0].id).toBe(v.id);
    expect(r.orphans).toEqual([]);
  });

  test('user split survives when the paragraph text is unchanged', () => {
    let d = doc([{ title: 'T', paragraphs: ['aa bb cc dd'] }]);
    const v = splitSection(d.videos[0], d.videos[0].sections[0].id, 6, 2);
    d = { ...d, videos: [v] };
    const r = reimport(d, [{ title: 'T', paragraphs: ['aa bb cc dd'] }], 9);
    expect(r.videos[0].sections.map((s) => s.text)).toEqual(['aa bb', 'cc dd']);
    expect(r.videos[0].sections.map((s) => s.id)).toEqual(v.sections.map((s) => s.id));
  });

  test('edited paragraph is fresh and the old one lands in orphans with its state', () => {
    let d = doc([{ title: 'T', paragraphs: ['keep', 'old text'] }]);
    const v = toggleDone(d.videos[0], d.videos[0].sections[1].id, 2);
    d = { ...d, videos: [v] };
    const r = reimport(d, [{ title: 'T', paragraphs: ['keep', 'new text'] }], 9);
    expect(r.videos[0].sections[1]).toMatchObject({ text: 'new text', done: false });
    expect(r.videos[0].sections[1].id).not.toBe(v.sections[1].id);
    expect(r.orphans).toEqual([v.sections[1]]);
  });

  test('identical paragraphs match in order', () => {
    let d = doc([{ title: 'T', paragraphs: ['same', 'same'] }]);
    const v = toggleDone(d.videos[0], d.videos[0].sections[0].id, 2);
    d = { ...d, videos: [v] };
    const r = reimport(d, [{ title: 'T', paragraphs: ['same', 'same'] }], 9);
    expect(r.videos[0].sections.map((s) => s.done)).toEqual([true, false]);
  });

  test('NBSP and decomposed diacritics still match', () => {
    const d = doc([{ title: 'T', paragraphs: ['ța ră'] }]);
    const r = reimport(d, [{ title: 'T', paragraphs: ['ța ră'] }], 9);
    expect(r.videos[0].sections[0].id).toBe(d.videos[0].sections[0].id);
  });

  test('new video is added fresh', () => {
    const d = doc([{ title: 'A', paragraphs: ['a'] }]);
    const r = reimport(d, [{ title: 'A', paragraphs: ['a'] }, { title: 'B', paragraphs: ['b'] }], 9);
    expect(r.videos.map((v) => v.title)).toEqual(['A', 'B']);
  });

  test('removed video puts its sections in orphans', () => {
    const d = doc([{ title: 'A', paragraphs: ['a'] }, { title: 'B', paragraphs: ['b'] }]);
    const r = reimport(d, [{ title: 'A', paragraphs: ['a'] }], 9);
    expect(r.videos).toHaveLength(1);
    expect(r.orphans.map((s) => s.text)).toEqual(['b']);
  });
});

describe('reimport (review fixes)', () => {
  test('I1: inserting a video before existing ones keeps state of the others', () => {
    let d = doc([{ title: 'A', paragraphs: ['a1'] }, { title: 'B', paragraphs: ['b1'] }]);
    const a = toggleDone(d.videos[0], d.videos[0].sections[0].id, 2);
    const b = toggleDone(d.videos[1], d.videos[1].sections[0].id, 2);
    d = { ...d, videos: [a, b] };
    const r = reimport(d, [{ title: 'X', paragraphs: ['x1'] }, { title: 'A', paragraphs: ['a1'] }, { title: 'B', paragraphs: ['b1'] }], 9);
    expect(r.videos.map((v) => v.sections[0].done)).toEqual([false, true, true]);
    expect(r.orphans).toEqual([]);
  });
  test('C3: a no-op reimport keeps the old updatedAt', () => {
    const d = doc([{ title: 'T', paragraphs: ['one'] }]);
    expect(reimport(d, [{ title: 'T', paragraphs: ['one'] }], 999).updatedAt).toBe(1);
  });
});
