import { describe, expect, test } from 'vitest';
import { buildVideosFromImport, normalizeImport, stripOuterQuotes, stripSpokenQuotes, splitSentences } from './importModel';
import type { ImportedVideo, ParsedVideo } from '../model/types';

describe('stripOuterQuotes', () => {
  test.each([
    ['„Salut, lume.”', 'Salut, lume.'],
    ['"Hello there"', 'Hello there'],
    ['  „spațiu”  ', 'spațiu'],
    ['«salut»', 'salut'],
  ])('%s -> %s', (input, out) => {
    expect(stripOuterQuotes(input)).toBe(out);
  });

  test('a lone or unmatched quote is left alone (only trimmed)', () => {
    expect(stripOuterQuotes('„doar început')).toBe('„doar început');
    expect(stripOuterQuotes('fără ghilimele')).toBe('fără ghilimele');
    expect(stripOuterQuotes('a „citat” în mijloc')).toBe('a „citat” în mijloc');
  });
});

describe('stripSpokenQuotes (a quote can open in one paragraph and close in a later one)', () => {
  test.each([
    ['„Salut, lume.”', 'Salut, lume.'],
    ['„Doar început, fără închidere.', 'Doar început, fără închidere.'],
    ['Doar final, fără deschidere.”', 'Doar final, fără deschidere.'],
    ['„«Îmi trebuie formularul» Așa încep întrebările.”', '«Îmi trebuie formularul» Așa încep întrebările.'],
  ])('%s -> %s', (input, out) => {
    expect(stripSpokenQuotes(input)).toBe(out);
  });

  test('quotes in the middle, or a quote that closes inside the text, are left alone', () => {
    expect(stripSpokenQuotes('a „citat” în mijloc')).toBe('a „citat” în mijloc');
    expect(stripSpokenQuotes('„A” apoi text')).toBe('„A” apoi text');
    expect(stripSpokenQuotes('text apoi „B”')).toBe('text apoi „B”');
    expect(stripSpokenQuotes('fără ghilimele')).toBe('fără ghilimele');
  });
});

describe('normalizeImport', () => {
  test('converts ParsedVideo and passes ImportedVideo through', () => {
    const parsed: ParsedVideo[] = [{ title: 'T', paragraphs: ['a', 'b'] }];
    expect(normalizeImport(parsed)).toEqual([
      { title: 'T', group: null, notes: '', paragraphs: [{ source: 'a', text: 'a' }, { source: 'b', text: 'b' }] },
    ]);
    const imported: ImportedVideo[] = [{ title: 'X', group: 'G', notes: 'n', paragraphs: [{ source: '„s”', text: 's' }] }];
    expect(normalizeImport(imported)).toBe(imported);
  });
  test('an empty list stays empty', () => {
    expect(normalizeImport([])).toEqual([]);
  });
});

describe('buildVideosFromImport', () => {
  test('stores originalText, originalTitle, originalNotes, group and suggestions', () => {
    const imported: ImportedVideo[] = [{
      title: 'Titlu', group: 'Print', notes: 'Cadre: ...',
      paragraphs: [{ source: '„Prima.”', text: 'Prima.', suggestedLocation: 'tipografie' }, { source: 'A doua', text: 'A doua' }],
    }];
    const [v] = buildVideosFromImport(imported, 5);
    expect(v).toMatchObject({ title: 'Titlu', originalTitle: 'Titlu', group: 'Print', notes: 'Cadre: ...', originalNotes: 'Cadre: ...' });
    expect(v.sections.map((s) => [s.text, s.originalText, s.suggestedLocation, s.done, s.location, s.updatedAt])).toEqual([
      ['Prima.', '„Prima.”', 'tipografie', false, null, 5],
      ['A doua', 'A doua', undefined, false, null, 5],
    ]);
    expect(new Set([v.id, ...v.sections.map((s) => s.id)]).size).toBe(3);
  });
});

describe('one card per sentence', () => {
  test('a paragraph becomes one card per sentence, all remembering the paragraph', () => {
    const [v] = buildVideosFromImport([{ title: 'T', group: null, notes: '', paragraphs: [{ source: 'Unu doi. Trei patru! Cinci?', text: 'Unu doi. Trei patru! Cinci?' }] }], 1);
    expect(v.sections.map((s) => s.text)).toEqual(['Unu doi.', 'Trei patru!', 'Cinci?']);
    expect(new Set(v.sections.map((s) => s.originalText)).size).toBe(1);
  });
  test('abbreviations and numbers do not split', () => {
    expect(splitSentences('Vorbește cu dr. Popescu. Pe 5. iunie vin.')).toEqual(['Vorbește cu dr. Popescu.', 'Pe 5. iunie vin.']);
  });
});
