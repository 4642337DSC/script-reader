# Smart Import (Gemini) and Text Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import messy script documents with Gemini-based judgement (titles, groups, spoken text, filming notes, location cues) straight to finished videos, and let any member edit section text, video titles and Notes in the app.

**Architecture:** Pure logic first: an `ImportedVideo` model, verbatim-validated AI label assembly, and a re-import that matches on stored `originalText`. Gemini is reached only through an injectable `classify` function (Firebase AI Logic, structured JSON); every AI result is validated in code, and any failure falls back to the rule-based parser. Videos become their own Firestore documents so title/Notes edits are field-level.

**Tech Stack:** existing (TypeScript, Preact, Vite, Vitest, Firebase JS SDK incl. `firebase/ai`, Firestore emulator tests). No new services beyond enabling Firebase AI Logic (Gemini Developer API).

**Spec:** `docs/superpowers/specs/2026-11-15-smart-import-and-editing-design.md` (builds on the two earlier specs)

## Global Constraints

- Free tier only: Firebase project stays on Spark (no billing account). Gemini via Firebase AI Logic; **no API key anywhere** in repo, build or bundle.
- Gemini returns labels/positions only; every piece of visible text is a verbatim substring of the source, except stripping one outer „…" / "…" quote pair from spoken text. Titles/Notes/spoken text are never rewritten.
- Unknown/low-confidence/invalid label ⇒ the paragraph is spoken text. Any invalid AI output ⇒ fallback (new script) or the unavailable dialog (existing script).
- Only document text and formatting hints are sent to Gemini; never client names, emails, locations, ticks.
- Existing behaviour unchanged: roles/rules, field-level writes, offline, ≥44px targets, Romanian diacritics, public repo (no secrets, no personal data in code, tests, fixtures — fixtures are **synthetic**, modelled on the structure only).
- Existing scripts (no group/notes/originalText) must keep working unchanged.

## Review Focus

- Gemini returns hallucinated or altered text, out-of-range indexes, unknown labels or a cue that is not at the paragraph start: ignored/treated as spoken, never shown (Task 4).
- Quota (429), network failure, malformed JSON, oversized document: new script falls back with a notice; existing script shows the choice dialog and nothing is changed until chosen (Tasks 5, 6, 7).
- Re-import after a user edited a section's text, a video title or Notes: edits, locations and ticks survive; a changed source paragraph follows the "no longer in script" rule (Task 2).
- Two people editing different videos' titles/Notes or different sections concurrently: both survive (Task 3).
- Existing scripts that carry the old `videos` array on the script document still open and convert on next write (Task 3).
- Empty text edit, whitespace-only, very long text: rejected/handled, no empty sections (Task 8).

---

## File Structure

- `src/model/types.ts` — extended `Section`, `Video`; new `ImportedParagraph`, `ImportedVideo`.
- `src/import/importModel.ts` — `normalizeImport`, `stripOuterQuotes`, `buildVideosFromImport`.
- `src/model/reimport.ts` — updated matching.
- `src/ai/classify.ts` (pure: prompt/schema/validate/assemble), `src/ai/gemini.ts` (Firebase AI call), `src/import/smartImport.ts`.
- `src/data/docOps.ts`, `src/data/memoryRepo.ts`, `src/data/firestoreRepo.ts`, `firestore.rules`, `src/data/types.ts` — data model changes.
- `src/docx/parseDocx.ts` — expose raw paragraphs.
- `src/ui/`: `AddScript.tsx`, `ReaderScreen.tsx`, `SectionMenu.tsx`, `EditText.tsx`, `NotesPanel.tsx`, `SectionView.tsx`, `VideoList.tsx`.

## Shared types (Task 1 defines; later tasks use exactly these)

