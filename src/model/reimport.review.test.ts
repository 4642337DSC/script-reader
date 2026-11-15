import { describe, expect, test } from 'vitest';
import { buildVideos, dismissSuggestion, setText, toggleDone } from './sections';
import { buildVideosFromImport } from '../import/importModel';
import { reimport } from './reimport';
import type { ImportedVideo, ScriptDoc } from './types';

const imp = (title: string, notes: string, ...paras: { text: string; cue?: string }[]): ImportedVideo => ({
  title, group: null, notes,
  paragraphs: paras.map((p) => ({ source: p.text, text: p.text, suggestedLocation: p.cue ?? null })),
});
const docOf = (imported: ImportedVideo[]): ScriptDoc => ({
  fileId: 's', name: 'n', videos: buildVideosFromImport(imported, 1), orphans: [], updatedAt: 1,
});

describe('review fixes: re-import', () => {
  test('C1: identical consecutive paragraphs stay two sections across repeated re-imports', () => {
    let d = docOf([imp('T', '', { text: 'Suna acum!' }, { text: 'Suna acum!' }, { text: 'Alt text' })]);
    const ids = d.videos[0].sections.map((s) => s.id);
    for (let i = 0; i < 3; i++) d = reimport(d, [imp('T', '', { text: 'Suna acum!' }, { text: 'Suna acum!' }, { text: 'Alt text' })], 10 + i);
    expect(d.videos[0].sections.map((s) => s.id)).toEqual(ids);
    expect(d.orphans).toEqual([]);
  });

  test('C1: a user-split paragraph still re-matches as one source paragraph', () => {
    const base = docOf([imp('T', '', { text: 'aa bb cc dd' })]);
    const s = base.videos[0].sections[0];
    const pieces = [
      { ...s, text: 'aa bb' },
      { ...s, id: 'second', text: 'cc dd' },
    ];
    const d = { ...base, videos: [{ ...base.videos[0], sections: pieces }] };
    const r = reimport(d, [imp('T', '', { text: 'aa bb cc dd' })], 9);
    expect(r.videos[0].sections.map((x) => x.id)).toEqual([s.id, 'second']);
    expect(r.orphans).toEqual([]);
  });

  test('I3: editing a section of an older script (no originalText) survives a re-import', () => {
    const legacy: ScriptDoc = { fileId: 's', name: 'n', orphans: [], updatedAt: 1, videos: buildVideos([{ title: 'T', paragraphs: ['one', 'two'] }], 1) };
    const id = legacy.videos[0].sections[0].id;
    let v = toggleDone(legacy.videos[0], id, 2);
    v = setText(v, id, 'one (typo fixed)', 3);
    expect(v.sections[0].originalText).toBe('one');
    const r = reimport({ ...legacy, videos: [v] }, [imp('T', '', { text: 'one' }, { text: 'two' })], 9);
    expect(r.videos[0].sections[0]).toMatchObject({ id, text: 'one (typo fixed)', done: true });
    expect(r.orphans).toEqual([]);
  });

  test('I4: edited Notes are kept even when the source notes read differently on the next import', () => {
    const d = docOf([imp('T', 'Cadre: x', { text: 'a' })]);
    d.videos[0] = { ...d.videos[0], notes: 'Cadre: x (my edit)' };
    const r = reimport(d, [imp('T', 'Cadre: x\n\nPublicare: ianuarie', { text: 'a' })], 9);
    expect(r.videos[0].notes).toBe('Cadre: x (my edit)');
    expect(r.videos[0].originalNotes).toBe('Cadre: x\n\nPublicare: ianuarie');
  });

  test('I4: Notes the user never edited follow the source', () => {
    const d = docOf([imp('T', 'Cadre: x', { text: 'a' })]);
    expect(reimport(d, [imp('T', 'Cadre: y', { text: 'a' })], 9).videos[0].notes).toBe('Cadre: y');
  });

  test('a dismissed suggestion does not come back on the next re-import', () => {
    const d = docOf([imp('T', '', { text: 'a', cue: 'tipografie' })]);
    const dismissed = dismissSuggestion(d.videos[0], d.videos[0].sections[0].id, 2);
    expect(dismissed.sections[0].suggestedLocation).toBe('');
    const r = reimport({ ...d, videos: [dismissed] }, [imp('T', '', { text: 'a', cue: 'tipografie' })], 9);
    expect(r.videos[0].sections[0].suggestedLocation).toBe('');
  });
});
