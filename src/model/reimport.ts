import { buildVideosFromImport, normalizeImport, stripOuterQuotes } from '../import/importModel';
import type { ImportedParagraph, ImportedVideo, ParsedVideo, ScriptDoc, Section, Video } from './types';

export const norm = (s: string) =>
  s.normalize('NFC').replace(/[ \s]+/g, ' ').trim();

/** One source paragraph in the old script: its sections (several if the user split it) and how to match it. */
interface Unit { members: number[]; key: string; hasOriginal: boolean }

function buildUnits(old: Section[]): Unit[] {
  const units: Unit[] = [];
  let i = 0;
  while (i < old.length) {
    const s = old[i];
    if (s.originalText === undefined) {
      units.push({ members: [i], key: norm(s.text), hasOriginal: false });
      i++;
      continue;
    }
    const key = norm(s.originalText);
    const keyStripped = norm(stripOuterQuotes(s.originalText));
    // Following sections with the same source belong to this unit only while they are pieces of a user split,
    // i.e. their texts joined rebuild the source paragraph. Two identical source paragraphs stay two units.
    let acc = norm(s.text);
    let j = i;
    while (
      acc !== key && acc !== keyStripped && j + 1 < old.length &&
      old[j + 1].originalText !== undefined && norm(old[j + 1].originalText!) === key
    ) {
      j++;
      acc += ' ' + norm(old[j].text);
    }
    const whole = acc === key || acc === keyStripped;
    if (!whole) j = i;
    units.push({ members: Array.from({ length: j - i + 1 }, (_, k) => i + k), key, hasOriginal: true });
    i = j + 1;
  }
  return units;
}

/** Find the old sections for one new source paragraph; returns indexes into `old` or null. */
function findMatch(old: Section[], units: Unit[], usedUnit: boolean[], para: ImportedParagraph): number[] | null {
  const source = norm(para.source);
  const text = norm(para.text);
  // 1) sections that remember their source paragraph
  for (let u = 0; u < units.length; u++) {
    if (!usedUnit[u] && units[u].hasOriginal && units[u].key === source) { usedUnit[u] = true; return units[u].members; }
  }
  // 2) older sections without originalText: single section, or a run of user-split pieces whose joined text matches
  for (let u = 0; u < units.length; u++) {
    if (usedUnit[u] || units[u].hasOriginal) continue;
    let acc = '';
    for (let k = u; k < units.length && !usedUnit[k] && !units[k].hasOriginal; k++) {
      acc = acc ? `${acc} ${units[k].key}` : units[k].key;
      if (acc === source || acc === text) {
        const members: number[] = [];
        for (let j = u; j <= k; j++) { usedUnit[j] = true; members.push(...units[j].members); }
        return members;
      }
      if (acc.length >= Math.max(source.length, text.length)) break;
    }
  }
  return null;
}

const signature = (videos: Video[], orphans: Section[]) =>
  JSON.stringify([
    videos.map((v) => [v.id, v.title, v.notes ?? '', v.group ?? null, v.sections.map((s) => [s.id, s.text])]),
    orphans.map((s) => s.id),
  ]);

export function countNewOrphans(before: ScriptDoc, after: ScriptDoc): number {
  const known = new Set(before.orphans.map((s) => s.id));
  return after.orphans.filter((s) => !known.has(s.id)).length;
}

export function reimport(old: ScriptDoc, input: ImportedVideo[] | ParsedVideo[], now: number): ScriptDoc {
  const imported = normalizeImport(input);
  const groupOf = (g: string | null | undefined) => norm(g ?? '');

  // Match videos to old ones: every title match first (against the title as originally imported),
  // then position for what is left, only when the old video has no group or the same group.
  const taken = new Set<string>();
  const matches: (Video | undefined)[] = imported.map(() => undefined);
  imported.forEach((p, i) => {
    const m = old.videos.find((v) => !taken.has(v.id) && norm(v.originalTitle ?? v.title) === norm(p.title));
    if (m) { matches[i] = m; taken.add(m.id); }
  });
  imported.forEach((p, i) => {
    if (matches[i]) return;
    const m = old.videos[i];
    if (m && !taken.has(m.id) && (!m.group || groupOf(m.group) === groupOf(p.group))) { matches[i] = m; taken.add(m.id); }
  });

  const orphans: Section[] = [...old.orphans];
  const videos: Video[] = [];
  imported.forEach((p, idx) => {
    const match = matches[idx];
    const fresh = buildVideosFromImport([p], now)[0];
    if (!match) {
      videos.push(fresh);
      return;
    }
    const units = buildUnits(match.sections);
    const usedUnit = units.map(() => false);
    const sections: Section[] = [];
    p.paragraphs.forEach((para, i) => {
      const members = findMatch(match.sections, units, usedUnit, para);
      if (!members) { sections.push(fresh.sections[i]); return; }
      for (const k of members) {
        const s = match.sections[k];
        sections.push({
          ...s,
          originalText: s.originalText ?? para.source,
          suggestedLocation: s.suggestedLocation ?? (s.location ? null : para.suggestedLocation ?? null),
        });
      }
    });
    units.forEach((u, k) => { if (!usedUnit[k]) u.members.forEach((m) => orphans.push(match.sections[m])); });

    const srcTitle = norm(match.originalTitle ?? match.title);
    const titleChanged = norm(p.title) !== srcTitle;
    const srcNotes = norm(match.originalNotes ?? '');
    const notesChanged = norm(p.notes) !== srcNotes;
    const userEditedNotes = norm(match.notes ?? '') !== norm(match.originalNotes ?? '');
    videos.push({
      id: match.id,
      title: titleChanged ? p.title : match.title,
      originalTitle: titleChanged ? p.title : match.originalTitle ?? p.title,
      notes: userEditedNotes ? match.notes ?? '' : notesChanged ? p.notes : match.notes ?? '',
      originalNotes: notesChanged ? p.notes : match.originalNotes ?? '',
      group: p.group,
      sections,
    });
  });

  for (const v of old.videos) if (!taken.has(v.id)) orphans.push(...v.sections);
  const changed = signature(videos, orphans) !== signature(old.videos, old.orphans);
  return { ...old, videos, orphans, updatedAt: changed ? now : old.updatedAt };
}
