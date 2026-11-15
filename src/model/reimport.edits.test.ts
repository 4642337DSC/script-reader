import { describe, expect, test } from 'vitest';
import { buildVideos, splitSection, toggleDone } from './sections';
import { buildVideosFromImport } from '../import/importModel';
import { countNewOrphans, reimport } from './reimport';
import type { ImportedVideo, ScriptDoc } from './types';

const imp = (title: string, group: string | null, notes: string, ...paras: string[]): ImportedVideo => ({
  title, group, notes, paragraphs: paras.map((p) => ({ source: p, text: p })),
});
const docOf = (imported: ImportedVideo[]): ScriptDoc => ({
  fileId: 's', name: 'n', videos: buildVideosFromImport(imported, 1), orphans: [], updatedAt: 1,
});

describe('reimport keeps user edits', () => {
  test('an edited section keeps its text, location and done when the source paragraph is unchanged', () => {
    const d = docOf([imp('T', 'G', '', 'one', 'two')]);
    const s0 = d.videos[0].sections[0];
    d.videos[0].sections[0] = { ...s0, text: 'one (fixed)', done: true, location: 'Kitchen' };
    const r = reimport(d, [imp('T', 'G', '', 'one', 'two')], 9);
    expect(r.videos[0].sections[0]).toMatchObject({ id: s0.id, text: 'one (fixed)', done: true, location: 'Kitchen' });
    expect(r.orphans).toEqual([]);
  });

  test('a changed source paragraph puts the edited section in orphans', () => {
    const d = docOf([imp('T', null, '', 'one', 'two')]);
    d.videos[0].sections[0] = { ...d.videos[0].sections[0], text: 'one (fixed)', done: true };
    const r = reimport(d, [imp('T', null, '', 'one changed', 'two')], 9);
    expect(r.videos[0].sections.map((s) => s.text)).toEqual(['one changed', 'two']);
    expect(r.orphans.map((s) => [s.text, s.done])).toEqual([['one (fixed)', true]]);
    expect(countNewOrphans(d, r)).toBe(1);
  });

  test('an edited title survives; a changed source title replaces it', () => {
    const d = docOf([imp('Original', null, '', 'a')]);
    d.videos[0] = { ...d.videos[0], title: 'My title' };
    expect(reimport(d, [imp('Original', null, '', 'a')], 9).videos[0].title).toBe('My title');
    expect(reimport(d, [imp('New source title', null, '', 'a')], 9).videos[0].title).toBe('New source title');
  });

  test('edited notes survive a re-import; notes never edited follow the source', () => {
    const d = docOf([imp('T', null, 'Cadre: x', 'a')]);
    d.videos[0] = { ...d.videos[0], notes: 'Cadre: x (my edit)' };
    expect(reimport(d, [imp('T', null, 'Cadre: x', 'a')], 9).videos[0].notes).toBe('Cadre: x (my edit)');
    d.videos[0] = { ...d.videos[0], notes: 'Cadre: x' };
    expect(reimport(d, [imp('T', null, 'Cadre: y', 'a')], 9).videos[0].notes).toBe('Cadre: y');
  });

  test('a section that used to be spoken text and is now notes lands in orphans with its state', () => {
    const legacy: ScriptDoc = { fileId: 's', name: 'n', orphans: [], updatedAt: 1, videos: buildVideos([{ title: 'T', paragraphs: ['spoken', 'Cadre si foto. filmam'] }], 1) };
    legacy.videos[0] = toggleDone(legacy.videos[0], legacy.videos[0].sections[1].id, 2);
    const r = reimport(legacy, [imp('T', 'G', 'Cadre si foto. filmam', 'spoken')], 9);
    expect(r.videos[0].sections.map((s) => s.text)).toEqual(['spoken']);
    expect(r.orphans.map((s) => [s.text, s.done])).toEqual([['Cadre si foto. filmam', true]]);
    expect(r.videos[0].notes).toBe('Cadre si foto. filmam');
  });

  test('an old section without originalText still matches a quoted source paragraph', () => {
    const legacy: ScriptDoc = { fileId: 's', name: 'n', orphans: [], updatedAt: 1, videos: buildVideos([{ title: 'T', paragraphs: ['foo'] }], 1) };
    legacy.videos[0] = toggleDone(legacy.videos[0], legacy.videos[0].sections[0].id, 2);
    const id = legacy.videos[0].sections[0].id;
    const r = reimport(legacy, [{ title: 'T', group: null, notes: '', paragraphs: [{ source: '„foo”', text: 'foo' }] }], 9);
    expect(r.videos[0].sections[0]).toMatchObject({ id, done: true, originalText: '„foo”' });
  });

  test('user splits of one source paragraph survive a re-import', () => {
    const d = docOf([imp('T', null, '', 'aa bb cc dd')]);
    const v = splitSection(d.videos[0], d.videos[0].sections[0].id, 6, 2);
    const r = reimport({ ...d, videos: [v] }, [imp('T', null, '', 'aa bb cc dd')], 9);
    expect(r.videos[0].sections.map((s) => s.text)).toEqual(['aa bb', 'cc dd']);
    expect(r.videos[0].sections.map((s) => s.id)).toEqual(v.sections.map((s) => s.id));
  });

  test('position fallback pairs unmatched videos only when the old one has no group or the same group', () => {
    const legacy: ScriptDoc = { fileId: 's', name: 'n', orphans: [], updatedAt: 1, videos: buildVideos([{ title: 'Video 1', paragraphs: ['a'] }], 1) };
    const keep = reimport(legacy, [imp('1. New naming', 'Print', '', 'a')], 9);
    expect(keep.videos[0].id).toBe(legacy.videos[0].id);
    const grouped = docOf([imp('Old', 'Shop', '', 'a')]);
    const split = reimport(grouped, [imp('Other', 'Print', '', 'a')], 9);
    expect(split.videos[0].id).not.toBe(grouped.videos[0].id);
    expect(split.orphans.map((s) => s.text)).toEqual(['a']);
  });

  test('a suggested location is added to a matched section only if it has none', () => {
    const d = docOf([imp('T', null, '', 'a', 'b')]);
    d.videos[0].sections[1] = { ...d.videos[0].sections[1], suggestedLocation: 'old cue' };
    const next: ImportedVideo = { title: 'T', group: null, notes: '', paragraphs: [{ source: 'a', text: 'a', suggestedLocation: 'tipografie' }, { source: 'b', text: 'b', suggestedLocation: 'new cue' }] };
    const r = reimport(d, [next], 9);
    expect(r.videos[0].sections.map((s) => s.suggestedLocation)).toEqual(['tipografie', 'old cue']);
  });
});
