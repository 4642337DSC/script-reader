import type { BrollItem, ParsedVideo, Section, ShotTag, Video } from './types';
import { splitSentences, stripSpokenQuotes } from '../import/importModel';

const newId = () => crypto.randomUUID();

export function buildVideos(parsed: ParsedVideo[], now: number): Video[] {
  return parsed.map((p) => ({
    id: newId(),
    title: p.title,
    sections: p.paragraphs.map((text) => ({ id: newId(), text, location: null, done: false, updatedAt: now })),
  }));
}

function mapSection(video: Video, id: string, fn: (s: Section) => Section): Video {
  if (!video.sections.some((s) => s.id === id)) return video;
  return { ...video, sections: video.sections.map((s) => (s.id === id ? fn(s) : s)) };
}

export function splitSection(video: Video, sectionId: string, charIndex: number, now: number): Video {
  const i = video.sections.findIndex((s) => s.id === sectionId);
  if (i < 0 || !Number.isInteger(charIndex)) return video;
  const s = video.sections[i];
  const left = s.text.slice(0, charIndex).trim();
  const right = s.text.slice(charIndex).trim();
  if (charIndex <= 0 || !left || !right) return video;
  const a: Section = { ...s, text: left, updatedAt: now };
  const b: Section = { ...s, id: newId(), text: right, updatedAt: now };
  const sections = [...video.sections];
  sections.splice(i, 1, a, b);
  return { ...video, sections };
}

export function mergeWithPrevious(video: Video, sectionId: string, now: number): Video {
  const i = video.sections.findIndex((s) => s.id === sectionId);
  if (i <= 0) return video;
  const prev = video.sections[i - 1];
  const cur = video.sections[i];
  // pieces of one split paragraph share originalText; merging two different source paragraphs joins them
  const originalText =
    prev.originalText !== undefined && cur.originalText !== undefined && prev.originalText !== cur.originalText
      ? `${prev.originalText} ${cur.originalText}`
      : prev.originalText;
  const merged: Section = {
    ...prev,
    text: `${prev.text} ${cur.text}`,
    done: prev.done && cur.done,
    updatedAt: now,
    ...(originalText !== undefined ? { originalText } : {}),
  };
  const sections = [...video.sections];
  sections.splice(i - 1, 2, merged);
  return { ...video, sections };
}

export function setLocation(video: Video, sectionId: string, location: string | null, now: number): Video {
  const loc = location?.trim() || null;
  return mapSection(video, sectionId, (s) => ({ ...s, location: loc, updatedAt: now, ...(loc ? { suggestedLocation: null } : {}) }));
}

export function setText(video: Video, sectionId: string, text: string, now: number): Video {
  const t = text.trim();
  if (!t) return video;
  return mapSection(video, sectionId, (s) => ({ ...s, text: t, updatedAt: now, originalText: s.originalText ?? s.text }));
}

export function setVideoTitle(video: Video, title: string): Video {
  const t = title.trim();
  return t ? { ...video, title: t } : video;
}

export function setVideoNotes(video: Video, notes: string): Video {
  return { ...video, notes };
}

export function acceptSuggestion(video: Video, sectionId: string, now: number): Video {
  const s = video.sections.find((x) => x.id === sectionId);
  if (!s || !s.suggestedLocation) return video;
  return mapSection(video, sectionId, (x) => ({ ...x, location: x.suggestedLocation ?? null, suggestedLocation: null, updatedAt: now }));
}

export function dismissSuggestion(video: Video, sectionId: string, now: number): Video {
  const s = video.sections.find((x) => x.id === sectionId);
  if (!s || !s.suggestedLocation) return video;
  return mapSection(video, sectionId, (x) => ({ ...x, suggestedLocation: '', updatedAt: now }));
}

function mapBroll(video: Video, id: string, fn: (b: BrollItem) => BrollItem): Video {
  if (!video.broll?.some((b) => b.id === id)) return video;
  return { ...video, broll: video.broll.map((b) => (b.id === id ? fn(b) : b)) };
}

export function addBroll(video: Video, text: string, now: number): Video {
  const t = text.trim();
  if (!t) return video;
  return { ...video, broll: [...(video.broll ?? []), { id: newId(), text: t, done: false, updatedAt: now }] };
}

export function toggleBroll(video: Video, id: string, now: number): Video {
  return mapBroll(video, id, (b) => ({ ...b, done: !b.done, updatedAt: now }));
}

export function setBrollText(video: Video, id: string, text: string, now: number): Video {
  const t = text.trim();
  if (!t) return video;
  return mapBroll(video, id, (b) => ({ ...b, text: t, updatedAt: now }));
}

export function removeBroll(video: Video, id: string): Video {
  if (!video.broll?.some((b) => b.id === id)) return video;
  return { ...video, broll: video.broll.filter((b) => b.id !== id) };
}

export const TAGS: readonly ShotTag[] = ['voiceover', 'wide', 'medium', 'closeup'];

/** none -> voiceover -> wide -> medium -> closeup -> none */
export function cycleTag(video: Video, sectionId: string, now: number): Video {
  return mapSection(video, sectionId, (s) => {
    const { tag, ...rest } = s;
    const next = TAGS[(tag ? TAGS.indexOf(tag) : -1) + 1];
    return { ...rest, updatedAt: now, ...(next ? { tag: next } : {}) };
  });
}

export function toggleDone(video: Video, sectionId: string, now: number): Video {
  return mapSection(video, sectionId, (s) => ({ ...s, done: !s.done, updatedAt: now }));
}

/**
 * Splits every untouched one-piece card (its text still equals the imported paragraph) into one card per sentence.
 * The first piece keeps the card; the others copy its location, tick and tag. Returns the same video when nothing splits.
 */
export function splitUntouchedSentences(video: Video, now: number): Video {
  let changed = false;
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  const sections: Section[] = [];
  video.sections.forEach((s, i) => {
    const prev = video.sections[i - 1];
    const next = video.sections[i + 1];
    // older cards may have no originalText at all; they count as untouched one-piece cards
    const alone = s.originalText === undefined || (prev?.originalText !== s.originalText && next?.originalText !== s.originalText);
    const untouched = s.originalText === undefined || norm(s.text) === norm(s.originalText) || norm(s.text) === norm(stripSpokenQuotes(s.originalText));
    const pieces = alone && untouched ? splitSentences(s.text) : [];
    if (pieces.length < 2) { sections.push(s); return; }
    changed = true;
    pieces.forEach((t, n) => sections.push({ ...s, originalText: s.originalText ?? s.text, id: n === 0 ? s.id : newId(), text: t, updatedAt: n === 0 ? s.updatedAt : now }));
  });
  return changed ? { ...video, sections } : video;
}

/** Removes a card from the video. (The Undo button in the reader brings it back.) */
export function deleteSection(video: Video, sectionId: string): Video {
  if (!video.sections.some((s) => s.id === sectionId)) return video;
  return { ...video, sections: video.sections.filter((s) => s.id !== sectionId) };
}
