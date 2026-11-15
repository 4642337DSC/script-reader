import JSZip from 'jszip';

export type P = { text: string; style?: string; bold?: boolean };

export async function makeDocx(paras: P[]): Promise<ArrayBuffer> {
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
