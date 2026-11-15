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
  };
}
