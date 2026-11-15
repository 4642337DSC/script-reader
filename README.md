# Script Reader

Personal PWA for reading short-form video scripts (.docx) on Android/web, assigning a location to each
section, splitting sections, and ticking them off. Works offline; syncs through Google Drive.

## How it works
- Put `.docx` scripts in a Drive folder named **Scripts** (My Drive root or anywhere your account can see it).
  Each file = titles + spoken text. A title is a Word *Heading*/*Title* style paragraph, or (if the file has
  no headings) a short all-bold line.
- Open the app, tap **Sync**. Scripts are downloaded to the device; locations, splits and checkmarks are stored
  on the device and synced to a hidden app-data file in your Drive.
- Re-sending an edited .docx keeps state on unchanged paragraphs; paragraphs that disappeared are listed
  under "no longer in script".

## Develop
```
npm install
npm test          # unit tests
npm run dev       # local dev server
npm run build     # production build in dist/
```

## One-time Google setup (needed for Sync)
1. Go to https://console.cloud.google.com, create a project (e.g. "Script Reader").
2. APIs & Services → Library → enable **Google Drive API**.
3. APIs & Services → OAuth consent screen → External. App name "Script Reader", your email. Add scopes
   `.../auth/drive.readonly` and `.../auth/drive.appdata`. Then **Publish app → In production**
   (otherwise sign-in expires every 7 days; you will see a one-time "unverified app" warning — continue).
4. Credentials → Create credentials → OAuth client ID → *Web application*. Authorized JavaScript origins:
   `http://localhost:5173` and your deployed URL (e.g. `https://<you>.github.io`).
5. Put the client ID in `.env.local`: `VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com`
   (and, for GitHub Pages, as a repository *variable* named `VITE_GOOGLE_CLIENT_ID`).

## Deploy (GitHub Pages)
Push to a GitHub repo's `main`; `.github/workflows/deploy.yml` tests, builds, and publishes.
Enable Pages → Source: GitHub Actions.

## Install on Android
Open the deployed URL in Chrome → menu → *Install app* / *Add to Home screen*. Open it once with signal,
tap Sync, then it works in airplane mode.
