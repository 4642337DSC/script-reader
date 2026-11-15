import type { ParsedVideo, Section, Video } from './types';

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
  const merged: Section = {
    ...prev,
    text: `${prev.text} ${cur.text}`,
    done: prev.done && cur.done,
    updatedAt: now,
  };
  const sections = [...video.sections];
  sections.splice(i - 1, 2, merged);
  return { ...video, sections };
}

export function setLocation(video: Video, sectionId: string, location: string | null, now: number): Video {
  const loc = location?.trim() || null;
  return mapSection(video, sectionId, (s) => ({ ...s, location: loc, updatedAt: now }));
}

export function toggleDone(video: Video, sectionId: string, now: number): Video {
  return mapSection(video, sectionId, (s) => ({ ...s, done: !s.done, updatedAt: now }));
}
