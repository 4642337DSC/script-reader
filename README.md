# Script Reader

A team PWA for reading short-form video scripts (.docx) on Android or the web. Scripts are grouped by
**client**; an admin decides which team members can open which clients. Everyone with access sees the same
scripts and the same locations/checkmarks, live. It works offline and syncs when signal returns.

## Using it
- **Sign in** with a Google account. You see only the clients the admin gave you. If you see "ask the admin",
  send the admin the email shown on screen.
- **Inside a client**, tap **+** to add a script from a .docx (titles = Word Heading/Title styles, or short bold
  lines if the file has no headings; everything else is spoken text). Adding a file with the same name updates
  that script and keeps locations and ticks on unchanged text. Removed paragraphs go to "no longer in script".
- **Open a video**: tap a paragraph to set its location, mark it done, split it (tap the word where the new
  section starts) or merge it with the previous one. Text reflows at any size (A− / A+).
- **Admin** (one person): the *Admin* button lists all clients; create/rename/delete clients and add or remove
  members by Google email. Admins can also delete scripts.

## Develop
```
npm install
npm test               # unit/UI tests (fast, no Firebase needed)
npm run test:emulator  # security-rule and Firestore tests (needs Java 21+ and downloads the Firestore emulator)
npm run dev            # local dev server (needs the Firebase variables below in .env.local)
npm run build
```

## Firebase setup (one time, done by the admin)
1. https://console.firebase.google.com → **Add project** (e.g. "script-reader"). Analytics is not needed.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable** (choose a support email).
   Then **Settings → Authorized domains → Add domain**: `4642337dsc.github.io` (add `localhost` for local work).
3. **Build → Firestore Database → Create database** → *Production mode*, any region near you.
4. **Firestore → Rules** tab: replace the contents with the file [`firestore.rules`](firestore.rules) from this
   repo and **Publish**.
5. **Firestore → Data → Start collection**: collection ID `config`, document ID `admin`, one field
   `email` (string) = the admin's Google email **in lowercase**. This marks who the admin is. Nobody can
   change it from the app.
6. **Project settings (gear) → General → Your apps → Add app → Web (</>)**: name it, no hosting. Copy the
   `firebaseConfig` values.
7. GitHub repo → **Settings → Secrets and variables → Actions → Variables** → add these four repository
   *variables*: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_APP_ID` (values from step 6). These are public identifiers by design; access is enforced by
   the rules in step 4.
8. Push to `main` (or re-run the **Deploy to GitHub Pages** workflow). For local work put the same four
   variables in `.env.local`.

## Smart import with Gemini (one-time Firebase setup)
Importing a .docx or a Google Doc asks Gemini to work out the structure: group headings, video titles, spoken text,
filming notes ("Cadre și foto…"), publishing notes and filming cues. Only the labels come from Gemini; every piece
of text shown is copied verbatim from your document (spoken text loses one outer pair of quotation marks). Filming
notes appear in a per-video **Notes** panel, and a cue like "Filmare tipografie" becomes a *suggested* location you
can accept with one tap. Everyone with access can edit section text, video titles and Notes afterwards.

Setup: **Firebase console → Build → AI Logic → Get started → Gemini Developer API**. Keep the project on the free
**Spark** plan with **no Cloud Billing account** (linking one switches Gemini to pay-as-you-go). The app uses the
model in `src/ai/geminiConfig.ts` (currently `gemini-3.8-flash`, marked "billing not required" in Firebase's
supported-models page); change it there if Google retires it.

What is sent to Google: only the document's paragraph text and heading/bold hints, never client names, member
emails, locations or ticks. As we understand Google's terms, content sent on the free tier may be used by Google to
improve its products. The app shows a one-time notice before the first import.

If Gemini is unavailable (quota, network, invalid answer): a **new** script is imported with the basic reading and a
notice; for a script that **already exists** the app asks first ("Import with basic reading anyway" / "Try again
later") so a different reading can't silently reshuffle it. Re-imports keep your text edits, locations and ticks on
paragraphs whose source text did not change.

**Shot tags and B-roll.** Every card has a small tag icon that cycles through 🌄 Wide, 🧍 Medium, 🔍 Close-up and
🎙 Voiceover (one tag per card, set by hand). Every video has a **B-roll** checklist: on import Gemini splits the
video's "Cadre și foto" filming notes into separate shots, each one a verbatim piece of your notes (anything that
is not found in the notes is dropped, and if Gemini is unavailable the list simply starts empty). You can tick,
edit, add and remove shots; a re-import never changes the list.

Known limits: Firebase App Check is not enabled, so anyone who copies the public web config could spend the free
Gemini quota (the free tier simply stops when exhausted; imports then fall back to the basic reading). Two people
importing the same new file name at the very same moment can still create two scripts with that name. Documents over
400 paragraphs or 60 000 characters always use the basic reading.

After updating the app, republish `firestore.rules` (Firestore → Rules → paste → Publish): videos are now stored as
their own documents, which needs the new `videos` rule.

## Google Docs link import (one-time Google Cloud setup)
"+" → "From Google Docs link" reads a Google Doc with the signed-in person's own permission (read-only), once.
Nothing about the link is stored. To enable it:
1. https://console.cloud.google.com → select the project named like your Firebase project (e.g. `script-reader-…`).
2. **APIs & Services → Library → Google Drive API → Enable**.
3. **APIs & Services → OAuth consent screen** (or *Google Auth Platform → Data Access*): **Add or remove scopes** →
   *Manually add scopes* → paste `https://www.googleapis.com/auth/drive.readonly` → **Add to table → Update → Save**.
4. **Audience**: if it says *Testing*, click **Publish app → Confirm** so team members aren't blocked.
Each person sees a one-time Google permission screen (with an "unverified app" warning: **Advanced → Go to … (unsafe)**).
They can only import documents their own Google account can open.

## Deploy
Push to `main`; `.github/workflows/deploy.yml` tests, builds and publishes to GitHub Pages
(repo **Settings → Pages → Source: GitHub Actions**).

## Install on Android
Open the site in Chrome → menu → *Install app*. Open it once with signal so it can download the app and your
clients; after that it opens offline.
