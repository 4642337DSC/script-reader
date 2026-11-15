# Script Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An offline-capable PWA that reads video scripts from .docx files in a Google Drive folder, reflows text to any zoom, and lets Stefan assign a location, split sections, and tick sections done, with state synced via Drive.

**Architecture:** Pure-logic modules (docx parsing, section model, re-import matching, recent locations) are built and unit-tested first, with no DOM or network. A local IndexedDB store holds all state so the UI works offline. A Drive layer downloads .docx files and syncs state JSON. A Preact UI sits on top.

**Tech Stack:** TypeScript, Vite, Preact, Vitest (+ jsdom), `idb` (IndexedDB), `jszip` (read .docx), `vite-plugin-pwa` (service worker), Google Identity Services + Drive REST v3 (plain `fetch`), GitHub Pages hosting.

**Spec:** `docs/superpowers/specs/2026-11-15-script-reader-design.md`

## Global Constraints

- One user (Stefan), his own Google account; no sharing features.
- Script text is never edited in the app. Only location, done, and section boundaries are user data.
- Text must reflow to screen width at any font size/zoom; no horizontal scrolling anywhere.
- Fully usable offline for every already-downloaded script; no feature on the reading screen may require network.
- Default section = one .docx paragraph; each section has a stable string `id`.
- Re-import keeps location/done/splits for unchanged text; unmatched old sections go to an `orphans` list, never silently dropped.
- Conflict rule: last-write-wins per section by `updatedAt` (ms epoch).
- Locations are free text; autosuggest from recently used ones, shared across all scripts.
- Romanian diacritics must render and compare correctly.
- Project root `C:\Users\stefa\apps\script-reader` (not on the Drive-synced repo). UI language English.

## Review Focus

- Empty, corrupt, or non-.docx file in the Drive folder: skipped with a visible error, never crashes the list or sync (Task 2, 10).
- Text before the first title, or a file with no title at all: shown as one untitled video, not lost (Task 2).
- Identical paragraphs repeated in one video, and whitespace/NBSP/Unicode-normalization differences on re-import: matched in order, normalized before comparing (Task 4).
- Splitting at the very start or end of a section or inside whitespace: refused, never creates an empty section (Task 3).
- Expired/missing Google token while offline or on open: reading and editing still work; sync is deferred, not an error wall (Task 10, 11).
- Sync interrupted midway or two devices edited the same section: no checkmark/location lost; newest `updatedAt` wins (Task 11).

---

## File Structure

- `src/model/types.ts` — shared types.
- `src/docx/parseDocx.ts` — .docx bytes → paragraphs with title detection.
- `src/model/sections.ts` — create/split/merge/set location/toggle done.
- `src/model/reimport.ts` — carry state across re-imports.
- `src/model/recentLocations.ts` — recent-locations list + suggest.
- `src/storage/db.ts` — IndexedDB persistence.
- `src/drive/auth.ts`, `src/drive/drive.ts` — sign-in, list/download/upload.
- `src/sync/sync.ts` — pull scripts, merge/push state.
- `src/ui/` — `App.tsx`, `ScriptList.tsx`, `VideoList.tsx`, `Reader.tsx`, `SectionView.tsx`, `SectionMenu.tsx`, `LocationSheet.tsx`, `styles.css`.

## Shared types (Task 1 creates; all later tasks use exactly these)

```ts
export interface Section { id: string; text: string; location: string | null; done: boolean; updatedAt: number }
export interface Video { id: string; title: string; sections: Section[] }
export interface ScriptDoc { fileId: string; name: string; videos: Video[]; orphans: Section[]; updatedAt: number }
export interface ParsedVideo { title: string; paragraphs: string[] }
```

---

