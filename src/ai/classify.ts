import { stripOuterQuotes, stripSpokenQuotes } from '../import/importModel';
import type { ImportedVideo } from '../model/types';

export interface SourceParagraph { index: number; text: string; style: string; bold: boolean }

export type AiLabelName = 'group' | 'title' | 'spoken' | 'notes' | 'publish' | 'cue' | 'ignore';
export interface AiLabel { i: number; label: AiLabelName; cue?: string }
export type Classifier = (paragraphs: SourceParagraph[]) => Promise<AiLabel[]>;

export type AiUnavailableReason = 'quota' | 'network' | 'invalid' | 'too-large' | 'disabled';
export class AiUnavailable extends Error {
  constructor(public reason: AiUnavailableReason, message: string = reason) {
    super(message);
    this.name = 'AiUnavailable';
  }
}

export const LABELS: AiLabelName[] = ['group', 'title', 'spoken', 'notes', 'publish', 'cue', 'ignore'];

const PROMPT_TEXT_LIMIT = 600;

export function buildClassifyRequest(paragraphs: SourceParagraph[]): { prompt: string; schema: object } {
  const items = paragraphs.map((p) => ({
    i: p.index,
    style: p.style || undefined,
    bold: p.bold || undefined,
    text: p.text.length > PROMPT_TEXT_LIMIT ? p.text.slice(0, PROMPT_TEXT_LIMIT) + '…' : p.text,
  }));
  const prompt = [
    'You are reading a document that contains scripts for short videos, usually in Romanian.',
    'Label EVERY paragraph with exactly one label:',
    '- group: a heading that groups several videos (for example a brand or section name).',
    '- title: the title of one video (often numbered, like "1. Something").',
    '- spoken: text that is read aloud by the presenter (often inside „quotes”). If you are unsure, use spoken.',
    '- notes: filming or photography directions, shot lists, production notes, metadata about the video (for example paragraphs starting "Cadre și foto").',
    '- publish: a publishing date or posting instruction.',
    '- cue: a short filming-cue line on its own (for example "Filmare tipografie") that names where or what to film for the text that follows.',
    '- ignore: empty decoration, page furniture or anything else that is not part of any video.',
    'If a spoken paragraph begins with a filming cue glued to its first words (for example "Filmare pvc În 2000, am intrat…"), keep the label spoken and put the exact cue text, copied character for character from the start of that paragraph, in the "cue" field. Otherwise leave "cue" out.',
    'NEVER copy, rewrite, correct or translate any of the document text. Return only labels and paragraph numbers.',
    'Return a JSON array with one object per paragraph, using the paragraph number as "i".',
    'Paragraphs:',
    JSON.stringify(items),
  ].join('\n');
  const schema = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        i: { type: 'integer' },
        label: { type: 'string', enum: LABELS },
        cue: { type: 'string' },
      },
      required: ['i', 'label'],
    },
  };
  return { prompt, schema };
}

