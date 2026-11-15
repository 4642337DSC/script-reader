import type { Section, Video } from '../model/types';
import type { ScriptData, ScriptDoc, SectionRow } from './types';

type VideoMeta = { id: string; title: string };
type Patch = Partial<Omit<SectionRow, 'id'>>;

const STEP = 1000;

export function assignOrders(doc: ScriptDoc, known: Record<string, number>): Record<string, number> {
  const ids = [...doc.videos.flatMap((v) => v.sections), ...doc.orphans].map((s) => s.id);
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

export function flattenDoc(doc: ScriptDoc, orders: Record<string, number>): { videos: VideoMeta[]; rows: SectionRow[] } {
  const row = (s: Section, videoId: string | null): SectionRow => ({
    id: s.id, videoId, order: orders[s.id], text: s.text, location: s.location,
    done: s.done, updatedAt: s.updatedAt, orphaned: videoId === null,
  });
  return {
    videos: doc.videos.map((v) => ({ id: v.id, title: v.title })),
    rows: [...doc.videos.flatMap((v) => v.sections.map((s) => row(s, v.id))), ...doc.orphans.map((s) => row(s, null))],
  };
}

export function assembleDoc(id: string, name: string, videos: VideoMeta[], rows: SectionRow[]): ScriptData {
  const sorted = [...rows].sort((a, b) => a.order - b.order);
  const toSection = (r: SectionRow): Section => ({ id: r.id, text: r.text, location: r.location, done: r.done, updatedAt: r.updatedAt });
  const vids: Video[] = videos.map((v) => ({
    ...v,
    sections: sorted.filter((r) => !r.orphaned && r.videoId === v.id).map(toSection),
  }));
  const orders: Record<string, number> = {};
  sorted.forEach((r) => { orders[r.id] = r.order; });
  return {
    doc: {
      fileId: id, name, videos: vids,
      orphans: sorted.filter((r) => r.orphaned).map(toSection),
      updatedAt: rows.reduce((m, r) => Math.max(m, r.updatedAt), 0),
    },
    orders,
  };
}

const FIELDS = ['videoId', 'order', 'text', 'location', 'done', 'orphaned', 'updatedAt'] as const;

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

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