### Task 1: Project scaffold

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/model/types.ts`, `src/smoke.test.ts`, `.gitignore`.

**Interfaces:** Produces the shared types above.

- [ ] **Step 1:** `git init`; scaffold Vite + Preact + TS in the project root; add dev deps vitest, jsdom, and deps idb, jszip, vite-plugin-pwa. Vitest environment `jsdom`.
- [ ] **Step 2:** Write `smoke.test.ts` asserting `1 + 1 === 2`; run `npx vitest run` → PASS.
- [ ] **Step 3:** Run `npx vite build` → succeeds. Add `.superpowers/` and `node_modules/` to `.gitignore`.
- [ ] **Step 4:** Commit `chore: scaffold project`.

### Task 2: .docx parser

**Files:** Create `src/docx/parseDocx.ts`; Test `src/docx/parseDocx.test.ts` (build test .docx files in-test with jszip from minimal `word/document.xml` strings).

**Interfaces:** Produces `parseDocx(bytes: ArrayBuffer): Promise<ParsedVideo[]>`. Throws `Error("not a valid .docx")` on corrupt input.

- [ ] **Step 1: Tests:**
  - `splits videos at heading-styled paragraphs` (two `Heading1` titles, each followed by two paragraphs → 2 videos with those titles and paragraphs).
  - `detects bold standalone short line as title when no heading styles exist`.
  - `text before first title becomes one video titled "Untitled"`.
  - `file with no titles becomes one "Untitled" video`.
  - `empty paragraphs are dropped; Romanian diacritics preserved`.
  - `corrupt bytes throw "not a valid .docx"`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with jszip + `DOMParser` on `word/document.xml`: concatenate `w:t` runs per `w:p`; title = paragraph with style id matching `/^(Heading\d|Title)/` or, if the file has no such paragraphs, a paragraph whose runs are all bold and is under 120 chars. **Real-file check:** when Stefan supplies a sample, add a test fixture from it and adjust detection; ask him for the sample at this step.
- [ ] **Step 4:** Run → PASS. Commit.

### Task 3: Section model

**Files:** Create `src/model/sections.ts`; Test `src/model/sections.test.ts`.

**Interfaces:** Produces
`buildVideos(parsed: ParsedVideo[], now: number): Video[]` (one section per paragraph, ids generated with `crypto.randomUUID()`),
`splitSection(video: Video, sectionId: string, charIndex: number, now: number): Video` (new section inherits location, done; ignored/returned unchanged if charIndex ≤ 0 or ≥ text length after trimming, or splits inside leading/trailing whitespace),
`mergeWithPrevious(video: Video, sectionId: string, now: number): Video` (joins with one space; keeps previous's location; done only if both done),
`setLocation(video, sectionId, location: string | null, now): Video` (trims; empty → null),
`toggleDone(video, sectionId, now): Video`.
All pure; return new objects with updated `updatedAt`.

- [ ] **Step 1: Tests:** one section per paragraph; split mid-text gives two sections with trimmed texts that concatenate to the original words; split at 0 / at length / inside whitespace returns unchanged video; merge restores original text; merge of first section is a no-op; `setLocation("  ")` → null; toggleDone flips and bumps `updatedAt`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. Commit.

### Task 4: Re-import matching

**Files:** Create `src/model/reimport.ts`; Test `src/model/reimport.test.ts`.

**Interfaces:** Consumes `ScriptDoc`, `ParsedVideo[]`. Produces
`reimport(old: ScriptDoc, parsed: ParsedVideo[], now: number): ScriptDoc`.
Normalization: Unicode NFC, NBSP → space, collapse whitespace, trim, for comparison only.
Algorithm: for each new video (matched to an old video by normalized title, else by index), walk its text against the old video's sections in order: if a run of consecutive old sections concatenates (normalized, space-joined) to a new paragraph or to a prefix-aligned part of it, reproduce the old section boundaries and state; otherwise exact normalized-equal single paragraph match; otherwise create a fresh section. Old sections never consumed go to `orphans` (keeping their state).

- [ ] **Step 1: Tests:** unchanged text keeps location/done/ids; user split survives (old two sections, new single paragraph with same words → still two sections); edited paragraph becomes fresh section and old one is in `orphans` with its state; two identical paragraphs match in order (checking first only marks the first); NBSP/NFD diacritic difference still matches; new video added; old video removed → its sections in `orphans`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. Commit.

### Task 5: Recent locations

**Files:** Create `src/model/recentLocations.ts`; Test alongside.

**Interfaces:** Produces `recordLocation(list: string[], loc: string, max = 30): string[]` (most recent first, case-insensitive dedupe keeping latest spelling), `suggest(list: string[], prefix: string, limit = 6): string[]` (case/diacritic-insensitive prefix, then substring matches; empty prefix returns the most recent).

- [ ] **Steps:** tests for dedupe/order/max, prefix `"kit"` → `"Kitchen"`, empty prefix → recents, diacritics `"bir"` matches `"Birou"`/`"Bîrlad"`; run FAIL; implement; run PASS; commit.

### Task 6: Local store

**Files:** Create `src/storage/db.ts`; Test `src/storage/db.test.ts` (use `fake-indexeddb`, add as dev dep).

**Interfaces:** Produces
`openStore(): Promise<Store>` with `Store`:
`getScripts(): Promise<ScriptDoc[]>`, `getScript(fileId): Promise<ScriptDoc | undefined>`, `putScript(doc: ScriptDoc): Promise<void>`, `getRecents(): Promise<string[]>`, `putRecents(list: string[]): Promise<void>`, `getMeta<T>(key): Promise<T | undefined>`, `putMeta(key, value): Promise<void>`.

- [ ] **Steps:** tests: put/get roundtrip, getScripts lists all, recents roundtrip, data survives re-opening the store; FAIL; implement with `idb`; PASS; commit.

### Task 7: Reader screen (flowing text)

**Files:** Create `src/ui/Reader.tsx`, `src/ui/SectionView.tsx`, `src/ui/styles.css`; Test `src/ui/Reader.test.tsx` (@testing-library/preact).

**Interfaces:** Consumes `Video`. `Reader` props: `{ video: Video; fontScale: number; onSectionTap(id: string): void }`. Renders one block per section: left bar (green when done, grey otherwise), muted `+ location` or `📍 {location}` label above, text below; done sections get class `done` (faded, check mark). A font-size control (A− / A+) in a header changes `fontScale` (persisted via `putMeta("fontScale")`).
CSS: `max-width:100%`, `overflow-wrap:anywhere`, `font-size: calc(1.1rem * var(--scale))`, dark theme, tap targets ≥ 44px, no horizontal overflow at scale 2.5.

- [ ] **Steps:** tests: renders N sections; done section has `done` class; location label shows text or `+ location`; tapping calls `onSectionTap(id)`; root has `--scale` style updated by font control. FAIL → implement → PASS. Verify visually in browser at 360px width and scale 2.5 (no horizontal scrollbar). Commit.

### Task 8: Section menu, location sheet, split/merge

**Files:** Create `src/ui/SectionMenu.tsx`, `src/ui/LocationSheet.tsx`; modify `Reader.tsx`/`App.tsx`; tests alongside.

**Interfaces:** Consumes Task 3 functions and Task 5 `suggest`/`recordLocation`. `SectionMenu` shows actions: Set location, Mark done/undone, Split here, Merge with previous. `LocationSheet` props `{ recents: string[]; current: string | null; onPick(loc: string | null): void }` with a text input and live suggestion chips; picking records the location in recents.
Split mode: tapping "Split here" makes the section's words tappable; tapping a word splits before it (maps word offset → `charIndex`) and exits split mode with an undo toast (undo = `mergeWithPrevious`).

- [ ] **Steps:** tests: typing "ki" shows "Kitchen" chip from recents; picking updates the section and recents; split by tapping the 5th word yields two sections; first-word tap is ignored; Merge disabled on the first section. FAIL → implement → PASS → commit.

### Task 9: App shell and navigation

**Files:** Create `src/ui/App.tsx`, `src/ui/ScriptList.tsx`, `src/ui/VideoList.tsx`; modify `main.tsx`.

**Interfaces:** Consumes `Store`. Screens: ScriptList (files, with progress `done/total`) → VideoList (titles, progress, distinct locations) → Reader. Also an "Orphans" view per script listing `orphans` (read-only, with state). Hash-based routing (`#/script/<fileId>/<videoId>`) so Android back works. Every edit calls `putScript` immediately.

