import type { Section, Video } from './types';

/**
 * Moving words between sections. Port of the auto-caption editor's card rules
 * (moveWordsToAdjacentCard / carveWordsIntoOwnCard): only a section's EDGE words can move, so the order of the
 * script never changes. Refused moves return the very same video plus a plain reason.
 */
export type MoveResult = { video: Video; rejected?: string };

const newId = () => crypto.randomUUID();
export const wordsOf = (text: string): string[] => text.trim().split(/\s+/).filter(Boolean);

function refuse(video: Video, why: string): MoveResult {
  return { video, rejected: why };
}

export function moveWordsToAdjacentSection(
  video: Video,
  sectionId: string,
  wordStart: number,
  wordEnd: number,
  direction: 'prev' | 'next',
  now: number,
): MoveResult {
  const i = video.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) return refuse(video, 'paragraph not found');
  const src = video.sections[i];
  const ws = wordsOf(src.text);
  if (wordStart < 0 || wordEnd > ws.length || wordStart >= wordEnd) return refuse(video, 'nothing selected to move');
  const di = direction === 'prev' ? i - 1 : i + 1;
  if (di < 0 || di >= video.sections.length) {
    return refuse(video, direction === 'prev' ? 'there is no previous paragraph' : 'there is no next paragraph');
  }
  if (direction === 'prev' && wordStart !== 0) return refuse(video, "only the paragraph's first word(s) can move to the previous paragraph");
  if (direction === 'next' && wordEnd !== ws.length) return refuse(video, "only the paragraph's last word(s) can move to the next paragraph");

  const moving = ws.slice(wordStart, wordEnd).join(' ');
  const remaining = [...ws.slice(0, wordStart), ...ws.slice(wordEnd)].join(' ');
  const dest = video.sections[di];
  const newDest: Section = {
    ...dest,
    text: direction === 'prev' ? `${dest.text.trim()} ${moving}` : `${moving} ${dest.text.trim()}`,
    updatedAt: now,
  };
  const sections = [...video.sections];
  sections[di] = newDest;
  if (remaining) sections[i] = { ...src, text: remaining, updatedAt: now };
  else sections.splice(i, 1);
  return { video: { ...video, sections } };
}

export function carveWordsIntoSection(
  video: Video,
  sectionId: string,
  wordStart: number,
  wordEnd: number,
  side: 'before' | 'after',
  now: number,
): MoveResult {
  const i = video.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) return refuse(video, 'paragraph not found');
  const src = video.sections[i];
  const ws = wordsOf(src.text);
  if (wordStart < 0 || wordEnd > ws.length || wordStart >= wordEnd) return refuse(video, 'nothing selected to carve out');
  if (wordEnd - wordStart === ws.length) return refuse(video, 'select fewer words than the whole paragraph');
  if (side === 'before' && wordStart !== 0) return refuse(video, "only a paragraph's first word(s) can become a paragraph above it");
  if (side === 'after' && wordEnd !== ws.length) return refuse(video, "only a paragraph's last word(s) can become a paragraph below it");

  const carved = ws.slice(wordStart, wordEnd).join(' ');
  const remaining = [...ws.slice(0, wordStart), ...ws.slice(wordEnd)].join(' ');
  const created: Section = {
    id: newId(),
    text: carved,
    location: src.location,
    done: false,
    updatedAt: now,
    ...(src.originalText !== undefined ? { originalText: src.originalText } : {}),
  };
  const sections = [...video.sections];
  sections[i] = { ...src, text: remaining, updatedAt: now };
  sections.splice(side === 'before' ? i : i + 1, 0, created);
  return { video: { ...video, sections } };
}
