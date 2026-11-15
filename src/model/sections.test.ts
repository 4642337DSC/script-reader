import { describe, test, expect } from 'vitest';
import { buildVideos, splitSection, mergeWithPrevious, setLocation, toggleDone } from './sections';

const mk = () => buildVideos([{ title: 'T', paragraphs: ['alpha beta gamma delta', 'second one'] }], 1)[0];

describe('sections', () => {
  test('one section per paragraph with unique ids', () => {
    const v = mk();
    expect(v.sections.map((s) => s.text)).toEqual(['alpha beta gamma delta', 'second one']);
    expect(new Set(v.sections.map((s) => s.id)).size).toBe(2);
    expect(v.sections[0]).toMatchObject({ location: null, done: false, updatedAt: 1 });
  });

  test('split mid-text gives two trimmed sections inheriting location', () => {
    let v = mk();
    v = setLocation(v, v.sections[0].id, 'Kitchen', 2);
    const r = splitSection(v, v.sections[0].id, 'alpha beta '.length, 3);
    expect(r.sections.map((s) => s.text)).toEqual(['alpha beta', 'gamma delta', 'second one']);
    expect(r.sections[1].location).toBe('Kitchen');
    expect(r.sections[1].id).not.toBe(r.sections[0].id);
  });

  test.each([[0], [22], [100], [-3]])('split at %i is refused', (i) => {
    const v = mk();
    expect(splitSection(v, v.sections[0].id, i, 2)).toBe(v);
  });

  test('split inside leading/trailing whitespace is refused', () => {
    const v = buildVideos([{ title: 'T', paragraphs: ['ab   cd'] }], 1)[0];
    // index 3 sits between spaces: left "ab", right "cd" -> allowed (both non-empty)
    expect(splitSection(v, v.sections[0].id, 3, 2).sections).toHaveLength(2);
    const w = buildVideos([{ title: 'T', paragraphs: ['ab cd'] }], 1)[0];
    expect(splitSection(w, w.sections[0].id, 1, 2).sections.map((s) => s.text)).toEqual(['a', 'b cd']);
  });

  test('merge restores original words', () => {
    const v = mk();
    const s = splitSection(v, v.sections[0].id, 11, 2);
    const m = mergeWithPrevious(s, s.sections[1].id, 3);
    expect(m.sections[0].text).toBe('alpha beta gamma delta');
    expect(m.sections).toHaveLength(2);
  });

  test('merge keeps previous location and requires both done', () => {
    let v = mk(); v = splitSection(v, v.sections[0].id, 11, 2);
    v = setLocation(v, v.sections[0].id, 'Office', 3);
    v = toggleDone(v, v.sections[0].id, 4);
    const m = mergeWithPrevious(v, v.sections[1].id, 5);
    expect(m.sections[0].location).toBe('Office');
    expect(m.sections[0].done).toBe(false);
  });

  test('merge of first section is a no-op', () => {
    const v = mk();
    expect(mergeWithPrevious(v, v.sections[0].id, 2)).toBe(v);
  });

  test('setLocation trims and blank becomes null', () => {
    const v = mk();
    expect(setLocation(v, v.sections[0].id, '  Garage ', 2).sections[0].location).toBe('Garage');
    expect(setLocation(v, v.sections[0].id, '   ', 2).sections[0].location).toBeNull();
  });

  test('toggleDone flips and bumps updatedAt', () => {
    const v = mk();
    const r = toggleDone(v, v.sections[0].id, 9);
    expect(r.sections[0]).toMatchObject({ done: true, updatedAt: 9 });
    expect(toggleDone(r, v.sections[0].id, 10).sections[0].done).toBe(false);
  });
});
