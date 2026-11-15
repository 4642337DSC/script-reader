/** Paragraph text is rendered word by word, so tests find a paragraph by its whole text content instead. */
export function para(container: ParentNode, text: string): HTMLElement | null {
  return (Array.from(container.querySelectorAll('.section .text')) as HTMLElement[]).find((el) => (el.textContent ?? '').trim() === text) ?? null;
}

export function paraTexts(container: ParentNode): string[] {
  return (Array.from(container.querySelectorAll('.section .text')) as HTMLElement[]).map((el) => (el.textContent ?? '').trim());
}

/** The clickable word span inside a paragraph. */
export function wordIn(container: ParentNode, paragraph: string, word: string, nth = 0): HTMLElement {
  const p = para(container, paragraph);
  if (!p) throw new Error('paragraph not found: ' + paragraph);
  const hits = (Array.from(p.querySelectorAll('.w')) as HTMLElement[]).filter((el) => el.textContent === word);
  if (!hits[nth]) throw new Error('word not found: ' + word);
  return hits[nth];
}
