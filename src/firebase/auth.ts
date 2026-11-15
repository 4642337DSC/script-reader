import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as fbSignOut, type Auth } from 'firebase/auth';
import type { AuthApi } from '../data/types';

export function createAuth(auth: Auth): AuthApi {
  return {
    onUser(cb) {
      return onAuthStateChanged(auth, (u) =>
        cb(u && u.email ? { email: u.email.toLowerCase(), name: u.displayName ?? u.email } : null));
    },
    async signIn() { await signInWithPopup(auth, new GoogleAuthProvider()); },
    async signOut() { await fbSignOut(auth); },
    // Asked only when someone imports a Google Doc; the token is used once and never stored.
    async getDriveToken() {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.readonly');
      if (auth.currentUser?.email) provider.setCustomParameters({ login_hint: auth.currentUser.email });
      const result = await signInWithPopup(auth, provider);
      const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
      if (!token) throw new Error('no access token');
      return token;
    },
  };
}
