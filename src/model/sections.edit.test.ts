import { describe, expect, test } from 'vitest';
import { buildVideosFromImport } from '../import/importModel';
import { acceptSuggestion, dismissSuggestion, mergeWithPrevious, setLocation, setText, setVideoNotes, setVideoTitle, splitSection } from './sections';
import type { Video } from './types';

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