- [ ] **Steps:** tests: list shows seeded scripts with progress; opening a video renders Reader; checking a section persists (reopen store, still done). FAIL → implement → PASS → commit.

### Task 10: Google auth and Drive access

**Files:** Create `src/drive/auth.ts`, `src/drive/drive.ts`; Test `src/drive/drive.test.ts` (mock `fetch`).

**Interfaces:** Produces
`getAccessToken(interactive: boolean): Promise<string | null>` (Google Identity Services token client; returns `null` when offline/expired and `interactive` is false — never throws),
`listScriptFiles(token): Promise<{ id: string; name: string; modifiedTime: string }[]>` (.docx files in the folder named `Scripts` — folder id found by name, stored in meta),
`downloadFile(token, id): Promise<ArrayBuffer>`,
`readStateFile(token): Promise<ScriptDoc[] | null>` and `writeStateFile(token, docs: ScriptDoc[]): Promise<void>` (one JSON file `script-reader-state.json` in the same folder, created if missing).
Scopes: read access to the folder's .docx files plus the ability to create/update the state file. OAuth client ID read from `VITE_GOOGLE_CLIENT_ID`.

- [ ] **Steps:** tests with mocked fetch: list filters to .docx; download returns bytes; HTTP 401 → resolves to `null` token path / rejects with `AuthExpired`; state file created when absent. FAIL → implement → PASS. **Manual:** Stefan creates the Google Cloud project, OAuth Web client, publishes it "In production", and sets the env var; document steps in `README.md`. Commit.

