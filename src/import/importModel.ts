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

/**
 * Quote handling for spoken text. A Romanian quotation can open („) in one paragraph and close (”) in a later one,
 * so besides a matching outer pair this also removes an opening „ that never closes inside the paragraph, and a
 * closing ” that never opened inside it. Quotes in the middle of the text are left alone.
 */
export function stripSpokenQuotes(s: string): string {
  const t = s.trim();
  const pair = stripOuterQuotes(t);
  if (pair !== t) return pair;
  if (t.startsWith('„') && !t.includes('”') && !t.includes('“')) return t.slice(1).trim();
  if (t.endsWith('”') && !t.includes('„')) return t.slice(0, -1).trim();
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

const ABBREV = /(?:^|\s)(?:dr|nr|str|etc|prof|ing|sc|bd|jud|av|ex)\.$/i;

/** Splits spoken text into sentences (a new sentence starts with a capital letter after . ! ? or …). */
export function splitSentences(text: string): string[] {
  const parts = text.trim().split(/(?<=[.!?…]["”»)]?)\s+(?=[„"«(]?\p{Lu})/u);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && (ABBREV.test(out[out.length - 1]) || /(?:^|\s)\d+\.$/.test(out[out.length - 1]))) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out.filter((x) => x.trim());
}

export function buildVideosFromImport(imported: ImportedVideo[], now: number): Video[] {
  return imported.map((v) => ({
    id: crypto.randomUUID(),
    title: v.title,
    group: v.group,
    notes: v.notes,
    originalTitle: v.title,
    originalNotes: v.notes,
    ...(v.broll?.length
      ? { broll: v.broll.map((text) => ({ id: crypto.randomUUID(), text, done: false, updatedAt: now, originalText: text })) }
      : {}),
    sections: v.paragraphs.flatMap((p) => splitSentences(p.text).map((sentence) => ({
      id: crypto.randomUUID(),
      text: sentence,
      location: null,
      done: false,
      updatedAt: now,
      originalText: p.source,
      ...(p.suggestedLocation ? { suggestedLocation: p.suggestedLocation } : {}),
    }))),
  }));
}
