import type { ImportedVideo, ParsedVideo, Video } from '../model/types';

const QUOTE_PAIRS: [string, string][] = [
  ['„', '”'], ['„', '“'], ['"', '"'], ['“', '”'], ['«', '»'],
];

/** Removes exactly one outer quotation-mark pair; anything else is only trimmed. */
export function stripOuterQuotes(s: string): string {
  const t = s.trim();
  for (const [open, close] of QUOTE_PAIRS) {
    if (t.length >= 2 && t.startsWith(open) && t.endsWith(close)) return t.slice(1, -1).trim();
  }
  return t;
}

export function normalizeImport(input: ParsedVideo[] | ImportedVideo[]): ImportedVideo[] {
  // ImportedVideo always carries `notes`; ParsedVideo never does.
  if ((input as ImportedVideo[]).every((v) => 'notes' in v)) return input as ImportedVideo[];
  return (input as ParsedVideo[]).map((v) => ({
    title: v.title,
    group: null,
    notes: '',
    paragraphs: v.paragraphs.map((p) => ({ source: p, text: p })),
  }));
}

export function buildVideosFromImport(imported: ImportedVideo[], now: number): Video[] {
  return imported.map((v) => ({
    id: crypto.randomUUID(),
    title: v.title,
    group: v.group,
    notes: v.notes,
    originalTitle: v.title,
    originalNotes: v.notes,
    sections: v.paragraphs.map((p) => ({
      id: crypto.randomUUID(),
      text: p.text,
      location: null,
      done: false,
      updatedAt: now,
      originalText: p.source,
      suggestedLocation: p.suggestedLocation ?? null,
    })),
  }));
}
