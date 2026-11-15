import './ui/styles.css';
import { render } from 'preact';
import { App } from './ui/App';
import { initFirebase, isConfigured } from './firebase/config';
import { createAuth } from './firebase/auth';
import { createFirestoreRepo } from './data/firestoreRepo';
import { createFirebaseGenerate, createGeminiClassifier } from './ai/gemini';

const root = document.getElementById('app')!;
if (!isConfigured()) {
  render(<p>This build has no Firebase settings yet. See the README, "Firebase setup".</p>, root);
} else {
  const { app, db, auth } = initFirebase();
  const classify = createGeminiClassifier(createFirebaseGenerate(app));
  render(<App auth={createAuth(auth)} makeRepo={(u) => createFirestoreRepo(db, u)} classify={classify} />, root);
}
