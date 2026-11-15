import type { BrollItem, Section, Video } from '../model/types';
import type { BrollRow, ScriptData, ScriptDoc, SectionRow, VideoRow } from './types';

type Patch = Partial<Omit<SectionRow, 'id'>>;
type VideoPatch = Partial<Omit<VideoRow, 'id'>>;

const STEP = 1000;

/** Gives every id an increasing order value, keeping known values that are still increasing. */
function orderSequence(ids: string[], known: Record<string, number>): Record<string, number> {
  const valid: boolean[] = [];
  let last = -Infinity;
  for (const id of ids) {
    const k = known[id];
    const ok = k !== undefined && k > last;
    valid.push(ok);
    if (ok) last = k;
  }
  const out: Record<string, number> = {};
  let i = 0;
  while (i < ids.length) {
    if (valid[i]) { out[ids[i]] = known[ids[i]]; i++; continue; }
    let j = i;
    while (j < ids.length && !valid[j]) j++;
    const prev = i > 0 ? out[ids[i - 1]] : undefined;
    const next = j < ids.length ? known[ids[j]] : undefined;
    const n = j - i;
    for (let k = 0; k < n; k++) {
      out[ids[i + k]] =
        prev !== undefined && next !== undefined ? prev + ((next - prev) * (k + 1)) / (n + 1)
        : prev !== undefined ? prev + STEP * (k + 1)
        : next !== undefined ? next - STEP * (n - k)
        : STEP * (k + 1);
    }
    i = j;
  }
  return out;
}

export function assignOrders(doc: ScriptDoc, known: Record<string, number>): Record<string, number> {
  const ids = [...doc.videos.flatMap((v) => v.sections), ...doc.orphans].map((s) => s.id);
  return orderSequence(ids, known);
}

export function assignVideoOrders(doc: ScriptDoc, known: Record<string, number>): Record<string, number> {
  return orderSequence(doc.videos.map((v) => v.id), known);
}

export function assignBrollOrders(doc: ScriptDoc, known: Record<string, number>): Record<string, number> {
  return orderSequence(doc.videos.flatMap((v) => (v.broll ?? []).map((b) => b.id)), known);
}

export function legacyVideoRows(videos: { id: string; title: string }[]): VideoRow[] {
  return videos.map((v, i) => ({
    id: v.id, title: v.title, group: null, notes: '', originalTitle: v.title, originalNotes: '', order: STEP * (i + 1),
  }));
}

export function flattenDoc(
  doc: ScriptDoc,
  orders: Record<string, number>,
  videoOrders: Record<string, number> = assignVideoOrders(doc, {}),
  brollOrders: Record<string, number> = assignBrollOrders(doc, {}),
): { videos: VideoRow[]; rows: SectionRow[]; broll: BrollRow[] } {
  const row = (s: Section, videoId: string | null): SectionRow => ({
    id: s.id, videoId, order: orders[s.id], text: s.text, location: s.location,
    done: s.done, updatedAt: s.updatedAt, orphaned: videoId === null,
    originalText: s.originalText ?? null, suggestedLocation: s.suggestedLocation ?? null, tag: s.tag ?? null,
  });
  return {
    videos: doc.videos.map((v): VideoRow => ({
      id: v.id, title: v.title, group: v.group ?? null, notes: v.notes ?? '',
      originalTitle: v.originalTitle ?? v.title, originalNotes: v.originalNotes ?? '', order: videoOrders[v.id],
    })),
    rows: [...doc.videos.flatMap((v) => v.sections.map((s) => row(s, v.id))), ...doc.orphans.map((s) => row(s, null))],
    broll: doc.videos.flatMap((v) => (v.broll ?? []).map((b): BrollRow => ({
      id: b.id, videoId: v.id, order: brollOrders[b.id], text: b.text, done: b.done, updatedAt: b.updatedAt, originalText: b.originalText ?? null,
    }))),
  };
}

