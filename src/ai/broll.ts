/** Splits each video's filming notes into separate B-roll shots. Best effort, and never invents anything. */
export interface BrollAsk { index: number; notes: string }
export type Broller = (items: BrollAsk[]) => Promise<{ index: number; shots: string[] }[]>;

const MIN_SHOT = 2;
const MAX_SHOT = 160;
const MAX_PER_VIDEO = 20;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

export function buildBrollRequest(items: BrollAsk[]): { prompt: string; schema: object } {
  const prompt = [
    'Below are the filming notes of several short videos, usually in Romanian.',
    'For each video list the separate SHOTS the crew has to film, as a checklist.',
    'Every shot MUST be copied exactly, character for character, from that video\'s notes: a short phrase.',
    'You may leave out a leading connector word such as "apoi", "și" or "iar", but never rewrite, translate, summarise or add words.',
    'Skip the label "Cadre și foto." and anything that is not something to film or photograph.',
    'Return a JSON array with one object per video: {"i": <video number>, "shots": [<shot>, ...]}.',
    'Videos:',
    JSON.stringify(items.map((x) => ({ i: x.index, notes: x.notes }))),
  ].join('\n');
  const schema = {
    type: 'array',
    items: {
      type: 'object',
      properties: { i: { type: 'integer' }, shots: { type: 'array', items: { type: 'string' } } },
      required: ['i', 'shots'],
    },
  };
  return { prompt, schema };
}

/**
 * Checks the model's answer: a shot is kept only if it really occurs in that video's notes (ignoring case and
 * spacing), is a sensible length and is not a duplicate. Returns null when the answer is not a list at all.
 */
export function validateShots(raw: unknown, items: BrollAsk[]): Map<number, string[]> | null {
  if (!Array.isArray(raw)) return null;
  const notesOf = new Map(items.map((x) => [x.index, norm(x.notes).toLowerCase()]));
  const out = new Map<number, string[]>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { i, shots } = entry as { i?: unknown; shots?: unknown };
    if (typeof i !== 'number' || !notesOf.has(i) || !Array.isArray(shots)) continue;
    const notes = notesOf.get(i)!;
    const kept = out.get(i) ?? [];
    for (const s of shots) {
      if (typeof s !== 'string') continue;
      const shot = norm(s);
      if (shot.length < MIN_SHOT || shot.length > MAX_SHOT) continue;
      if (!notes.includes(shot.toLowerCase())) continue;
      if (kept.some((k) => k.toLowerCase() === shot.toLowerCase())) continue;
      if (kept.length >= MAX_PER_VIDEO) break;
      kept.push(shot);
    }
    if (kept.length) out.set(i, kept);
  }
  return out;
}
