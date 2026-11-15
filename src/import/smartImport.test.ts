import { describe, expect, test, vi } from 'vitest';
import { basicImport, smartImport } from './smartImport';
import { AiUnavailable, type AiLabel, type Classifier } from '../ai/classify';
import { makeDocx } from '../testing/makeDocx';

const doc = () => makeDocx([
  { text: 'Example Print', style: 'Heading2' },
  { text: '1. First video', style: 'Heading3' },
  { text: '„Say this out loud.”' },
  { text: 'Cadre și foto. Film the desk.', bold: true },
]);

const labelByText: Classifier = async (ps) =>
  ps.map((p): AiLabel => ({
    i: p.index,
    label: p.style === 'Heading2' ? 'group' : p.style === 'Heading3' ? 'title' : p.text.startsWith('Cadre') ? 'notes' : 'spoken',
  }));

describe('smartImport', () => {
  test('AI success gives grouped videos with spoken text and notes', async () => {
    const r = await smartImport(await doc(), { classify: labelByText, scriptExists: false });
    expect(r.mode).toBe('ai');
    expect(r.notice).toBeUndefined();
    expect(r.videos).toHaveLength(1);
    expect(r.videos[0]).toMatchObject({ title: '1. First video', group: 'Example Print', notes: 'Cadre și foto. Film the desk.' });
    expect(r.videos[0].paragraphs.map((p) => p.text)).toEqual(['Say this out loud.']);
  });

  test.each([['quota'], ['network'], ['invalid'], ['too-large']] as const)(
    'a new script falls back to the basic reading with a notice when the AI says %s',
    async (reason) => {
      const classify: Classifier = vi.fn().mockRejectedValue(new AiUnavailable(reason));
      const r = await smartImport(await doc(), { classify, scriptExists: false });
      expect(r.mode).toBe('basic');
      expect(r.notice).toBe('AI reading unavailable, used the basic reading.');
      expect(r.videos.length).toBeGreaterThan(0);
      expect(r.videos.flatMap((v) => v.paragraphs.map((p) => p.text))).toContain('„Say this out loud.”');
    },
  );

  test('an existing script does not fall back silently: the AiUnavailable is thrown', async () => {
    const classify: Classifier = vi.fn().mockRejectedValue(new AiUnavailable('quota'));
    await expect(smartImport(await doc(), { classify, scriptExists: true })).rejects.toMatchObject({ name: 'AiUnavailable', reason: 'quota' });
  });

  test('without a classifier it behaves as AI disabled', async () => {
    const r = await smartImport(await doc(), { scriptExists: false });
    expect(r.mode).toBe('basic');
    await expect(smartImport(await doc(), { scriptExists: true })).rejects.toMatchObject({ reason: 'disabled' });
  });

  test('a classifier answer that produces no videos counts as invalid', async () => {
    const ignoreAll: Classifier = async (ps) => ps.map((p) => ({ i: p.index, label: 'ignore' as const }));
    const r = await smartImport(await doc(), { classify: ignoreAll, scriptExists: false });
    expect(r.mode).toBe('basic');
  });

  test('an answer with no spoken text at all (everything labelled notes) counts as invalid', async () => {
    const allNotes: Classifier = async (ps) => ps.map((p) => ({ i: p.index, label: 'notes' as const }));
    const r = await smartImport(await doc(), { classify: allNotes, scriptExists: false });
    expect(r.mode).toBe('basic');
    await expect(smartImport(await doc(), { classify: allNotes, scriptExists: true })).rejects.toMatchObject({ reason: 'invalid' });
  });

  test('a corrupt file still rejects with the usual message', async () => {
    await expect(smartImport(new Uint8Array([1, 2, 3]).buffer, { classify: labelByText, scriptExists: false })).rejects.toThrow('not a valid .docx');
  });
});

describe('basicImport', () => {
  test('is the rule-based reading in the import model', async () => {
    const v = await basicImport(await doc());
    expect(v.map((x) => [x.title, x.group, x.notes])).toEqual([['Example Print', null, ''], ['1. First video', null, '']]);
  });
});
