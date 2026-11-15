import { describe, test, expect } from 'vitest';
import JSZip from 'jszip';
import { parseDocx } from './parseDocx';

type P = { text: string; style?: string; bold?: boolean };

async function makeDocx(paras: P[]): Promise<ArrayBuffer> {
  const body = paras
    .map((p) => {
      const ppr = p.style ? `<w:pPr><w:pStyle w:val="${p.style}"/></w:pPr>` : '';
      const rpr = p.bold ? '<w:rPr><w:b/></w:rPr>' : '';
      return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${p.text}</w:t></w:r></w:p>`;
    })
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  const zip = new JSZip();
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'arraybuffer' });
}

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