### Task 11: Sync

**Files:** Create `src/sync/sync.ts`; Test `src/sync/sync.test.ts`.

**Interfaces:** Consumes Tasks 2, 4, 6, 10. Produces
`syncAll(deps: { store: Store; token: string | null; now: () => number }): Promise<SyncResult>` where `SyncResult = { added: number; updated: number; failed: { name: string; reason: string }[]; pushed: boolean }`.
Behaviour: if `token` is null → no-op, returns `pushed:false`. Else (1) list .docx; new files → `parseDocx` + `buildVideos`; files whose `modifiedTime` is newer than stored → `reimport`; a file that fails to parse is added to `failed` and skipped. (2) Pull remote state, merge into local per section by `updatedAt` (newest wins; sections only on one side are kept; orphans unioned), save locally. (3) Push merged state. Any network error leaves local data untouched.

- [ ] **Steps:** tests: null token is a no-op; new docx added; modified docx reimported with state kept; corrupt docx lands in `failed`, others still sync; remote newer `done` flag beats local older one, and vice versa; network error mid-push leaves local state unchanged and a retry succeeds. FAIL → implement → PASS. Wire into App: run on open, on `online` event, and via a manual Sync button; show "Offline ready / Synced HH:MM / Sync failed (will retry)". Commit.

### Task 12: PWA, offline, deploy

**Files:** Modify `vite.config.ts` (vite-plugin-pwa: precache app shell, manifest name "Script Reader", `display: standalone`, icons); create `.github/workflows/deploy.yml`, `README.md`.

- [ ] **Step 1:** Build, serve `dist` with `npx vite preview`, open in Chrome, load once, switch DevTools to Offline, reload → app opens and a seeded script is readable and editable. Expected: works.
- [ ] **Step 2:** Deploy to GitHub Pages (needs Stefan's GitHub repo; ask before creating/pushing). Add the Pages URL to the OAuth client's authorized origins.
- [ ] **Step 3:** On Stefan's Android phone: open URL, install ("Add to Home screen"), sign in, sync, enable airplane mode, open a script, set a location, tick a section, reconnect, confirm the web version shows the same state.
- [ ] **Step 4:** Commit.

## Self-Review notes

Spec coverage: reflow (7), location + autosuggest (5, 8), split/merge (3, 8), docx import (2, 10), offline (6, 11, 12), web + Android (12), keep state on re-import (4, 11), orphans visible (4, 9). Non-goals respected: no editor, no teleprompter.
