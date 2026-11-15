import { describe, expect, test, vi } from 'vitest';
import { buildBrollRequest, validateShots } from './broll';
import { createGeminiBroller } from './gemini';
import { smartImport } from '../import/smartImport';
import { AiUnavailable, type Classifier } from './classify';
import { makeDocx } from '../testing/makeDocx';

const NOTES = 'Cadre și foto. Penița pe hârtie în primul cadru, apoi mesajul, agenda și cutia închisă. Fotografiem stiloul separat și două seturi complete.';
const items = [{ index: 0, notes: NOTES }, { index: 2, notes: 'Filmăm la tejghea, cu un coleg care pune două modele reale unul lângă altul.' }];

describe('buildBrollRequest', () => {
  test('lists each video\'s notes with its number and demands exact copies', () => {
    const { prompt, schema } = buildClassifyShots();
    expect(prompt).toContain('"i":0');
    expect(prompt).toContain('Penița pe hârtie');
    expect(prompt.toLowerCase()).toContain('exactly');
    expect(JSON.stringify(schema)).toContain('shots');
  });
  function buildClassifyShots() { return buildBrollRequest(items); }
});

describe('validateShots only keeps shots that really are in the notes', () => {
  test('keeps verbatim pieces, case and spacing aside, and returns them per video', () => {
    const raw = [
      { i: 0, shots: ['Penița pe hârtie în primul cadru', 'mesajul', 'AGENDA', 'cutia  închisă', 'stiloul separat'] },
      { i: 2, shots: ['la tejghea'] },
    ];
    const r = validateShots(raw, items)!;
    expect(r.get(0)).toEqual(['Penița pe hârtie în primul cadru', 'mesajul', 'AGENDA', 'cutia închisă', 'stiloul separat']);
    expect(r.get(2)).toEqual(['la tejghea']);
  });

  test('drops invented, too short, too long and duplicate shots', () => {
    const long = 'x'.repeat(161);
    const raw = [{ i: 0, shots: ['o fotografie cu un câine', 'a', long, 'agenda', 'Agenda', 'cutia închisă'] }];
    expect(validateShots(raw, items)!.get(0)).toEqual(['agenda', 'cutia închisă']);
  });

  test('ignores videos it was not asked about, caps a video at 20 shots, and rejects non-lists', () => {
    const many = Array.from({ length: 30 }, (_, i) => 'cadru ' + i);
    const notes = many.join(', ');
    const r = validateShots([{ i: 5, shots: ['agenda'] }, { i: 1, shots: many }], [{ index: 1, notes }])!;
    expect(r.has(5)).toBe(false);
    expect(r.get(1)).toHaveLength(20);
    expect(validateShots({ nope: 1 }, items)).toBeNull();
    expect(validateShots('text', items)).toBeNull();
  });
});

describe('createGeminiBroller', () => {
  test('turns the model answer into shots per video, and refuses an unusable answer', async () => {
    const good = vi.fn().mockResolvedValue(JSON.stringify([{ i: 0, shots: ['mesajul', 'agenda', 'invented thing'] }]));
    const r = await createGeminiBroller(good)(items);
    expect(r).toEqual([{ index: 0, shots: ['mesajul', 'agenda'] }]);
    await expect(createGeminiBroller(vi.fn().mockResolvedValue('not json'))(items)).rejects.toBeInstanceOf(AiUnavailable);
    await expect(createGeminiBroller(vi.fn().mockRejectedValue({ status: 429 }))(items)).rejects.toBeInstanceOf(AiUnavailable);
  });
});

describe('B-roll during smartImport', () => {
  const doc = () => makeDocx([
    { text: 'Example', style: 'Heading2' }, { text: '1. First', style: 'Heading3' },
    { text: '„Say this.”' }, { text: 'Cadre și foto. Penița pe hârtie, apoi agenda.', bold: true },
    { text: '2. Second', style: 'Heading3' }, { text: '„No notes here.”' },
  ]);
  const classify: Classifier = async (ps) => ps.map((p) => ({
    i: p.index,
    label: p.style === 'Heading2' ? 'group' : p.style === 'Heading3' ? 'title' : p.text.startsWith('Cadre') ? 'notes' : 'spoken',
  }));

  test('videos with filming notes get their shots; videos without notes are not sent', async () => {
    const extractBroll = vi.fn().mockResolvedValue([{ index: 0, shots: ['Penița pe hârtie', 'agenda'] }]);
    const r = await smartImport(await doc(), { classify, extractBroll, scriptExists: false });
    expect(extractBroll).toHaveBeenCalledTimes(1);
    expect(extractBroll.mock.calls[0][0].map((x: { index: number }) => x.index)).toEqual([0]);
    expect(r.videos[0].broll).toEqual(['Penița pe hârtie', 'agenda']);
    expect(r.videos[1].broll).toBeUndefined();
  });

  test('if the shot extraction fails the import still succeeds, just without a list', async () => {
    const extractBroll = vi.fn().mockRejectedValue(new AiUnavailable('quota'));
    const r = await smartImport(await doc(), { classify, extractBroll, scriptExists: false });
    expect(r.mode).toBe('ai');
    expect(r.videos[0].broll).toBeUndefined();
  });

  test('shots the model invented are never stored, even if the extractor returns them', async () => {
    const extractBroll = vi.fn().mockResolvedValue([{ index: 0, shots: ['agenda', 'a unicorn in the studio'] }]);
    const r = await smartImport(await doc(), { classify, extractBroll, scriptExists: false });
    expect(r.videos[0].broll).toEqual(['agenda']);
  });

  test('the basic reading makes no shot list', async () => {
    const extractBroll = vi.fn();
    const failing: Classifier = vi.fn().mockRejectedValue(new AiUnavailable('quota'));
    const r = await smartImport(await doc(), { classify: failing, extractBroll, scriptExists: false });
    expect(r.mode).toBe('basic');
    expect(extractBroll).not.toHaveBeenCalled();
  });
});
