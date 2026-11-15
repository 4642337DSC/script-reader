import { describe, expect, test } from 'vitest';
import { assembleImport, buildClassifyRequest, validateLabels, type AiLabel } from './classify';
import { fixtureLabels, fixtureParagraphs } from './fixtures';
import { readDocxParagraphs } from '../docx/parseDocx';
import { makeDocx } from '../testing/makeDocx';

const paragraphs = fixtureParagraphs();

describe('assembleImport on the fixture', () => {
  const videos = assembleImport(paragraphs, fixtureLabels());

  test('produces the videos in order, grouped under their brand headings', () => {
    expect(videos.map((v) => [v.group, v.title])).toEqual([
      ['Example Print', '1. A gift that stays on the desk'],
      ['Example Print', '2. What goes under the tree for colleagues?'],
      ['Example Print', '3. A year in twelve pages'],
      ['Example Print', '4. The wedding starts with an envelope'],
      ['Example Print', 'Video 5'],
      ['Example Shop', '6. Three gifts for people who love to create'],
      ['Example Shop', '11. Example.ro · The story began in Gorj'],
    ]);
  });

  test('spoken text is the source paragraph minus one outer quote pair, and only that', () => {
    const first = videos[0].paragraphs[0];
    expect(first.source).toBe(paragraphs[2].text);
    expect(first.text).toBe('What would you give a partner you worked with all year? A pen they like to use. Tell us who it is for.');
    expect(videos[0].paragraphs).toHaveLength(1);
  });

  test('filming and publishing notes go to Notes, never into spoken sections', () => {
    expect(videos[0].notes).toBe(paragraphs[3].text);
    expect(videos[3].notes).toBe(`${paragraphs[12].text}\n\n${paragraphs[13].text}`);
    const allSpoken = videos.flatMap((v) => v.paragraphs.map((p) => p.source));
    expect(allSpoken.some((t) => t.startsWith('Cadre și foto'))).toBe(false);
    expect(allSpoken.some((t) => t.startsWith('Publicare'))).toBe(false);
  });

  test('an untitled video (number only) is named Video N and keeps its bold spoken text', () => {
    expect(videos[4].paragraphs).toHaveLength(1);
    expect(videos[4].paragraphs[0].text.startsWith('We are going digital')).toBe(true);
  });

  test('the anniversary film: metadata lines are notes, standalone cue applies to what follows, glued cues are split', () => {
    const film = videos[6];
    expect(film.notes).toBe(`${paragraphs[21].text}\n\n${paragraphs[22].text}`);
    expect(film.paragraphs.map((p) => [p.text, p.suggestedLocation ?? null])).toEqual([
      ['„In 1992 the story began with a stationery shop, with things people needed every day.', 'SHOP EXAMPLE'],
      ["In 1994 we opened the print shop. We put clients' ideas on paper.", 'tipografie'],
      ['In 2000 we entered PVC joinery.', 'pvc'],
      ['This year we turn 35. Thank you all.”', null],
    ]);
    expect(film.paragraphs[1].source).toBe(paragraphs[25].text);
  });

  test('a video with no spoken text still exists; spoken text before any title goes to Untitled', () => {
    const p = [
      { index: 0, text: 'Some spoken line', style: '', bold: false },
      { index: 1, text: 'Empty video', style: 'Heading3', bold: true },
    ];
    const v = assembleImport(p, [{ i: 0, label: 'spoken' }, { i: 1, label: 'title' }]);
    expect(v.map((x) => [x.title, x.paragraphs.length])).toEqual([['Untitled', 1], ['Empty video', 0]]);
  });
});

describe('validateLabels', () => {
  test('drops out-of-range, duplicate and unknown labels; missing paragraphs default to spoken', () => {
    const raw = [
      { i: 0, label: 'group' }, { i: 0, label: 'title' }, { i: 99, label: 'notes' }, { i: 1, label: 'banana' },
      ...fixtureLabels().slice(2),
    ];
    const out = validateLabels(raw, paragraphs)!;
    expect(out).toHaveLength(paragraphs.length);
    expect(out[0]).toEqual({ i: 0, label: 'group' });
    expect(out[1]).toEqual({ i: 1, label: 'spoken' });
  });

  test('a cue that is not at the very start of the paragraph is dropped', () => {
    const raw = fixtureLabels().map((l) => (l.i === 25 ? { ...l, cue: 'print shop' } : l));
    expect(validateLabels(raw, paragraphs)![25].cue).toBeUndefined();
    const whole = fixtureLabels().map((l) => (l.i === 26 ? { ...l, cue: paragraphs[26].text } : l));
    expect(validateLabels(whole, paragraphs)![26].cue).toBeUndefined();
  });

  test('anything that is not an array, or covers under half the paragraphs, is rejected', () => {
    expect(validateLabels({ nope: 1 }, paragraphs)).toBeNull();
    expect(validateLabels('text', paragraphs)).toBeNull();
    expect(validateLabels([{ i: 0, label: 'group' }], paragraphs)).toBeNull();
  });

  test('model output cannot change any visible text, only reference paragraphs by index', () => {
    const raw: unknown[] = fixtureLabels().map((l) => ({ ...l, text: 'INVENTED', title: 'INVENTED' }));
    const labels = validateLabels(raw, paragraphs) as AiLabel[];
    const joined = JSON.stringify(assembleImport(paragraphs, labels));
    expect(joined).not.toContain('INVENTED');
  });
});

describe('buildClassifyRequest', () => {
  test('lists every paragraph with its index, style and bold hint, and asks for labels only', () => {
    const { prompt, schema } = buildClassifyRequest(paragraphs);
    expect(prompt).toContain('"i":0');
    expect(prompt).toContain('Heading2');
    expect(prompt.toLowerCase()).toContain('never');
    expect(JSON.stringify(schema)).toContain('spoken');
  });
});

describe('readDocxParagraphs', () => {
  test('returns text, heading style and bold per non-empty paragraph, in order', async () => {
    const bytes = await makeDocx([{ text: 'Title', style: 'Heading2' }, { text: '   ' }, { text: 'Note', bold: true }, { text: 'plain' }]);
    expect(await readDocxParagraphs(bytes)).toEqual([
      { index: 0, text: 'Title', style: 'Heading2', bold: false },
      { index: 1, text: 'Note', style: '', bold: true },
      { index: 2, text: 'plain', style: '', bold: false },
    ]);
  });
});
