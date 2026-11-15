# Script Reader — Smart Import (Gemini) and Text Editing (v3)

Builds on the two earlier specs in this folder (single-user app, then team sync with Firebase). Both are built and deployed.

## Intent
Real script documents do not share one format. The example that prompted this: one Google Doc with 11 videos for one client, grouped under three brand headings ("Darcom Print", "Darcom Shop", "Darcom.ro"). Each video has a numbered title, then the **spoken script** in „quotes", then a bold paragraph starting "Cadre și foto." with **filming directions** (not to be read aloud), sometimes a publishing note ("Publicare în ianuarie"). One video has no title; another (an anniversary film) is one long script with a filming cue in front of each paragraph ("Filmare tipografie În 1994, am deschis…"); another contains stray dictated words. The current rule-based importer (headings = titles, everything else = spoken) mis-splits this. The importer needs judgement, so Gemini is used to classify the document, and the app also needs in-app text editing to fix what imports get wrong (typos, stray words).

## Goals
- **Smart import** on both import routes (".docx file" and "Google Docs link"): Gemini reads the document and labels every paragraph. The user goes **straight to the finished videos** — no review step.
- Labels: group heading, video title, spoken script, filming notes, publishing note, location cue, ignorable. A video's readable text is **only its spoken script**; its filming and publishing notes appear in a per-video **Notes** panel.
- Groups (e.g. the three brand headings) appear in the video list as headings that organise the videos.
- A filming cue that names a place (e.g. "tipografie", "tejghea") is stored as a **suggested location** on the affected section; the user can accept or change it. A suggestion is never applied as a real location automatically.
- A paragraph with a cue glued to its start ("Filmare tipografie În 1994…") is split: the cue becomes the suggestion/notes, the rest becomes the spoken section.
- **Gemini never rewrites text.** Spoken text, titles and notes are always verbatim pieces of the source. Typos or stray words it notices may be flagged for the user but are never changed automatically.
- If the model is unsure about a paragraph, it is treated as spoken script (safest to read aloud).
- **Fallback:** if Gemini is unreachable, over its free limit, or returns something invalid, the import silently falls back to the existing rule-based parser and shows a notice that the basic reading was used. An import is never blocked by the AI.
- **Text editing** for everyone with access: edit a section's text, a video's title, and a video's Notes, in the app. Edits sync live like every other change and work offline.
- A re-import (same file name / same document title) must **not undo user edits**, and must still keep locations and ticks on unchanged text.

## Non-goals / anti-goals
- No review/confirm step after import (explicitly declined). No "refresh from Google Doc" link memory (still a one-time import).
- Anti-goal: any silent change to the user's words; Gemini output is only ever labels, positions and short suggestions.
- Anti-goal: an AI failure, timeout or quota error leaving a half-imported script or blocking the import.
- Anti-goal: committing or exposing an API key. No Gemini key in the repo, the build, or the browser bundle.
- Not building: per-paragraph undo history for edits, comments, version history.

## Constraints
- Free tier only. Gemini is called through **Firebase AI Logic** (Gemini Developer API provider) from the web SDK, which keeps the key on Google's side. Per Google's docs the free tier applies only while the Firebase project has **no Cloud Billing account linked**; the project must stay on the no-cost Spark plan. Quota errors must be handled gracefully (fallback above).
- The model must be asked for **structured JSON** (response schema), and its output must be **validated in code** before use: label values, paragraph indexes in range, every quoted substring actually present in the source at the claimed position. Anything invalid → that paragraph is treated as spoken text, or the whole import falls back.
- Only the document's text (and formatting hints such as heading/bold) is sent to Gemini. Never client names from the database, member emails, locations or ticks. The user must be told, in the README and once in the UI, that import sends the document text to Google's Gemini service (and that, as I understand Google's terms, free-tier content may be used by Google to improve its products).
- Documents can be long: the builder must handle size limits (chunking or truncation with fallback) without losing paragraphs.
- Everything from the earlier specs still holds: roles (admin vs member), access rules, field-level writes, offline behaviour, ≥44px tap targets, Romanian diacritics, public repo (no personal data, no secrets).

## Data and behaviour decisions
- Video gains: an optional **group** name, a **Notes** text (editable), and its title (editable). Section gains: an optional **suggested location** (cleared when accepted or when any location is set), and remembers its **original imported text** so re-imports can recognise edited sections.
- Editing a section's text is allowed for any member; the edit is a normal field-level write.
- Re-import matching: a section whose user-edited text differs from its original imported text still counts as "unchanged" if the new document's paragraph equals the original imported text; it keeps the user's edited text, location and tick. If the source paragraph changed, the edited section follows the existing "no longer in script" rule.
- Edits to Notes/title are also preserved across re-import unless the source value for that video changed.
- Where the Notes panel lives, how suggestions are accepted (one tap on the suggestion chip), and how groups are shown are UI details for the builder, in the app's existing dark style.

## Builder's calls (Claude's, not agreed with the owner)
- Provider: Firebase AI Logic with the Gemini Developer API; the model is a current free-tier Flash-class model chosen from Google's docs at build time (not hard-coded by name in this spec).
- The model returns only per-paragraph labels, group/video assignment, and (for glued cues) the exact cue substring; the code builds all text from the source.
- Low-confidence or unknown label → spoken script.
- App Check is optional; the builder decides whether it is practical without billing and documents the choice.
- Suggested locations are strings taken from the cue text (e.g. "tipografie"), shown as a chip on the section, not added to the recent-locations list until accepted.

## More builder's calls (from the builder check; Claude's, not agreed with the owner)
- **Storage:** videos become their own documents under the script (title, group, Notes, order), so two people editing different videos' titles or Notes never overwrite each other. Existing scripts that still carry the old `videos` array on the script document are read as before and converted when next written. Security rules and emulator tests are extended to cover the new documents.
- **Original text for re-import:** every section stores `originalText` = the full source paragraph exactly as imported (quotes included). The visible text strips one outer pair of quotation marks („…" or "…") and is what the user edits. Re-import compares the new source paragraph against `originalText`, so edited sections still match and keep the user's edit, location and tick. A source paragraph that produces a section plus a glued cue keeps the whole paragraph as `originalText`. Every video stores `originalTitle` and `originalNotes` the same way; video matching uses `originalTitle` first, then group + position only among still-unmatched videos.
- **Different readings of the same document:** re-import matches by source text regardless of label. A paragraph that was a spoken section and is now classified as Notes goes to "no longer in script" with its state, as any removed paragraph does. This will happen once to scripts imported before this feature (their filming notes were imported as spoken sections); the app shows how many paragraphs moved.
- **AI unavailable on a re-import:** for a **new** script the import silently falls back to the basic reading (with a notice). For a script that **already exists** (same name), the app does not fall back silently, because a different reading could reshuffle it; it says the AI is unavailable and offers "Import with basic reading anyway" or "Try again later".
- **Standalone location cue:** a cue paragraph on its own applies to the spoken section(s) that follow it, until the next cue or video. Filming-note paragraphs that merely mention a place do not create suggestions.

## Left to the builder
Prompt wording and schema, model name, chunking strategy, data-model field names, migration of existing scripts (existing scripts simply have no group/notes), the exact editing UI, tests (including a fixture modelled on the Darcom document with a mocked Gemini), README/setup steps for enabling Firebase AI Logic.