```ts
// src/model/types.ts (additions; existing fields unchanged)
export interface Section { /* id, text, location, done, updatedAt */ originalText?: string; suggestedLocation?: string | null }
export interface Video { /* id, title, sections */ group?: string | null; notes?: string; originalTitle?: string; originalNotes?: string }
export interface ImportedParagraph { source: string; text: string; suggestedLocation?: string | null }
export interface ImportedVideo { title: string; group: string | null; notes: string; paragraphs: ImportedParagraph[] }
// src/ai/classify.ts
export interface SourceParagraph { index: number; text: string; style: string; bold: boolean }
export type AiLabelName = 'group' | 'title' | 'spoken' | 'notes' | 'publish' | 'cue' | 'ignore';
export interface AiLabel { i: number; label: AiLabelName; cue?: string }
export type Classifier = (paragraphs: SourceParagraph[]) => Promise<AiLabel[]>;
export class AiUnavailable extends Error { reason: 'quota' | 'network' | 'invalid' | 'too-large' | 'disabled' }
// Repo additions (src/data/types.ts)
addScript(clientId, name, videos: ImportedVideo[] | ParsedVideo[]): Promise<{ scriptId: string; reimported: boolean; orphanedCount: number }>;
hasScript(clientId: string, name: string): Promise<boolean>;
// ScriptData additions
videoOrders: Record<string, number>;
```

---

### Task 1: Import model and quote handling

**Files:** Create `src/import/importModel.ts`; modify `src/model/types.ts`, `src/model/sections.ts` (`buildVideos` kept); Test `src/import/importModel.test.ts`.

**Interfaces:** Produces
`stripOuterQuotes(s: string): string` (removes exactly one leading „/“/" and one matching trailing ”/"/“ if both present; otherwise returns trimmed input),
`normalizeImport(input: ParsedVideo[] | ImportedVideo[]): ImportedVideo[]` (ParsedVideo paragraphs become `{source:p, text:p}`, `group:null`, `notes:''`),
`buildVideosFromImport(imported: ImportedVideo[], now: number): Video[]` (new ids; each section gets `originalText = source`, `suggestedLocation`; each video `originalTitle = title`, `originalNotes = notes`).

- [ ] **Step 1: Tests:** `stripOuterQuotes removes „…” and "…" pairs but not a lone quote`; `normalizeImport converts ParsedVideo and passes ImportedVideo through`; `buildVideosFromImport stores originalText/originalTitle/originalNotes and group`.
- [ ] **Step 2:** `npx vitest run src/import` → FAIL. **Step 3:** implement. **Step 4:** run → PASS. Commit.

### Task 2: Re-import that respects edits

**Files:** Modify `src/model/reimport.ts`; Test `src/model/reimport.test.ts` (extend).

**Interfaces:** Consumes Task 1. Produces `reimport(old: ScriptDoc, input: ImportedVideo[] | ParsedVideo[], now: number): ScriptDoc` and `countNewOrphans(before: ScriptDoc, after: ScriptDoc): number`.
Rules: paragraph matching compares `norm(paragraph.source)` against `norm(section.originalText ?? section.text)` (the run logic for user splits is kept, joined by space); a matched section keeps its current (possibly edited) `text`, location, done, id, and refreshes `suggestedLocation` only if the section has none. Videos are matched by `norm(originalTitle ?? title)` against the new title first for **all** videos, then by same `group` + index among still-unmatched; a matched video keeps its edited `title` unless the source title differs from `originalTitle`, and keeps edited `notes` unless the source notes differ from `originalNotes`. Unmatched old sections go to `orphans` as before.

