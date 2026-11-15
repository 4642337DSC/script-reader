import { buildVideos } from './sections';
import type { ParsedVideo, ScriptDoc, Section, Video } from './types';

export const norm = (s: string) =>
  s.normalize('NFC').replace(/[ \s]+/g, ' ').trim();

/** Find the earliest run of consecutive unconsumed old sections whose joined text equals `target`. */
function findRun(old: Section[], used: boolean[], target: string): [number, number] | null {
  for (let j = 0; j < old.length; j++) {
    if (used[j]) continue;
    let acc = '';
    for (let k = j; k < old.length && !used[k]; k++) {
      acc = acc ? `${acc} ${norm(old[k].text)}` : norm(old[k].text);
      if (acc === target) return [j, k];
      if (acc.length >= target.length) break;
    }
  }
  return null;
}

const signature = (videos: Video[], orphans: Section[]) =>
  JSON.stringify([videos.map((v) => [v.id, v.title, v.sections.map((s) => [s.id, s.text])]), orphans.map((s) => s.id)]);

export function reimport(old: ScriptDoc, parsed: ParsedVideo[], now: number): ScriptDoc {
  // Match videos to old ones: every title match first, then position for whatever is left.
  const taken = new Set<string>();
  const matches: (Video | undefined)[] = parsed.map(() => undefined);
  parsed.forEach((p, i) => {
    const m = old.videos.find((v) => !taken.has(v.id) && norm(v.title) === norm(p.title));
    if (m) { matches[i] = m; taken.add(m.id); }
  });
  parsed.forEach((_, i) => {
    if (matches[i]) return;
    const m = old.videos[i];
    if (m && !taken.has(m.id)) { matches[i] = m; taken.add(m.id); }
  });

  const orphans: Section[] = [...old.orphans];
  const videos: Video[] = [];
  parsed.forEach((p, idx) => {
    const match = matches[idx];
    if (!match) {
      videos.push(buildVideos([p], now)[0]);
      return;
    }
    const used = match.sections.map(() => false);
    const fresh = buildVideos([p], now)[0];
    const sections: Section[] = [];
    p.paragraphs.forEach((para, i) => {
      const run = findRun(match.sections, used, norm(para));
      if (!run) {
        sections.push(fresh.sections[i]);
        return;
      }
      for (let k = run[0]; k <= run[1]; k++) {
        used[k] = true;
        sections.push(match.sections[k]);
      }
    });
    match.sections.forEach((s, k) => { if (!used[k]) orphans.push(s); });
    videos.push({ id: match.id, title: p.title, sections });
  });

  for (const v of old.videos) if (!taken.has(v.id)) orphans.push(...v.sections);
  const changed = signature(videos, orphans) !== signature(old.videos, old.orphans);
  return { ...old, videos, orphans, updatedAt: changed ? now : old.updatedAt };
}
