import JSZip from 'jszip';
import type { ParsedVideo } from '../model/types';
import type { SourceParagraph } from '../ai/classify';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MAX_BOLD_TITLE = 120;

interface RawPara { text: string; style: string; allBold: boolean }

function readParagraphs(xml: string): RawPara[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('bad xml');
  const out: RawPara[] = [];
  for (const p of Array.from(doc.getElementsByTagNameNS(W, 'p'))) {
    const runs = Array.from(p.getElementsByTagNameNS(W, 'r'));
    let text = '';
    let allBold = runs.length > 0;
    for (const r of runs) {
      const t = Array.from(r.childNodes).map((n) => ((n as Element).localName === 't' ? n.textContent ?? '' : (n as Element).localName === 'br' || (n as Element).localName === 'tab' ? ' ' : '')).join('');
      if (!t) continue;
      text += t;
      const b = r.getElementsByTagNameNS(W, 'b')[0];
      const isBold = !!b && b.getAttributeNS(W, 'val') !== '0' && b.getAttributeNS(W, 'val') !== 'false';
      if (!isBold) allBold = false;
    }
    const style = p.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') ?? '';
    out.push({ text: text.trim(), style, allBold });
  }
  return out.filter((p) => p.text.length > 0);
}

async function loadParagraphs(bytes: ArrayBuffer): Promise<RawPara[]> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const file = zip.file('word/document.xml');
    if (!file) throw new Error('no document.xml');
    return readParagraphs(await file.async('string'));
  } catch {
    throw new Error('not a valid .docx');
  }
}

/** Every non-empty paragraph with its heading style and bold flag, for AI classification. */
export async function readDocxParagraphs(bytes: ArrayBuffer): Promise<SourceParagraph[]> {
  const paras = await loadParagraphs(bytes);
  return paras.map((p, index) => ({ index, text: p.text, style: p.style, bold: p.allBold }));
}

export async function parseDocx(bytes: ArrayBuffer): Promise<ParsedVideo[]> {
  const paras = await loadParagraphs(bytes);

  const isHeading = (p: RawPara) => /^(Heading|Title|Titlu|Antet)/i.test(p.style);
  const hasHeadings = paras.some(isHeading);
  const isTitle = hasHeadings
    ? isHeading
    : (p: RawPara) => p.allBold && p.text.length <= MAX_BOLD_TITLE;

  const videos: ParsedVideo[] = [];
  let current: ParsedVideo | null = null;
  for (const p of paras) {
    if (isTitle(p)) {
      current = { title: p.text, paragraphs: [] };
      videos.push(current);
    } else {
      if (!current) {
        current = { title: 'Untitled', paragraphs: [] };
        videos.push(current);
      }
      current.paragraphs.push(p.text);
    }
  }
  return videos;
}