- [ ] **Step 1: Tests:** `edited section text survives and keeps location and done`; `edited title survives; changed source title replaces it`; `edited notes survive unless source notes changed`; `a spoken section that is now notes lands in orphans with its state`; `group+position fallback only among unmatched videos`; existing reimport tests still pass; `countNewOrphans` counts added orphans.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npx vitest run` → PASS. Commit.

### Task 3: Data model for videos, editing fields and legacy scripts

**Files:** Modify `src/data/types.ts`, `src/data/docOps.ts`, `src/data/memoryRepo.ts`, `src/data/firestoreRepo.ts`, `firestore.rules`, `src/model/sections.ts`; Test `src/data/docOps.test.ts`, `src/data/memoryRepo.test.ts`, `test/rules.test.ts`, `test/firestoreRepo.test.ts`.

**Interfaces:** Produces
`VideoRow = { id: string; title: string; group: string | null; notes: string; originalTitle: string; originalNotes: string; order: number }`;
`flattenDoc` now returns `{ videos: VideoRow[]; rows: SectionRow[] }` (needs `videoOrders`); `SectionRow` gains `originalText: string | null` and `suggestedLocation: string | null`; `assembleDoc(id, name, videos: VideoRow[], rows)` returns `ScriptData` including `videoOrders`;
`assignOrders` also assigns video orders (`assignVideoOrders(doc, known): Record<string, number>` using the same ±1000 / midpoint rule);
`diffVideos(before: VideoRow[], after: VideoRow[]): { sets: VideoRow[]; updates: { id: string; patch: Partial<Omit<VideoRow,'id'>> }[]; deletes: string[] }`;
`setText(video: Video, sectionId: string, text: string, now: number): Video` (trims; returns the same object if empty after trim), `setVideoTitle(video, title, now)`, `setVideoNotes(video, notes)`, `acceptSuggestion(video, sectionId, now): Video`; `setLocation` also clears `suggestedLocation`.
Firestore: `clients/{c}/scripts/{s}/videos/{v}` documents; `watchScript` reads the `videos` subcollection, falling back to the legacy `videos` array on the script document when the subcollection is empty; `save` writes video diffs in the same batches and, when it writes any video document, removes the legacy array field. `ScriptSummary.videoCount` keeps working for both layouts (count from the script doc field `videoCount`, set on every write; legacy falls back to array length).
Rules: `match /videos/{v} { allow read, write: if canUse(c); }` under scripts.

- [ ] **Step 1: Tests:** docOps: video order assignment between neighbours; `diffVideos` patch only changes (title edit ⇒ `{title}` only); `setText` rejects blank; `acceptSuggestion` sets location and clears suggestion; flatten/assemble roundtrip with group/notes/originalText. memoryRepo: two members editing different videos' titles both survive; legacy-shaped script still readable. Emulator: `member can read/write videos docs, non-member cannot`; `concurrent title edits on two videos both survive`; `legacy script with videos array opens and converts on next save`; `a stale save after deletion is still dropped` (existing test stays green).
- [ ] **Step 2:** run unit and `npm run test:emulator` (Java on PATH) → FAIL. **Step 3:** implement. **Step 4:** both suites → PASS. Commit.

### Task 4: AI label validation and assembly (pure)

**Files:** Create `src/ai/classify.ts`, `src/ai/fixtures.ts` (synthetic document modelled on the structure: 3 groups, 11 videos with „quoted" spoken text + "Cadre și foto." notes, one untitled video, one video with inline cues "Filmare X …", one stray-word line); modify `src/docx/parseDocx.ts` (export `readDocxParagraphs(bytes: ArrayBuffer): Promise<SourceParagraph[]>`; `parseDocx` reuses it); Test `src/ai/classify.test.ts`.

**Interfaces:** Produces
`buildClassifyRequest(paragraphs: SourceParagraph[]): { prompt: string; schema: object }` (schema: array of `{i: integer, label: enum, cue?: string}`; prompt tells the model to label only, never copy or rewrite text, label unsure paragraphs `spoken`),
`validateLabels(raw: unknown, paragraphs: SourceParagraph[]): AiLabel[] | null` (null if not an array or covers fewer than half the paragraphs; drops entries with out-of-range or duplicate `i`, unknown labels; missing paragraphs become `spoken`; a `cue` is kept only if `paragraphs[i].text.trimStart().startsWith(cue)` and `cue.length < text.length`),
`assembleImport(paragraphs: SourceParagraph[], labels: AiLabel[]): ImportedVideo[]` (group label sets the current group; each `title` starts a video; `spoken` ⇒ `{source: text, text: stripOuterQuotes(remainderAfterCue), suggestedLocation}`; `notes`/`publish` text appended to the current video's `notes` joined by a blank line; a standalone `cue` paragraph becomes the suggested location (cue text with a leading "Filmare " removed, trimmed) for the spoken sections that follow until the next cue/video; `ignore` dropped; spoken before the first title go into an `Untitled` video; a title with no spoken text still creates a video).

- [ ] **Step 1: Tests (fixture + hand-written labels):** `assembleImport produces 11 videos in 3 groups from the fixture`; `spoken text equals the source minus outer quotes`; `notes land in Notes, not in spoken sections`; `glued cue is split and suggested`; `standalone cue applies to following sections only until the next cue`; `validateLabels ignores out-of-range, duplicate and unknown labels`; `a cue that is not at the start of the paragraph is dropped`; `a model that invents text cannot change any visible text` (labels only reference indexes); `missing labels default to spoken`; `readDocxParagraphs returns style and bold per paragraph` (via `makeDocx`).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npx vitest run` → PASS. Commit.

