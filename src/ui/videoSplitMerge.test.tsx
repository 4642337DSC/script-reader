import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { App } from './App';
import { createMemoryBackend, createMemoryRepo } from '../data/memoryRepo';
import type { AuthApi, AuthUser } from '../data/types';

afterEach(() => cleanup());
beforeEach(() => { location.hash = ''; });

const boss: AuthUser = { email: 'boss@x.com', name: 'Boss' };
const auth: AuthApi = { onUser: (cb) => { cb(boss); return () => {}; }, signIn: async () => {}, signOut: async () => {} };

async function setup() {
  const backend = createMemoryBackend();
  const repo = createMemoryRepo({ backend, user: boss, adminEmail: 'boss@x.com' });
  const c = await repo.createClient('Acme');
  const s = await repo.addScript(c, 'Script', [
    { title: 'Alpha', group: null, notes: '', paragraphs: [{ source: 'One.', text: 'One.' }, { source: 'Two.', text: 'Two.' }, { source: 'Three.', text: 'Three.' }] },
    { title: 'Beta', group: null, notes: '', paragraphs: [{ source: 'Four.', text: 'Four.' }] },
  ]);
  const scriptId = s.scriptId;
  return { backend, repo, c, makeRepo: (u: AuthUser) => createMemoryRepo({ backend, user: u, adminEmail: 'boss@x.com' }), scriptId };
}

describe('splitting and merging videos', () => {
  test('a gap offers "new video here" and the video list then shows the new video', async () => {
    const w = await setup();
    const r = render(<App auth={auth} makeRepo={w.makeRepo} />);
    fireEvent.click(await r.findByText('Acme'));
    fireEvent.click(await r.findByText('Script'));
    fireEvent.click(await r.findByText('Alpha'));
    const split = await r.findAllByLabelText('Start a new video here');
    expect(split.length).toBe(2); // before card 2 and before card 3
    fireEvent.click(split[0]);
    fireEvent.click(await r.findByText('← Back'));
    expect(await r.findByText('Alpha (2)')).toBeTruthy();
  });

  test('"Merge" on a video joins it into the one above', async () => {
    const w = await setup();
    const r = render(<App auth={auth} makeRepo={w.makeRepo} />);
    fireEvent.click(await r.findByText('Acme'));
    fireEvent.click(await r.findByText('Script'));
    await r.findByText('Beta');
    expect(r.queryByLabelText('Merge Alpha into the video above')).toBeNull();
    fireEvent.click(r.getByLabelText('Merge Beta into the video above'));
    await waitFor(() => expect(r.queryByText('Beta')).toBeNull());
    expect(await r.findByText(/0\/4 done/)).toBeTruthy();
  });
});
