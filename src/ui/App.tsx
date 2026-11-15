import { useEffect, useMemo, useState } from 'preact/hooks';
import type { AuthApi, AuthUser, Repo } from '../data/types';
import { Shell } from './Shell';
import { SignIn } from './SignIn';

interface Props { auth: AuthApi; makeRepo: (user: AuthUser) => Repo }

export function App({ auth, makeRepo }: Props) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined); // undefined = still checking
  useEffect(() => auth.onUser(setUser), [auth]);
  const repo = useMemo(() => (user ? makeRepo(user) : null), [user?.email]);

  if (user === undefined) return <p>Loading…</p>;
  if (!user || !repo) return <SignIn onSignIn={() => auth.signIn()} />;
  return <Shell repo={repo} user={user} onSignOut={() => void auth.signOut()} />;
}
