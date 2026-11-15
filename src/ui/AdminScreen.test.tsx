import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { App } from './App';
import { createMemoryBackend, createMemoryRepo } from '../data/memoryRepo';
import type { AuthApi, AuthUser, Client } from '../data/types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { location.hash = ''; });

const boss: AuthUser = { email: 'boss@x.com', name: 'Boss' };
const anna: AuthUser = { email: 'anna@x.com', name: 'Anna' };
const auth = (u: AuthUser): AuthApi => ({ onUser: (cb) => { cb(u); return () => {}; }, signIn: async () => {}, signOut: async () => {} });

function world() {
  const backend = createMemoryBackend();
  const makeRepo = (u: AuthUser) => createMemoryRepo({ backend, user: u, adminEmail: 'boss@x.com' });
  const annaRepo = makeRepo(anna);
  const clientsOf = () => { let l: Client[] = []; annaRepo.watchClients((c) => { l = c; }, () => {})(); return l.map((c) => c.name); };
  return { makeRepo, clientsOf, bossRepo: makeRepo(boss) };
}

describe('admin screen', () => {
  test('the Admin link is hidden for members and shown for the admin', async () => {
    const w = world();
    await w.bossRepo.setMembers(await w.bossRepo.createClient('Acme'), ['anna@x.com']);
    const a = render(<App auth={auth(anna)} makeRepo={w.makeRepo} />);
    await a.findByText('Acme');
    expect(a.queryByText('Admin')).toBeNull();
    a.unmount();
    const b = render(<App auth={auth(boss)} makeRepo={w.makeRepo} />);
    expect(await b.findByText('Admin')).toBeTruthy();
  });

  test('a non-admin who opens #/admin is sent home', async () => {
    const w = world();
    await w.bossRepo.setMembers(await w.bossRepo.createClient('Acme'), ['anna@x.com']);
    location.hash = '#/admin';
    const r = render(<App auth={auth(anna)} makeRepo={w.makeRepo} />);
    await waitFor(() => expect(location.hash).toBe('#/'));
    expect(await r.findByText('Acme')).toBeTruthy();
  });

  test('create a client, add a member (visible to them), then remove them', async () => {
    const w = world();
    const r = render(<App auth={auth(boss)} makeRepo={w.makeRepo} />);
    fireEvent.click(await r.findByText('Admin'));
    fireEvent.input(await r.findByPlaceholderText('New client name'), { target: { value: 'Gamma' } });
    fireEvent.click(r.getByText('Add client'));
    await r.findByText('Gamma');
    expect(w.clientsOf()).toEqual([]);
    fireEvent.input(r.getByLabelText('Add member to Gamma'), { target: { value: 'Anna@X.com' } });
    fireEvent.click(r.getByText('Add member'));
    await r.findByText('anna@x.com');
    expect(w.clientsOf()).toEqual(['Gamma']);
    fireEvent.click(r.getByLabelText('Remove anna@x.com'));
    await waitFor(() => expect(w.clientsOf()).toEqual([]));
  });

  test('an invalid email is rejected with a message', async () => {
    const w = world();
    await w.bossRepo.createClient('Gamma');
    const r = render(<App auth={auth(boss)} makeRepo={w.makeRepo} />);
    fireEvent.click(await r.findByText('Admin'));
    fireEvent.input(await r.findByLabelText('Add member to Gamma'), { target: { value: 'not-an-email' } });
    fireEvent.click(r.getByText('Add member'));
    expect(await r.findByText('Enter a valid email address.')).toBeTruthy();
  });

  test('deleting a client needs confirmation', async () => {
    const w = world();
    await w.bossRepo.createClient('Gamma');
    const r = render(<App auth={auth(boss)} makeRepo={w.makeRepo} />);
    fireEvent.click(await r.findByText('Admin'));
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(await r.findByLabelText('Delete Gamma'));
    expect(spy).toHaveBeenCalledWith('Delete Gamma and all its scripts for everyone?');
    expect(r.getByText('Gamma')).toBeTruthy();
    spy.mockReturnValue(true);
    await act(async () => { fireEvent.click(r.getByLabelText('Delete Gamma')); });
    await waitFor(() => expect(r.queryByText('Gamma')).toBeNull());
  });

  test('rename a client', async () => {
    const w = world();
    await w.bossRepo.createClient('Gamma');
    const r = render(<App auth={auth(boss)} makeRepo={w.makeRepo} />);
    fireEvent.click(await r.findByText('Admin'));
    vi.spyOn(window, 'prompt').mockReturnValue('Delta');
    fireEvent.click(await r.findByLabelText('Rename Gamma'));
    expect(await r.findByText('Delta')).toBeTruthy();
  });
});
