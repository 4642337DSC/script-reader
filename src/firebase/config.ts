import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';

/** Public-by-design web config, injected at build time from GitHub repository variables. */
export function readConfig() {
  const e = import.meta.env;
  return {
    apiKey: e.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: e.VITE_FIREBASE_PROJECT_ID as string | undefined,
    appId: e.VITE_FIREBASE_APP_ID as string | undefined,
  };
}

export function isConfigured(): boolean {
  const c = readConfig();
  return !!(c.apiKey && c.authDomain && c.projectId && c.appId);
}

export function initFirebase(): { app: FirebaseApp; db: Firestore; auth: Auth } {
  const app = initializeApp(readConfig());
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  return { app, db, auth: getAuth(app) };
}
