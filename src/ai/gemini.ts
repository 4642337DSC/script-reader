import type { FirebaseApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';
import { AiUnavailable, buildClassifyRequest, LABELS, validateLabels, type Classifier } from './classify';
import { GEMINI_MODEL } from './geminiConfig';

export const MAX_PARAGRAPHS = 400;
export const MAX_CHARS = 60_000;

type Generate = (prompt: string, schema: object) => Promise<string>;

function statusOf(e: unknown): number | undefined {
  const x = e as { status?: unknown; customData?: { status?: unknown } } | null;
  const s = x?.status ?? x?.customData?.status;
  return typeof s === 'number' ? s : undefined;
}

function mapError(e: unknown): AiUnavailable {
  if (e instanceof AiUnavailable) return e;
  const status = statusOf(e);
  const message = e instanceof Error ? e.message : typeof (e as { message?: unknown })?.message === 'string' ? String((e as { message: string }).message) : String(e);
  if (status === 429 || /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(message)) return new AiUnavailable('quota', message);
  if (status === 403 || /PERMISSION_DENIED|has not been used|is disabled|not enabled|API_KEY|\b403\b/i.test(message)) return new AiUnavailable('disabled', message);
  return new AiUnavailable('network', message);
}

const stripFence = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

/** Wraps a text-generation function: size limit, JSON parsing and validation, errors mapped to AiUnavailable. */
export function createGeminiClassifier(generate: Generate): Classifier {
  return async (paragraphs) => {
    const chars = paragraphs.reduce((n, p) => n + p.text.length, 0);
    if (paragraphs.length > MAX_PARAGRAPHS || chars > MAX_CHARS) throw new AiUnavailable('too-large');
    const { prompt, schema } = buildClassifyRequest(paragraphs);
    let text: string;
    try {
      text = await generate(prompt, schema);
    } catch (e) {
      throw mapError(e);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(stripFence(text));
    } catch {
      throw new AiUnavailable('invalid', 'not JSON');
    }
    const labels = validateLabels(raw, paragraphs);
    if (!labels) throw new AiUnavailable('invalid', 'unusable labels');
    return labels;
  };
}

/** Real generation through Firebase AI Logic (Gemini Developer API); no API key lives in this app. */
export function createFirebaseGenerate(app: FirebaseApp): Generate {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const responseSchema = Schema.array({
    items: Schema.object({
      properties: {
        i: Schema.integer(),
        label: Schema.enumString({ enum: LABELS }),
        cue: Schema.string(),
      },
      optionalProperties: ['cue'],
    }),
  });
  const model = getGenerativeModel(ai, {
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0 },
  });
  return async (prompt) => (await model.generateContent(prompt)).response.text();
}
