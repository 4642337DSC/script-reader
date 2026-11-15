import { describe, expect, test } from 'vitest';
import { buildVideosFromImport } from '../import/importModel';
import { acceptSuggestion, dismissSuggestion, mergeWithPrevious, setLocation, setText, setVideoNotes, setVideoTitle, splitSection, splitUntouchedSentences } from './sections';
import type { Section, Video } from './types';

const mk = (): Video =>
  buildVideosFromImport([{
    title: 'T', group: 'G', notes: 'n',
    paragraphs: [{ source: '„one”', text: 'one', suggestedLocation: 'tipografie' }, { source: 'two', text: 'two' }],
  }], 1)[0];

describe('editing helpers', () => {
  test('setText trims, bumps updatedAt, keeps originalText, location and done', () => {
    const v = mk();
    const s = v.sections[0];
    const r = setText(setLocation(v, s.id, 'Kitchen', 2), s.id, '  fixed  ', 9);
    expect(r.sections[0]).toMatchObject({ text: 'fixed', updatedAt: 9, originalText: '„one”', location: 'Kitchen' });
  });
  test('setText ignores blank text and unknown ids', () => {
    const v = mk();
    expect(setText(v, v.sections[0].id, '   ', 9)).toBe(v);
    expect(setText(v, 'nope', 'x', 9)).toBe(v);
  });
  test('setVideoTitle trims and ignores blank; setVideoNotes allows clearing', () => {
    const v = mk();
    expect(setVideoTitle(v, '  New  ').title).toBe('New');
    expect(setVideoTitle(v, '  ')).toBe(v);
    expect(setVideoNotes(v, 'edited').notes).toBe('edited');
    expect(setVideoNotes(v, '').notes).toBe('');
    expect(setVideoNotes(v, 'edited').originalNotes).toBe('n');
  });
  test('acceptSuggestion makes it the real location and clears the suggestion', () => {
    const v = mk();
    const r = acceptSuggestion(v, v.sections[0].id, 5);
    expect(r.sections[0]).toMatchObject({ location: 'tipografie', suggestedLocation: null, updatedAt: 5 });
    expect(acceptSuggestion(v, v.sections[1].id, 5)).toBe(v);
  });
  test('merging two different source paragraphs joins their originalText; merging split pieces keeps it', () => {
    const v = mk();
    const merged = mergeWithPrevious(v, v.sections[1].id, 4);
    expect(merged.sections[0].originalText).toBe('„one” two');
    const pieces = splitSection(v, v.sections[1].id, 2, 5);
    expect(pieces.sections.map((s) => s.originalText)).toEqual(['„one”', 'two', 'two']);
    expect(mergeWithPrevious(pieces, pieces.sections[2].id, 6).sections[1].originalText).toBe('two');
  });

  test('setLocation clears a pending suggestion; dismissSuggestion clears only the suggestion', () => {
    const v = mk();
    expect(setLocation(v, v.sections[0].id, 'Office', 3).sections[0]).toMatchObject({ location: 'Office', suggestedLocation: null });
    expect(dismissSuggestion(v, v.sections[0].id, 3).sections[0]).toMatchObject({ location: null, suggestedLocation: '', updatedAt: 3 });
  });
});

describe('splitUntouchedSentences', () => {
  test('splits untouched paragraph cards, keeps edited and already-split ones', () => {
    const mk = (id: string, text: string, orig: string): Section => ({ id, text, originalText: orig, location: 'Kitchen', done: true, updatedAt: 1 });
    const v = { id: 'v', title: 'T', sections: [
      mk('a', 'Unu doi. Trei patru.', 'Unu doi. Trei patru.'),
      mk('b', 'Edited. Text.', 'Cinci. Sase.'),
      mk('c', 'Sapte.', 'Sapte. Opt.'), mk('d', 'Opt.', 'Sapte. Opt.'),
    ] } as Video;
    const out = splitUntouchedSentences(v, 2);
    expect(out.sections.map((s) => s.text)).toEqual(['Unu doi.', 'Trei patru.', 'Edited. Text.', 'Sapte.', 'Opt.']);
    expect(out.sections[1].location).toBe('Kitchen');
    expect(out.sections[1].done).toBe(true);
    expect(splitUntouchedSentences(out, 3)).toBe(out);
  });
});

test('old cards without originalText also split', () => {
  const v = { id: 'v', title: 'T', sections: [{ id: 'a', text: 'Unu doi. Trei.', location: null, done: false, updatedAt: 1 }] } as Video;
  expect(splitUntouchedSentences(v, 2).sections.map((s) => s.text)).toEqual(['Unu doi.', 'Trei.']);
});
