import { parseDocx, readDocxParagraphs } from '../docx/parseDocx';
import { AiUnavailable, assembleImport, type AiUnavailableReason, type Classifier } from '../ai/classify';
import { normalizeImport } from './importModel';
import type { ImportedVideo } from '../model/types';

export interface SmartImportResult { videos: ImportedVideo[]; mode: 'ai' | 'basic'; notice?: string; reason?: AiUnavailableReason; detail?: string }
export interface SmartImportDeps { classify?: Classifier; scriptExists: boolean }

export const BASIC_NOTICE = 'AI reading unavailable, used the basic reading.';

/** The rule-based reading (headings are titles, everything else is spoken text). */
export async function basicImport(bytes: ArrayBuffer): Promise<ImportedVideo[]> {
  return normalizeImport(await parseDocx(bytes));
}

/**
 * Reads a document with Gemini when possible. For a new script any AI problem falls back to the basic reading;
 * for a script that already exists the AiUnavailable is thrown so the caller can ask the user, because a different
 * reading could reshuffle a script people are already working on.
 */
export async function smartImport(bytes: ArrayBuffer, deps: SmartImportDeps): Promise<SmartImportResult> {
  const paragraphs = await readDocxParagraphs(bytes); // rejects with "not a valid .docx"
  try {
    if (!deps.classify) throw new AiUnavailable('disabled');
    if (paragraphs.length === 0) throw new AiUnavailable('invalid', 'empty document');
    const videos = assembleImport(paragraphs, await deps.classify(paragraphs));
    if (videos.length === 0) throw new AiUnavailable('invalid', 'no videos found');
    if (videos.every((v) => v.paragraphs.length === 0)) throw new AiUnavailable('invalid', 'no spoken text found');
    return { videos, mode: 'ai' };
  } catch (e) {
    const err = e instanceof AiUnavailable ? e : new AiUnavailable('network', e instanceof Error ? e.message : String(e));
    if (deps.scriptExists) throw err;
    return { videos: await basicImport(bytes), mode: 'basic', notice: BASIC_NOTICE, reason: err.reason, detail: err.message };
  }
}
