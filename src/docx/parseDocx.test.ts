import { describe, test, expect } from 'vitest';
import { makeDocx } from '../testing/makeDocx';
import { parseDocx } from './parseDocx';

describe('parseDocx', () => {
  test('splits videos at heading-styled paragraphs', async () => {
    const r = await parseDocx(await makeDocx([
      { text: 'Video A', style: 'Heading1' }, { text: 'a1' }, { text: 'a2' },
      { text: 'Video B', style: 'Heading1' }, { text: 'b1' }, { text: 'b2' },
    ]));
    expect(r).toEqual([
      { title: 'Video A', paragraphs: ['a1', 'a2'] },
      { title: 'Video B', paragraphs: ['b1', 'b2'] },
    ]);
  });

  test('detects bold standalone short line as title when no heading styles exist', async () => {
    const r = await parseDocx(await makeDocx([
      { text: 'Titlu unu', bold: true }, { text: 'text unu' },
      { text: 'Titlu doi', bold: true }, { text: 'text doi' },
    ]));
    expect(r.map((v) => v.title)).toEqual(['Titlu unu', 'Titlu doi']);
    expect(r[1].paragraphs).toEqual(['text doi']);
  });

  test('text before first title becomes one video titled Untitled', async () => {
    const r = await parseDocx(await makeDocx([
      { text: 'orphan' }, { text: 'T', style: 'Heading1' }, { text: 'x' },
    ]));
    expect(r[0]).toEqual({ title: 'Untitled', paragraphs: ['orphan'] });
    expect(r[1].title).toBe('T');
  });

  test('file with no titles becomes one Untitled video', async () => {
    const r = await parseDocx(await makeDocx([{ text: 'one' }, { text: 'two' }]));
    expect(r).toEqual([{ title: 'Untitled', paragraphs: ['one', 'two'] }]);
  });

  test('empty paragraphs are dropped and diacritics preserved', async () => {
    const r = await parseDocx(await makeDocx([
      { text: 'Titlu', style: 'Heading1' }, { text: '   ' }, { text: 'Șoseaua țării ăâî' },
    ]));
    expect(r[0].paragraphs).toEqual(['Șoseaua țării ăâî']);
  });

  test('corrupt bytes throw "not a valid .docx"', async () => {
    await expect(parseDocx(new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow('not a valid .docx');
  });
});

describe('parseDocx (review fixes)', () => {
  test('I7: Romanian heading style ids (Titlu1) are titles', async () => {
    const r = await parseDocx(await makeDocx([{ text: 'Titlu video', style: 'Titlu1' }, { text: 'corp' }]));
    expect(r).toEqual([{ title: 'Titlu video', paragraphs: ['corp'] }]);
  });
  test('line breaks inside a paragraph keep the words apart', async () => {
    const r = await parseDocx(await makeDocx([{ text: 'T', style: 'Heading1' }, { text: 'word\nnext' }]));
    expect(r[0].paragraphs).toEqual(['word next']);
  });
});

describe('parseDocx (sample file)', () => {
  test('samples/Test script.docx parses into two titled videos', async () => {
    const { readFileSync } = await import('node:fs');
    const buf = readFileSync('samples/Test script.docx');
    const r = await parseDocx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    expect(r.map((v) => [v.title.slice(0, 7), v.paragraphs.length])).toEqual([['Video 1', 5], ['Video 2', 4]]);
  });
});
