import { describe, expect, test } from 'vitest';
import { cycleTag, TAGS } from './sections';
import { carveWordsIntoSection } from './wordMoves';
import { reimport } from './reimport';
import { buildVideosFromImport } from '../import/importModel';
import { assembleDoc, assignOrders, assignVideoOrders, diffRows, flattenDoc } from '../data/docOps';
import { createMemoryBackend, createMemoryRepo } from '../data/memoryRepo';
import type { ScriptData } from '../data/types';
import type { ScriptDoc, Video } from './types';

const mk = (): Video => ({
  id: 'v', title: 'T',
  sections: [
    { id: 'a', text: 'one two three', location: null, done: false, updatedAt: 1 },
    { id: 'b', text: 'four five', location: null, done: false, updatedAt: 1 },
  ],
});

describe('shot tags', () => {
  test('the order is none, voiceover, wide, medium, closeup, none', () => {
    expect(TAGS).toEqual(['voiceover', 'wide', 'medium', 'closeup']);
    let v = mk();
    const seen: (string | undefined)[] = [];
    for (let i = 0; i < 5; i++) {
      v = cycleTag(v, 'a', 10 + i);
      seen.push(v.sections[0].tag);
    }
    expect(seen).toEqual(['voiceover', 'wide', 'medium', 'closeup', undefined]);
  });

  test('cycling bumps updatedAt on that card only and ignores unknown ids', () => {
    const v = mk();
    const r = cycleTag(v, 'a', 9);
    expect(r.sections[0].updatedAt).toBe(9);
    expect(r.sections[1]).toBe(v.sections[1]);
    expect(cycleTag(v, 'zzz', 9)).toBe(v);
  });

  test('a card carved out of a tagged card keeps the tag; splitting keeps it on both halves', () => {
    const v = cycleTag(mk(), 'a', 2);
    const carved = carveWordsIntoSection(v, 'a', 2, 3, 'after', 5).video;
    expect(carved.sections.map((s) => s.tag)).toEqual(['voiceover', 'voiceover', undefined]);
  });

  test('a re-import keeps the tag on unchanged text', () => {
    const doc: ScriptDoc = {
      fileId: 's', name: 'n', orphans: [], updatedAt: 1,
      videos: buildVideosFromImport([{ title: 'T', group: null, notes: '', paragraphs: [{ source: 'a', text: 'a' }, { source: 'b', text: 'b' }] }], 1),
    };
    doc.videos[0] = cycleTag(doc.videos[0], doc.videos[0].sections[1].id, 2);
    const r = reimport(doc, [{ title: 'T', group: null, notes: '', paragraphs: [{ source: 'a', text: 'a' }, { source: 'b', text: 'b' }] }], 9);
    expect(r.videos[0].sections.map((s) => s.tag)).toEqual([undefined, 'voiceover']);
  });
});

describe('shot tags in the data layer', () => {
  const docOf = (v: Video): ScriptDoc => ({ fileId: 's', name: 'n', videos: [v], orphans: [], updatedAt: 1 });

  test('flatten and assemble keep the tag, and a tag change is a one-field patch', () => {
    const before = docOf(mk());
    const after = docOf(cycleTag(mk(), 'b', 7));
    const o = assignOrders(before, {});
    const vo = assignVideoOrders(before, {});
    const rowsBefore = flattenDoc(before, o, vo);
    const rowsAfter = flattenDoc(after, o, vo);
    expect(diffRows(rowsBefore.rows, rowsAfter.rows).updates).toEqual([{ id: 'b', patch: { tag: 'voiceover', updatedAt: 7 } }]);
    const back = assembleDoc('s', 'n', rowsAfter.videos, rowsAfter.rows);
    expect(back.doc.videos[0].sections.map((s) => s.tag)).toEqual([undefined, 'voiceover']);
  });

  test('a tag set by one member reaches another and can be cleared again', async () => {
    const backend = createMemoryBackend();
    const boss = createMemoryRepo({ backend, user: { email: 'boss@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
    const c1 = await boss.createClient('Acme');
    await boss.setMembers(c1, ['anna@x.com', 'bob@x.com']);
    const anna = createMemoryRepo({ backend, user: { email: 'anna@x.com', name: 'A' }, adminEmail: 'boss@x.com' });
    const bob = createMemoryRepo({ backend, user: { email: 'bob@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
    const { scriptId } = await anna.addScript(c1, 's.docx', [{ title: 'T', paragraphs: ['x', 'y'] }]);
    const get = (r: typeof anna) => { let d: ScriptData | null = null; r.watchScript(c1, scriptId, (x) => { d = x; }, () => {})(); return d!; };
    const s0 = get(anna);
    await anna.saveScript(c1, scriptId, s0, { ...s0.doc, videos: [cycleTag(s0.doc.videos[0], s0.doc.videos[0].sections[0].id, 5)] });
    expect(get(bob).doc.videos[0].sections.map((s) => s.tag)).toEqual(['voiceover', undefined]);
    const s1 = get(bob);
    let v = s1.doc.videos[0];
    for (let i = 0; i < 4; i++) v = cycleTag(v, v.sections[0].id, 6 + i);
    await bob.saveScript(c1, scriptId, s1, { ...s1.doc, videos: [v] });
    expect(get(anna).doc.videos[0].sections[0].tag).toBeUndefined();
  });
});
