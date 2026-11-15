# Script Reader — Team Sync Design (v2)

Builds on `2026-11-15-script-reader-design.md` (the single-user app, already built and deployed to GitHub Pages).
This document replaces its Google Drive storage/sync with a shared cloud backend and adds clients and access control.

## Intent
Stefan's team uses the same app. Scripts are grouped by **client**. Stefan (the admin) decides which team members can open which clients. Everyone with access to a client sees the same scripts and the same locations/checkmarks, updated live (about one second) like Google Docs, and the app still works offline, syncing when signal returns.

## Goals
- **Clients:** every script belongs to exactly one client. The home screen lists the clients the signed-in person may open, then that client's scripts, then videos, then the existing reader.
- **Access control:** a person sees only clients they have been granted. Enforced by the backend's security rules, not only hidden in the UI.
- **Admin only:** only the admin creates/renames/deletes clients, grants/revokes access (by Google email), and deletes scripts. The admin screen is invisible to everyone else.
- **Same control for everyone with access:** add scripts (via "+"), set locations, tick done, split/merge, adjust font size.
- **Real-time:** a change by one person shows on everyone else's open screen in about a second. Different people editing **different sections** never overwrite each other. Same section at the same moment: last write wins.
- **Offline:** previously opened clients/scripts stay readable and editable with no signal; edits queue and sync on reconnect with no lost checkmarks/locations.
- Everything from v1 that is not storage keeps working: reflow/zoom, flowing-text layout, location autosuggest from recent locations, split/merge with undo, "no longer in script" list, re-import keeping state on unchanged text, installable PWA, GitHub Pages hosting.

## Decisions made by Stefan
- Backend: **Firebase** (Google's real-time database), chosen over Drive-folder sharing for true real-time behaviour.
- Scripts are added through the app's **"+" button**, not from a Drive folder. The Drive-folder sync of v1 is removed.
- Only Stefan manages clients and access. All other users have identical permissions.
- Stefan wants Google-Docs-like real-time sync across everyone with access.

## Non-goals / anti-goals
- No roles beyond admin vs. member; no per-script permissions; no comments, chat, presence cursors, or version history.
- No email invitations or notifications: access is granted by typing a Google email; the person simply signs in.
- Not an editor of script text; text only changes by re-adding a .docx.
- Anti-goal: a person ever seeing a client they were not granted, or being able to read it by calling the backend directly.
- Anti-goal: losing a checkmark/location because of reconnects, two devices of the same person, or simultaneous edits to different sections.
- Anti-goal: committing any secret or Stefan's personal data (name, email) to the public repo.

## Constraints
- The GitHub repo is **public**; GitHub Pages hosts the app. Only public-by-design Firebase web config may be in the repo/build (set as GitHub repository variables). No admin email in code.
- Firebase free tier (Spark). No paid services, no Cloud Functions (they need a paid plan).
- Sign-in is Google sign-in through Firebase Authentication; the Drive scopes and Google Cloud OAuth client of v1 are no longer used.
- Stefan's earlier test data (two sample scripts in Drive, any on-device scripts) does not need migrating.
- Everything in the v1 spec marked as a Global Constraint still applies (UI English, Romanian diacritics, text reflows at any zoom with no sideways scroll, ≥44px tap targets).

## Behaviour
- **First-run setup (done once by Stefan, builder supplies step-by-step instructions):** create the Firebase project, enable Google sign-in, add `4642337dsc.github.io` to authorized domains, create Firestore, publish the security rules, create the admin marker (a document in the Firebase console holding the admin's email; it must not be creatable by app users), and add the public web config as GitHub repository variables.
- **Admin screen:** list of clients; create/rename/delete client; per client, a list of member emails with add/remove. Emails are matched case-insensitively. Removing a member takes effect immediately (their open screen loses access).
- **"+" button:** appears inside a client. Picks a .docx on the device, parses it in the browser, stores it in the cloud so everyone sees it. Same name in the same client = re-import keeping state on unchanged text; unmatched old sections go to the existing "no longer in script" list.
- **Deleting** a script or client is admin-only and asks for confirmation; deleting a client deletes its scripts.
- **Signed-out / no access:** a signed-in person with no granted clients sees a clear "ask the admin for access" message.
- **Sync status:** show offline/online and whether there are unsynced changes (replaces v1's Sync button).
- **Recent locations** list is per client and shared (suggestions come from locations used in that client).

## Left to the builder
Firestore data model (section granularity so different sections never clobber each other, ordering of sections, how split/merge/re-import are written atomically), security rules and how they are tested (e.g. Firebase emulator), the admin marker mechanism details, offline persistence settings, removal of the v1 Drive code, migration of the existing GitHub Actions workflow to pass Firebase config, UI layout of client/admin screens (follow the v1 dark flowing-text style).

## Builder's calls (made by Claude after the builder check; not agreed with Stefan)
- **Identity:** membership and admin checks use the verified Google email, stored and compared lowercased, with `email_verified` required by the rules.
- **Concurrency:** data is written per section at field level. A re-import rewrites only sections whose text is new, changed, or newly orphaned; unchanged sections are not touched, so a simultaneous tick on them survives. A split or merge that happens at the same instant as a tick on the same section may lose that one tick; accepted.
- **Removed access / deleted script while offline:** the person's queued edits for it are dropped when the backend rejects them, and the app shows a notice saying how many changes were not saved. Never silent.
- **Font size and last-opened screen** are local to the device, not synced.
- **Admin** implicitly sees and can open every client without being listed as a member.
- **Assumed scale** (to size the data model and stay inside the free tier): up to ~10 people, ~20 clients, ~200 scripts, ~50 sections per script. Live listeners attach only to the script that is open and to the lists the person can see.
- **v1 storage dropped:** the Drive code, Google OAuth client, the v1 `sync.ts`/`db.ts` queue are removed in favour of Firebase's own offline cache. Pure logic (docx parsing, section split/merge/location/done, re-import matching, recent-locations) and the UI are kept.
- **"No longer in script"** list stays per script, shared, and any member can clear an entry.
