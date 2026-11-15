import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { App } from './App';
import { createMemoryBackend, createMemoryRepo } from '../data/memoryRepo';
import type { AuthApi, AuthUser, Repo } from '../data/types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { location.hash = ''; });

const boss: AuthUser = { email: 'boss@x.com', name: 'Boss' };
const auth: AuthApi = { onUser: (cb) => { cb(boss); return () => {}; }, signIn: async () => {}, signOut: async () => {} };

async function setup(wrap: (repo: Repo) => Repo = (r) => r) {
  const backend = createMemoryBackend();
  const real = createMemoryRepo({ backend, user: boss, adminEmail: 'boss@x.com' });
  const c1 = await real.createClient('Acme');
  await real.addScript(c1, 'S.docx', [{ title: 'V', paragraphs: ['a'] }]);
  await real.addScript(c1, 'Other.docx', [{ title: 'V', paragraphs: ['b'] }]);
  const r = render(<App auth={auth} makeRepo={() => wrap(real)} />);
  fireEvent.click(await r.findByText('Acme'));
  await r.findByText('S.docx');
  return { ...r, real, c1 };
}

describe('deleting a script gives feedback at once and works the first time', () => {
  test('the script leaves the list immediately, even while the real deletion is still running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    const w = await setup((repo) => ({ ...repo, deleteScript: async (c, s) => { await gate; return repo.deleteScript(c, s); } }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(w.getByLabelText('Delete S.docx'));
    await waitFor(() => expect(w.queryByText('S.docx')).toBeNull());
    expect(w.getByText('Deleting S.docx…')).toBeTruthy();
    expect(w.getByText('Other.docx')).toBeTruthy();
    release();
    await waitFor(() => expect(w.queryByText('Deleting S.docx…')).toBeNull());
    expect(w.queryByText('S.docx')).toBeNull();
  });

  test('only one confirmation is needed: a second tap on the same script does nothing while it deletes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    const deleteScript = vi.fn(async () => { await gate; });
    const w = await setup((repo) => ({ ...repo, deleteScript }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(w.getByLabelText('Delete S.docx'));
    expect(w.queryByLabelText('Delete S.docx')).toBeNull();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(deleteScript).toHaveBeenCalledTimes(1);
    release();
  });

  test('if the deletion fails the script comes back with a message, not a silent nothing', async () => {
    const w = await setup((repo) => ({ ...repo, deleteScript: async () => { throw new Error('offline'); } }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(w.getByLabelText('Delete S.docx'));
    expect(await w.findByText("Couldn't delete S.docx. Try again.")).toBeTruthy();
    expect(w.getByText('S.docx')).toBeTruthy();
    expect(w.getByLabelText('Delete S.docx')).toBeTruthy();
  });

  test('declining the confirmation changes nothing', async () => {
    const w = await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(w.getByLabelText('Delete S.docx'));
    expect(w.getByText('S.docx')).toBeTruthy();
    expect(w.queryByText('Deleting S.docx…')).toBeNull();
  });
});
