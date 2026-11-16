import type { ScriptDoc, Video } from './types';

/** Splits a video before the card at `index`: that card and everything after it become a new video right after it. */
export function splitVideoInDoc(doc: ScriptDoc, videoId: string, index: number): { doc: ScriptDoc; newId: string } | null {
  const at = doc.videos.findIndex((v) => v.id === videoId);
  if (at < 0) return null;
  const v = doc.videos[at];
  if (!Number.isInteger(index) || index < 1 || index >= v.sections.length) return null;
  const title = `${v.title} (2)`;
  const second: Video = {
    id: crypto.randomUUID(), title, group: v.group ?? null, notes: '', originalTitle: title, originalNotes: '',
    sections: v.sections.slice(index),
  };
  const first: Video = { ...v, sections: v.sections.slice(0, index) };
  const videos = [...doc.videos];
  videos.splice(at, 1, first, second);
  return { doc: { ...doc, videos }, newId: second.id };
}

/** Joins a video onto the end of the video before it. The earlier video keeps its title; notes and B-roll are combined. */
export function mergeVideoIntoPrevious(doc: ScriptDoc, videoId: string): { doc: ScriptDoc; intoId: string } | null {
  const at = doc.videos.findIndex((v) => v.id === videoId);
  if (at < 1) return null;
  const prev = doc.videos[at - 1];
  const cur = doc.videos[at];
  const notes = [prev.notes ?? '', cur.notes ?? ''].filter((n) => n.trim()).join('\n\n');
  const broll = [...(prev.broll ?? []), ...(cur.broll ?? [])];
  const merged: Video = {
    ...prev,
    sections: [...prev.sections, ...cur.sections],
    notes,
    // the joined notes are the user's own now, so they must not be replaced by a later re-import
    originalNotes: prev.originalNotes ?? '',
    ...(broll.length ? { broll } : {}),
  };
  const videos = [...doc.videos];
  videos.splice(at - 1, 2, merged);
  return { doc: { ...doc, videos }, intoId: prev.id };
}
