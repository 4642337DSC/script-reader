import { describe, expect, test, vi } from 'vitest';
import { createGeminiClassifier, MAX_CHARS, MAX_PARAGRAPHS } from './gemini';
import { AiUnavailable, type AiLabel } from './classify';
import { fixtureLabels, fixtureParagraphs } from './fixtures';

const paragraphs = fixtureParagraphs();
const ok = (labels: AiLabel[] = fixtureLabels()) => vi.fn().mockResolvedValue(JSON.stringify(labels));
const reason = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as AiUnavailable | null;

describe('createGeminiClassifier', () => {
  test('valid JSON becomes labels, and the prompt carries the paragraphs', async () => {
    const generate = ok();
    const labels = await createGeminiClassifier(generate)(paragraphs);
    expect(labels).toHaveLength(paragraphs.length);
    expect(labels[0]).toEqual({ i: 0, label: 'group' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(String(generate.mock.calls[0][0])).toContain('Example Print');
  });

  test('JSON wrapped in a markdown fence is still accepted', async () => {
    const generate = vi.fn().mockResolvedValue('```json\n' + JSON.stringify(fixtureLabels()) + '\n```');
    expect(await createGeminiClassifier(generate)(paragraphs)).toHaveLength(paragraphs.length);
  });

  test('malformed JSON or an unusable answer is reported as invalid', async () => {
    const e1 = await reason(createGeminiClassifier(vi.fn().mockResolvedValue('not json'))(paragraphs));
    expect(e1).toBeInstanceOf(AiUnavailable);
    expect(e1!.reason).toBe('invalid');
    const e2 = await reason(createGeminiClassifier(vi.fn().mockResolvedValue('{"a":1}'))(paragraphs));
    expect(e2!.reason).toBe('invalid');
  });

  test.each([
    [{ status: 429 }],
    [{ customData: { status: 429 } }],
    [new Error('[429] RESOURCE_EXHAUSTED: quota exceeded')],
  ])('quota errors (%j) are reported as quota', async (err) => {
    const e = await reason(createGeminiClassifier(vi.fn().mockRejectedValue(err))(paragraphs));
    expect(e!.reason).toBe('quota');
  });

  test('network failures are reported as network', async () => {
    const e = await reason(createGeminiClassifier(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))(paragraphs));
    expect(e!.reason).toBe('network');
  });

  test.each([
    [new Error('Firebase AI Logic API has not been used in project or it is disabled')],
    [{ status: 403, message: 'PERMISSION_DENIED' }],
  ])('a service that is not enabled is reported as disabled', async (err) => {
    const e = await reason(createGeminiClassifier(vi.fn().mockRejectedValue(err))(paragraphs));
    expect(e!.reason).toBe('disabled');
  });

  test('an oversized document is refused without calling the model', async () => {
    const generate = ok();
    const many = Array.from({ length: MAX_PARAGRAPHS + 1 }, (_, index) => ({ index, text: 'x', style: '', bold: false }));
    expect((await reason(createGeminiClassifier(generate)(many)))!.reason).toBe('too-large');
    const long = [{ index: 0, text: 'y'.repeat(MAX_CHARS + 1), style: '', bold: false }];
    expect((await reason(createGeminiClassifier(generate)(long)))!.reason).toBe('too-large');
    expect(generate).not.toHaveBeenCalled();
  });
});