### Task 5: Gemini client

**Files:** Create `src/ai/gemini.ts`, `src/ai/geminiConfig.ts`; Test `src/ai/gemini.test.ts`.

**Interfaces:** Produces `createGeminiClassifier(generate: (prompt: string, schema: object) => Promise<string>): Classifier` (pure wrapper: builds the request, parses JSON, `validateLabels`, throws `AiUnavailable('invalid')` on null; maps thrown errors with status 429/`RESOURCE_EXHAUSTED` ⇒ `'quota'`, fetch/network errors ⇒ `'network'`; refuses documents over 400 paragraphs or 60 000 characters with `'too-large'`) and `createFirebaseGenerate(app: FirebaseApp): (prompt, schema) => Promise<string>` using `getAI(app, { backend: new GoogleAIBackend() })` and `getGenerativeModel` with `responseMimeType: 'application/json'` and `responseSchema` (model name read from `geminiConfig.ts`, chosen from Firebase's current docs for a free-tier Flash-class model; `AiUnavailable('disabled')` if AI Logic is not enabled).

- [ ] **Steps:** tests with a fake `generate`: valid JSON ⇒ labels; malformed JSON ⇒ `invalid`; thrown `{status:429}` ⇒ `quota`; `TypeError('Failed to fetch')` ⇒ `network`; oversized ⇒ `too-large` and `generate` not called. FAIL → implement → PASS. Commit. (`createFirebaseGenerate` is verified manually in Task 10.)

### Task 6: Smart import orchestration

**Files:** Create `src/import/smartImport.ts`; modify `src/data/types.ts`, `src/data/memoryRepo.ts`, `src/data/firestoreRepo.ts` (`hasScript`, `addScript` returns `orphanedCount`, accepts `ImportedVideo[] | ParsedVideo[]` via `normalizeImport`); Test `src/import/smartImport.test.ts`, repo tests extended.

**Interfaces:** Produces
`smartImport(bytes: ArrayBuffer, deps: { classify?: Classifier; scriptExists: boolean }): Promise<{ videos: ImportedVideo[]; mode: 'ai' | 'basic'; notice?: string }>`:
AI success ⇒ `assembleImport`; failure and `!scriptExists` ⇒ rule-based (`parseDocx` → `normalizeImport`) with notice `"AI reading unavailable, used the basic reading."`; failure and `scriptExists` ⇒ throws the `AiUnavailable`; no `classify` provided ⇒ treated as `'disabled'` (same rules). Plus `basicImport(bytes): Promise<ImportedVideo[]>`.

- [ ] **Steps:** tests: AI success; new script + quota ⇒ basic with notice; existing + quota ⇒ throws AiUnavailable; corrupt docx still rejects with "not a valid .docx"; `hasScript` true/false in memoryRepo and emulator; `addScript` returns `orphanedCount` after a re-import that turns a spoken section into notes. FAIL → implement → PASS. Commit.

### Task 7: Import UI wiring

**Files:** Modify `src/ui/AddScript.tsx`, `src/ui/App.tsx`, `src/ui/Shell.tsx`, `src/ui/ScriptList.tsx`, `src/main.tsx`; Test `src/ui/smartAdd.test.tsx`, existing `AddScript`/`AddFromDoc` tests updated.

**Interfaces:** `App` and `Shell` take optional `classify?: Classifier`; `main.tsx` builds it from `createFirebaseGenerate(app)`. Both routes (file, Google Docs link) call `repo.hasScript` then `smartImport`, then `repo.addScript`. Status lines: `Added <name>`, `Updated <name> (kept your locations, ticks and edits)`; when `orphanedCount > 0` append ` — <n> paragraphs moved to "no longer in script"`; when `mode==='basic'` show the notice. On `AiUnavailable` for an existing script: show a dialog `The AI reading is unavailable right now.` with buttons `Import with basic reading anyway` (runs `basicImport`) and `Try again later` (nothing changes). One-time notice (localStorage `aiNoticeSeen`): `Importing sends the document text to Google's Gemini service to read its structure.` with an OK button.

- [ ] **Steps:** tests with a fake `classify`: AI import yields grouped videos with notes; failure on a new script shows the notice and still adds the script; failure on an existing script shows the dialog and changes nothing until "Import with basic reading anyway"; "Try again later" changes nothing; the privacy notice shows once. FAIL → implement → PASS. Commit.

### Task 8: Editing UI

**Files:** Create `src/ui/EditText.tsx`, `src/ui/NotesPanel.tsx`; modify `src/ui/SectionMenu.tsx`, `src/ui/ReaderScreen.tsx`, `src/ui/Reader.tsx`; Test `src/ui/editing.test.tsx`.

**Interfaces:** `SectionMenu` gains `Edit text`; `EditText({ initial: string; onSave(text: string): void; onCancel(): void })` (textarea ≥44px controls; Save disabled when blank); the reader header shows the video title with an edit action (aria-label `Edit title`) and a collapsible **Notes** panel (`NotesPanel({ notes, onSave })`, shows "No notes" when empty) with an edit action; all edits go through `setText` / `setVideoTitle` / `setVideoNotes` (Task 3) and the existing `onChange` → `saveScript` path so they sync live and offline.

- [ ] **Steps:** tests: Edit text saves and shows the new text; blank text cannot be saved; edit title; edit notes; edits reach another member's watcher (memory repo); `ReaderScreen` still updates when a remote edit arrives. FAIL → implement → PASS. Commit.

### Task 9: Groups, suggestions, Notes in the lists

**Files:** Modify `src/ui/VideoList.tsx`, `src/ui/SectionView.tsx`, `src/ui/ReaderScreen.tsx`; Test `src/ui/groups.test.tsx`.

**Interfaces:** `VideoList` renders a heading per distinct `group` (videos without a group listed first, no heading); a section with `suggestedLocation` and no location shows a chip `📍 <suggestion>?` with `Accept` (calls `acceptSuggestion`) and `Dismiss` (sets `suggestedLocation: null` through `setLocation(null)`-style helper `dismissSuggestion(video, id, now)`); accepted locations are added to recent locations.

- [ ] **Steps:** tests: groups render in order with headings; ungrouped legacy scripts render as before; Accept sets the real location and records it in recents; Dismiss removes the chip; no chip once a location exists. FAIL → implement → PASS. Commit.

### Task 10: Setup, docs and live verification

**Files:** Modify `README.md`; verify in the browser.

- [ ] **Step 1:** README: enable **Firebase console → Build → AI Logic → Get started → Gemini Developer API** (keep the project on Spark, no billing account), what text is sent to Google and the free-tier data note, how fallback works.
- [ ] **Step 2:** `npx vitest run`, `npm run test:emulator`, `npx tsc --noEmit`, `npx vite build` all green; republish `firestore.rules` in the console (new `videos` match) — the owner does this; push to deploy.
- [ ] **Step 3 (owner + builder):** import the real Google Doc by link; expect 11 videos in 3 groups, spoken text only in the reader, Notes per video, suggested locations on the anniversary film; edit a typo, re-import the same doc, confirm the edit and ticks survive.

## Self-Review notes

Spec coverage: smart labels + groups + notes + suggestions + glued cues (4, 6, 9); verbatim rule and fallback (4, 5, 6); AI-unavailable rules for new vs existing (6, 7); editing (3, 8); re-import preserving edits and orphan notice (2, 6, 7); videos as documents, legacy conversion, rules (3); privacy notice and setup (7, 10). Ruling in plan: `addScript` accepts both `ParsedVideo[]` and `ImportedVideo[]` so existing callers and tests keep working.
