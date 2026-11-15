import { describe, expect, test } from 'vitest';
import { carveWordsIntoSection, moveWordsToAdjacentSection, wordsOf } from './wordMoves';
import { setLocation, toggleDone } from './sections';
import type { Video } from './types';

const mk = (): Video => ({
  id: 'v', title: 'T',
  sections: [
    { id: 'a', text: 'one two three four', location: 'Kitchen', done: true, updatedAt: 1, originalText: 'one two three four' },
    { id: 'b', text: 'five six seven', location: 'Office', done: false, updatedAt: 1, originalText: 'five six seven' },
    { id: 'c', text: 'eight nine', location: null, done: false, updatedAt: 1, originalText: 'eight nine' },
  ],
});
const texts = (v: Video) => v.sections.map((s) => s.text);

describe('wordsOf', () => {
  test('splits on any whitespace and ignores empty pieces', () => {
    expect(wordsOf('  a  b\n c ')).toEqual(['a', 'b', 'c']);
    expect(wordsOf('   ')).toEqual([]);
  });
});

describe('moveWordsToAdjacentSection', () => {
  test('the last words of a section move to the start of the next one', () => {
    const r = moveWordsToAdjacentSection(mk(), 'a', 2, 4, 'next', 9);
    expect(r.rejected).toBeUndefined();
    expect(texts(r.video)).toEqual(['one two', 'three four five six seven', 'eight nine']);
  });

  test('the first words of a section move to the end of the previous one', () => {
    const r = moveWordsToAdjacentSection(mk(), 'b', 0, 2, 'prev', 9);
    expect(texts(r.video)).toEqual(['one two three four five six', 'seven', 'eight nine']);
  });

  test('each section keeps its own location and done state; only the two touched sections get a new updatedAt', () => {
    let v = setLocation(mk(), 'a', 'Kitchen', 1);
    v = toggleDone(toggleDone(v, 'b', 1), 'b', 1);
    const r = moveWordsToAdjacentSection(v, 'a', 3, 4, 'next', 9);
    const [a, b, c] = r.video.sections;
    expect([a.location, a.done, a.updatedAt]).toEqual(['Kitchen', true, 9]);
    expect([b.location, b.done, b.updatedAt]).toEqual(['Office', false, 9]);
    expect(c.updatedAt).toBe(1);
  });

  test('moving every word empties the source, which disappears', () => {
    const r = moveWordsToAdjacentSection(mk(), 'c', 0, 2, 'prev', 9);
    expect(texts(r.video)).toEqual(['one two three four', 'five six seven eight nine']);
    expect(r.video.sections.map((s) => s.id)).toEqual(['a', 'b']);
  });

  test.each([
    ['a span in the middle to the next paragraph', 'a', 1, 2, 'next', 'last word'],
    ['a span in the middle to the previous paragraph', 'b', 1, 2, 'prev', 'first word'],
    ['the first paragraph to a previous one that does not exist', 'a', 0, 1, 'prev', 'no previous'],
    ['the last paragraph to a next one that does not exist', 'c', 1, 2, 'next', 'no next'],
    ['an empty span', 'b', 1, 1, 'next', 'nothing selected'],
    ['a span past the end', 'b', 1, 9, 'next', 'nothing selected'],
    ['an unknown section', 'zzz', 0, 1, 'next', 'not found'],
  ] as const)('refuses %s with a plain reason and leaves the video untouched', (_name, id, s, e, dir, why) => {
    const v = mk();
    const r = moveWordsToAdjacentSection(v, id, s, e, dir, 9);
    expect(r.rejected).toMatch(new RegExp(why, 'i'));
    expect(r.video).toBe(v);
  });
});

describe('carveWordsIntoSection', () => {
  test('the last words become a new section below, with the same location and not done', () => {
    const r = carveWordsIntoSection(mk(), 'a', 2, 4, 'after', 9);
    expect(r.rejected).toBeUndefined();
    expect(texts(r.video)).toEqual(['one two', 'three four', 'five six seven', 'eight nine']);
    const [a, n] = r.video.sections;
    expect(n.id).not.toBe(a.id);
    expect(n).toMatchObject({ location: 'Kitchen', done: false, originalText: 'one two three four', updatedAt: 9 });
    expect(a).toMatchObject({ done: true, updatedAt: 9 });
  });

  test('the first words become a new section above', () => {
    const r = carveWordsIntoSection(mk(), 'b', 0, 1, 'before', 9);
    expect(texts(r.video)).toEqual(['one two three four', 'five', 'six seven', 'eight nine']);
    expect(r.video.sections[1]).toMatchObject({ location: 'Office', done: false });
  });

  test.each([
    ['a span in the middle below', 'a', 1, 2, 'after', 'last word'],
    ['a span in the middle above', 'a', 1, 2, 'before', 'first word'],
    ['the whole paragraph', 'c', 0, 2, 'after', 'whole paragraph'],
    ['an empty span', 'a', 2, 2, 'after', 'nothing selected'],
  ] as const)('refuses %s', (_name, id, s, e, side, why) => {
    const v = mk();
    const r = carveWordsIntoSection(v, id, s, e, side, 9);
    expect(r.rejected).toMatch(new RegExp(why, 'i'));
    expect(r.video).toBe(v);
  });
});