const startsWithQuote = (s: string) => /^[„"“«]/.test(s.trim());
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const SHORT_LINE = (s: string) => s.trim().length <= 80 && wordCount(s) <= 10 && !startsWithQuote(s);
const FURNITURE = /^[\d\s.\-–—|•*_=)(:]+$/;

/** What follows a cue: a dash or colon separator is not part of the spoken text. */
const afterCue = (text: string, cue: string) => text.trimStart().slice(cue.length).trim().replace(/^[-–—:]\s*/, '');

/**
 * A glued filming cue is only accepted when it is clearly a short phrase at the very start of the paragraph:
 * at most 80 characters and 12 words, no digits or sentence punctuation, ending at a word boundary, and the rest
 * (after an optional dash) must begin like a new sentence. Anything else would cut spoken words off, so the cue
 * is dropped.
 */
export function validCue(paragraph: string, cue: string): boolean {
  const text = paragraph.trimStart();
  if (!cue || !text.startsWith(cue)) return false;
  if (cue.length > 80 || wordCount(cue) > 12 || startsWithQuote(cue) || /[\d.!?;:]/.test(cue)) return false;
  if (!/\s/.test(text.charAt(cue.length))) return false;
  const remainder = afterCue(text, cue);
  return remainder.length >= 3 && /^[\p{Lu}\p{N}„"“«]/u.test(remainder);
}

/** Downgrades labels that would make text vanish or be misused; doubt always ends up as spoken text or Notes. */
function effectiveLabel(l: AiLabel, p: SourceParagraph): AiLabelName {
  const text = p.text.trim();
  switch (l.label) {
    case 'group':
    case 'cue':
      return SHORT_LINE(text) ? l.label : 'spoken';
    case 'title':
      return text.length <= 200 && !startsWithQuote(text) ? 'title' : 'spoken';
    case 'ignore':
      return text.length <= 12 || FURNITURE.test(text) ? 'ignore' : 'notes';
    default:
      return l.label;
  }
}

/**
 * Checks the model's answer. Returns one label per paragraph (missing ones default to `spoken`),
 * or null when the answer is unusable.
 */
export function validateLabels(raw: unknown, paragraphs: SourceParagraph[]): AiLabel[] | null {
  if (!Array.isArray(raw)) return null;
  const byIndex = new Map<number, AiLabel>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { i, label, cue } = item as { i?: unknown; label?: unknown; cue?: unknown };
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= paragraphs.length) continue;
    if (typeof label !== 'string' || !LABELS.includes(label as AiLabelName)) continue;
    if (byIndex.has(i)) continue;
    const out: AiLabel = { i, label: label as AiLabelName };
    if (typeof cue === 'string' && cue.trim() && label === 'spoken' && validCue(paragraphs[i].text, cue.trim())) {
      out.cue = cue.trim();
    }
    byIndex.set(i, out);
  }
  if (byIndex.size < paragraphs.length / 2) return null;
  return paragraphs.map((_, i) => byIndex.get(i) ?? { i, label: 'spoken' as const });
}

const cleanCue = (cue: string) => cue.replace(/^\s*filmare\s+/i, '').replace(/\s*[-–—:]\s*$/, '').trim();
const numberOnly = /^[\d\s.\-–—)(:]+$/;

/** Builds the videos from labels. Every piece of text comes from the source paragraphs. */
export function assembleImport(paragraphs: SourceParagraph[], labels: AiLabel[]): ImportedVideo[] {
  const byIndex = new Map(labels.map((l) => [l.i, l]));
  const videos: ImportedVideo[] = [];
  let group: string | null = null;
  let current: ImportedVideo | null = null;
  let standaloneCue: string | null = null;
  const noteParts = new Map<ImportedVideo, string[]>();

  const ensureVideo = (): ImportedVideo => {
    if (!current) {
      current = { title: 'Untitled', group, notes: '', paragraphs: [] };
      videos.push(current);
    }
    return current;
  };

  for (const p of paragraphs) {
    const raw = byIndex.get(p.index) ?? { i: p.index, label: 'spoken' as const };
    const l: AiLabel = { ...raw, label: effectiveLabel(raw, p) };
    const text = p.text.trim();
    const addNote = (v: ImportedVideo, line: string) => {
      const parts = noteParts.get(v) ?? [];
      parts.push(line);
      noteParts.set(v, parts);
    };
    switch (l.label) {
      case 'group':
        group = text;
        current = null;
        standaloneCue = null;
        break;
      case 'title': {
        const stripped = stripOuterQuotes(text);
        const title = numberOnly.test(stripped) ? `Video ${stripped.replace(/\D/g, '') || videos.length + 1}` : stripped;
        current = { title, group, notes: '', paragraphs: [] };
        videos.push(current);
        standaloneCue = null;
        break;
      }
      case 'notes':
      case 'publish':
        addNote(ensureVideo(), text);
        break;
      case 'cue':
        // the cue text stays visible in Notes as well as becoming a suggestion
        addNote(ensureVideo(), text);
        standaloneCue = cleanCue(text) || null;
        break;
      case 'spoken': {
        const v = ensureVideo();
        if (l.cue && validCue(text, l.cue)) {
          addNote(v, l.cue);
          const remainder = afterCue(text, l.cue);
          v.paragraphs.push({ source: text, text: stripSpokenQuotes(remainder), suggestedLocation: cleanCue(l.cue) || null });
          standaloneCue = null;
        } else {
          v.paragraphs.push({ source: text, text: stripSpokenQuotes(text), suggestedLocation: standaloneCue });
        }
        break;
      }
      case 'ignore':
        break;
    }
  }
  for (const [v, parts] of noteParts) v.notes = parts.join('\n\n');
  return videos;
}
