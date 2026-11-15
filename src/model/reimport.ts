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

export function reimport(old: ScriptDoc, parsed: ParsedVideo[], now: number): ScriptDoc {
  const usedVideo = new Set<string>();
  const orphans: Section[] = [...old.orphans];
  const videos: Video[] = [];

  parsed.forEach((p, idx) => {
    const byTitle = old.videos.find((v) => !usedVideo.has(v.id) && norm(v.title) === norm(p.title));
    const byIndex = old.videos[idx] && !usedVideo.has(old.videos[idx].id) ? old.videos[idx] : undefined;
    const match = byTitle ?? byIndex;
    if (!match) {
      videos.push(buildVideos([p], now)[0]);
      return;
    }
    usedVideo.add(match.id);
    const used = match.sections.map(() => false);
    const fresh = buildVideos([{ title: p.title, paragraphs: p.paragraphs }], now)[0];
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

  for (const v of old.videos) if (!usedVideo.has(v.id)) orphans.push(...v.sections);
  return { ...old, videos, orphans, updatedAt: now };
}
