# Script Reader — Design

## Intent
A personal app (one user: Stefan) for reading short-form video scripts on an Android phone and preparing/running a shoot. A PDF or .docx has a fixed page layout: zooming in pushes text off-screen. This app reflows text to the screen width at any zoom level (like the auto-caption editor does on desktop). Beyond reading, Stefan assigns a shooting **location** to each section before the shoot, and ticks sections **done** while filming.

## Goals
- Text always reflows to screen width, at any zoom / font size; no horizontal scrolling.
- Import scripts from `.docx` files placed in a Google Drive folder from the PC.
- Per section: a free-text **location** and a **done** checkbox.
- Location input is typed by hand, with autosuggest from recently used locations (shared across all scripts).
- Stefan can **split** the text into his own sections (tap between two words to break a section in two) and undo a split (merge).
- Works **fully offline** on location: scripts are downloaded beforehand; locations, splits and checkmarks are saved on the device and synced to Drive when online.
- Same app available as a web version and installable on Android (one codebase, PWA).
- Re-sending an edited .docx keeps locations, splits and checkmarks on text that did not change; only changed text starts fresh.

## Non-goals / anti-goals
- Not multi-user, no accounts beyond Stefan's own Google account, no sharing features.
- Not an editor: the script text is never edited in the app (edit the .docx on the PC).
- Not a teleprompter, no video/audio features.
- Anti-goal: anything that makes it feel like a PDF again (fixed layout, side-scrolling, tiny tap targets).
- Anti-goal: losing a checkmark or location because of a failed sync or lost signal.

## Input format
Each .docx contains **only titles and spoken text**. Stefan confirmed every video has a clear title (exact marking not specified; builder detects it from a real sample file, trying heading style, bold, or a short standalone line, and asks Stefan for a sample at that point). Assumption: one file may hold several videos, each a title followed by its spoken paragraphs; the app lists the videos in a file and opens one at a time. Titles are likely headings or distinct lines; the builder must handle a file with a single video as well as several, and look at real files from the user's script workflow (Kellaway-2 / script-generator .docx output) to detect titles.

## Reading screen (decided: "flowing text", layout B)
- Looks like a normal page of text. Each section has a thin colored bar on its left edge and a small location label above it (e.g. "📍 Kitchen"); sections with no location show a muted "+ location".
- Done sections fade out (and show a check). Tapping a section opens its options: set/change location, mark done/undone, split here / merge with previous.
- Dark theme by default is suitable for on-set use (builder's call on exact styling).
- Zoom/font-size control plus normal pinch behaviour must reflow text, never overflow.

## Data & sync
- Source of truth for script text: the .docx files in a designated Drive folder.
- App state (per script: sections' boundaries, locations, done flags; plus the recent-locations list) is stored on-device (IndexedDB) for offline use and synced to Drive as small JSON files (builder decides folder vs app-data folder; must be visible to both web and Android installs).
- Offline: opening the app with no signal must work for every script already downloaded; edits queue and sync later. Conflicts: single user, last-write-wins per section is acceptable.
- Re-import: match old sections to new text so unchanged text keeps its state (exact-text match is the minimum; builder may be smarter).

## Constraints / decisions made (Stefan's)
- Web app + installable on Android; works offline; talks to Google Drive; .docx comes from PC via Drive.
- Location typed by hand with autosuggest from recent ones.
- Splitting into custom cards is wanted.

## Builder's calls (made by Claude, not agreed with Stefan)
- Progressive Web App, hosted free (e.g. GitHub Pages); installed from the browser on Android.
- Parse .docx in the browser (no separate conversion step).
- Google sign-in (OAuth) for Stefan's account only; app stays in personal/testing mode.
- Project lives in `C:\Users\stefa\apps\script-reader` (not in the Drive-synced VSCode-test repo, to avoid the known git-on-GDrive problems).
- UI language: English; script text in whatever language (Romanian expected, diacritics must render).

## More builder's calls (from the review; Claude's, not agreed with Stefan)
- Default section = one paragraph of the .docx. Stefan can split mid-paragraph and merge back. Each section has a stable ID so splits/merges and cross-device sync work.
- A script's identity for saved state = its Drive file ID; if that fails (file replaced under a new name), fall back to matching by filename/title.
- Re-import matching: exact paragraph text first, then fuzzy; sections whose text vanished are not dropped silently, they appear in a "no longer in script" list so no checkmark is lost without Stefan seeing it.
- Auth: Google OAuth with `drive.readonly`-style access to read the .docx folder plus write access to the app's own state files. Testing-mode tokens expire after 7 days, so the OAuth app is set to "In production" (unverified, personal use, shows a one-time warning) so offline use is not broken by weekly sign-outs.
- Sync: on open with signal, the app downloads every .docx in the folder and uploads queued state changes automatically. No per-script "take offline" step; the UI shows an "offline ready" indicator. First install must happen with signal (service worker caches the app).
- Phone and web/PC may both edit; last-write-wins per section by timestamp.

## Left to the builder
Framework/tooling, exact Drive folder name and JSON layout, section-matching algorithm for re-imports, visual styling details, test approach.
