import { describe, expect, test } from 'vitest';
import { createMemoryBackend, createMemoryRepo } from './memoryRepo';
import { setVideoNotes, setVideoTitle, setText } from '../model/sections';
import type { ScriptData } from './types';

const noErr = () => {};

async function world() {
  const backend = createMemoryBackend();
  const boss = createMemoryRepo({ backend, user: { email: 'boss@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
  const c1 = await boss.createClient('Acme');
  await boss.setMembers(c1, ['anna@x.com', 'bob@x.com']);
  const anna = createMemoryRepo({ backend, user: { email: 'anna@x.com', name: 'A' }, adminEmail: 'boss@x.com' });
  const bob = createMemoryRepo({ backend, user: { email: 'bob@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
  const { scriptId } = await anna.addScript(c1, 's.docx', [
    { title: 'First', paragraphs: ['a', 'b'] },
    { title: 'Second', paragraphs: ['c'] },
  ]);
  const get = (r: typeof anna) => { let d: ScriptData | null = null; r.watchScript(c1, scriptId, (x) => { d = x; }, noErr)(); return d!; };
  return { c1, scriptId, anna, bob, get };
}

describe('MemoryRepo video fields', () => {
  test('two members editing different videos titles from stale copies both survive', async () => {
    const w = await world();
    const sa = w.get(w.anna);
    const sb = w.get(w.bob);
    const va = setVideoTitle(sa.doc.videos[0], 'First (anna)');
    const vb = setVideoTitle(sb.doc.videos[1], 'Second (bob)');
    await w.anna.saveScript(w.c1, w.scriptId, sa, { ...sa.doc, videos: [va, sa.doc.videos[1]] });
    await w.bob.saveScript(w.c1, w.scriptId, sb, { ...sb.doc, videos: [sb.doc.videos[0], vb] });
    expect(w.get(w.anna).doc.videos.map((v) => v.title)).toEqual(['First (anna)', 'Second (bob)']);
  });

  test('a notes edit and a text edit reach the other member and keep the originals', async () => {
    const w = await world();
    const s = w.get(w.anna);
    const v0 = setText(setVideoNotes(s.doc.videos[0], 'my notes'), s.doc.videos[0].sections[0].id, 'a (fixed)', 9);
    await w.anna.saveScript(w.c1, w.scriptId, s, { ...s.doc, videos: [v0, s.doc.videos[1]] });
    const seen = w.get(w.bob).doc.videos[0];
    expect(seen.notes).toBe('my notes');
    expect(seen.sections[0]).toMatchObject({ text: 'a (fixed)', originalText: 'a' });
    expect(seen.originalTitle).toBe('First');
  });
});
