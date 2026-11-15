import { describe, test, expect } from 'vitest';
import { recordLocation, suggest } from './recentLocations';

describe('recentLocations', () => {
  test('most recent first, case-insensitive dedupe keeps latest spelling, capped', () => {
    expect(recordLocation(['Kitchen', 'Office'], 'kitchen')).toEqual(['kitchen', 'Office']);
    expect(recordLocation(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
  test('prefix match, then substring', () => {
    expect(suggest(['Living room', 'Kitchen', 'Backyard kitchen'], 'kit')).toEqual(['Kitchen', 'Backyard kitchen']);
  });
  test('empty prefix returns recents up to limit', () => {
    expect(suggest(['a', 'b', 'c'], '', 2)).toEqual(['a', 'b']);
  });
  test('diacritics-insensitive', () => {
    expect(suggest(['Birou', 'Bîrlad'], 'bir')).toEqual(['Birou', 'Bîrlad']);
  });
});
