import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { App } from './App';
import { createMemoryBackend, createMemoryRepo, type MemoryBackend } from '../data/memoryRepo';
import type { AuthApi, AuthUser } from '../data/types';

afterEach(cleanup);
beforeEach(() => { location.hash = ''; });

function fakeAuth(initial: AuthUser | null, signIn?: () => Promise<void>) {
  let cb: (u: AuthUser | null) => void = () => {};
  const api: AuthApi & { emit(u: AuthUser | null): void } = {
    onUser(c) { cb = c; c(initial); return () => {}; },
    signIn: signIn ?? (async () => {}),
    signOut: async () => {},
    emit: (u) => cb(u),
  };
  return api;
}
const anna: AuthUser = { email: 'anna@x.com', name: 'Anna' };

async function seeded() {
  const backend = createMemoryBackend();
  const boss = createMemoryRepo({ backend, user: { email: 'boss@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
  const c1 = await boss.createClient('Acme');
  await boss.createClient('Beta');
  await boss.setMembers(c1, ['anna@x.com']);
  const makeRepo = (u: AuthUser) => createMemoryRepo({ backend, user: u, adminEmail: 'boss@x.com' });
  return { backend, boss, c1, makeRepo };
}

describe('App shell', () => {
  test('signed-out shows the sign-in button', async () => {
    const { makeRepo } = await seeded();
    const { findByText } = render(<App auth={fakeAuth(null)} makeRepo={makeRepo} />);
    expect(await findByText('Sign in with Google')).toBeTruthy();
  });

  test('a failed sign-in shows a friendly message', async () => {
    const { makeRepo } = await seeded();
    const signIn = vi.fn().mockRejectedValue(new Error('popup closed'));
    const { findByText } = render(<App auth={fakeAuth(null, signIn)} makeRepo={makeRepo} />);
    fireEvent.click(await findByText('Sign in with Google'));
    expect(await findByText(/Sign-in didn.t complete, try again/)).toBeTruthy();
  });

  test('a user with no clients sees how to get access, with their email', async () => {
    const { makeRepo } = await seeded();
    const { findByText } = render(<App auth={fakeAuth({ email: 'eve@x.com', name: 'Eve' })} makeRepo={makeRepo} />);
    expect(await findByText(/Ask the admin to add your email \(eve@x\.com\)/)).toBeTruthy();
  });

  test('a member sees only their clients', async () => {
    const { makeRepo } = await seeded();
    const { findByText, queryByText } = render(<App auth={fakeAuth(anna)} makeRepo={makeRepo} />);
    expect(await findByText('Acme')).toBeTruthy();
    expect(queryByText('Beta')).toBeNull();
  });

  test('signing in later switches from the sign-in screen to the clients', async () => {
    const { makeRepo } = await seeded();
    const auth = fakeAuth(null);
    const { findByText } = render(<App auth={auth} makeRepo={makeRepo} />);
    await findByText('Sign in with Google');
    auth.emit(anna);
    expect(await findByText('Acme')).toBeTruthy();
  });
});