export function assembleDoc(id: string, name: string, videos: VideoRow[], rows: SectionRow[], broll: BrollRow[] = []): ScriptData {
  const sortedBroll = [...broll].sort((a, b) => a.order - b.order);
  const toItem = (r: BrollRow): BrollItem => ({
    id: r.id, text: r.text, done: r.done, updatedAt: r.updatedAt, ...(r.originalText !== null ? { originalText: r.originalText } : {}),
  });
  const sorted = [...rows].sort((a, b) => a.order - b.order);
  const sortedVideos = [...videos].sort((a, b) => a.order - b.order);
  const toSection = (r: SectionRow): Section => ({
    id: r.id, text: r.text, location: r.location, done: r.done, updatedAt: r.updatedAt,
    ...(r.originalText !== null ? { originalText: r.originalText } : {}),
    ...(r.suggestedLocation !== null ? { suggestedLocation: r.suggestedLocation } : {}),
    ...(r.tag ? { tag: r.tag as Section['tag'] } : {}),
  });
  const vids: Video[] = sortedVideos.map((v) => ({
    id: v.id, title: v.title, group: v.group, notes: v.notes, originalTitle: v.originalTitle, originalNotes: v.originalNotes,
    sections: sorted.filter((r) => !r.orphaned && r.videoId === v.id).map(toSection),
    ...(sortedBroll.some((b) => b.videoId === v.id) ? { broll: sortedBroll.filter((b) => b.videoId === v.id).map(toItem) } : {}),
  }));
  const orders: Record<string, number> = {};
  sorted.forEach((r) => { orders[r.id] = r.order; });
  const videoOrders: Record<string, number> = {};
  sortedVideos.forEach((v) => { videoOrders[v.id] = v.order; });
  const brollOrders: Record<string, number> = {};
  sortedBroll.forEach((b) => { brollOrders[b.id] = b.order; });
  return {
    doc: {
      fileId: id, name, videos: vids,
      orphans: sorted.filter((r) => r.orphaned).map(toSection),
      updatedAt: rows.reduce((m, r) => Math.max(m, r.updatedAt), 0),
    },
    orders,
    videoOrders,
    brollOrders,
  };
}

const FIELDS = ['videoId', 'order', 'text', 'location', 'done', 'orphaned', 'originalText', 'suggestedLocation', 'tag', 'updatedAt'] as const;

export function diffRows(before: SectionRow[], after: SectionRow[]) {
  const old = new Map(before.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const sets: SectionRow[] = [];
  const updates: { id: string; patch: Patch }[] = [];
  for (const r of after) {
    seen.add(r.id);
    const o = old.get(r.id);
    if (!o) { sets.push(r); continue; }
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) if (o[f] !== r[f]) patch[f] = r[f];
    if (Object.keys(patch).length && !('updatedAt' in patch)) patch.updatedAt = r.updatedAt;
    if (Object.keys(patch).length) updates.push({ id: r.id, patch: patch as Patch });
  }
  const deletes = before.filter((r) => !seen.has(r.id)).map((r) => r.id);
  return { sets, updates, deletes };
}

const BROLL_FIELDS = ['videoId', 'order', 'text', 'done', 'originalText', 'updatedAt'] as const;

export function diffBroll(before: BrollRow[], after: BrollRow[]) {
  const old = new Map(before.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const sets: BrollRow[] = [];
  const updates: { id: string; patch: Partial<Omit<BrollRow, 'id'>> }[] = [];
  for (const r of after) {
    seen.add(r.id);
    const o = old.get(r.id);
    if (!o) { sets.push(r); continue; }
    const patch: Record<string, unknown> = {};
    for (const f of BROLL_FIELDS) if (o[f] !== r[f]) patch[f] = r[f];
    if (Object.keys(patch).length && !('updatedAt' in patch)) patch.updatedAt = r.updatedAt;
    if (Object.keys(patch).length) updates.push({ id: r.id, patch: patch as Partial<Omit<BrollRow, 'id'>> });
  }
  const deletes = before.filter((r) => !seen.has(r.id)).map((r) => r.id);
  return { sets, updates, deletes };
}

const VIDEO_FIELDS = ['title', 'group', 'notes', 'originalTitle', 'originalNotes', 'order'] as const;

export function diffVideos(before: VideoRow[], after: VideoRow[]) {
  const old = new Map(before.map((v) => [v.id, v]));
  const seen = new Set<string>();
  const sets: VideoRow[] = [];
  const updates: { id: string; patch: VideoPatch }[] = [];
  for (const v of after) {
    seen.add(v.id);
    const o = old.get(v.id);
    if (!o) { sets.push(v); continue; }
    const patch: Record<string, unknown> = {};
    for (const f of VIDEO_FIELDS) if (o[f] !== v[f]) patch[f] = v[f];
    if (Object.keys(patch).length) updates.push({ id: v.id, patch: patch as VideoPatch });
  }
  const deletes = before.filter((v) => !seen.has(v.id)).map((v) => v.id);
  return { sets, updates, deletes };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
