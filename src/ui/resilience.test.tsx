import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { App } from './App';
import { ReaderRoute } from './ReaderRoute';
import { createMemoryBackend, createMemoryRepo, type MemoryRepo } from '../data/memoryRepo';
import type { AuthApi, AuthUser, Repo } from '../data/types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { location.hash = ''; localStorage.clear(); });

const boss: AuthUser = { email: 'boss@x.com', name: 'Boss' };
const anna: AuthUser = { email: 'anna@x.com', name: 'Anna' };
const auth = (u: AuthUser): AuthApi => ({ onUser: (cb) => { cb(u); return () => {}; }, signIn: async () => {}, signOut: async () => {} });

async function world() {
  const backend = createMemoryBackend();
  const made: Record<string, MemoryRepo> = {};
  const makeRepo = (u: AuthUser) => (made[u.email] = createMemoryRepo({ backend, user: u, adminEmail: 'boss@x.com' }));
  const bossRepo = makeRepo(boss);
  const c1 = await bossRepo.createClient('Acme');
  await bossRepo.setMembers(c1, ['anna@x.com']);
  const { scriptId } = await bossRepo.addScript(c1, 'S.docx', [{ title: 'Vid', paragraphs: ['one', 'two'] }]);
  return { backend, makeRepo, made, bossRepo, c1, scriptId };
}

describe('resilience', () => {
  test('losing access while reading shows a clear notice and OK goes home', async () => {
    const w = await world();
    const r = render(<App auth={auth(anna)} makeRepo={w.makeRepo} />);
    fireEvent.click(await r.findByText('Acme'));
    fireEvent.click(await r.findByText('S.docx'));
    fireEvent.click(await r.findByText('Vid'));
    await r.findByText('one');
    await act(async () => { await w.bossRepo.setMembers(w.c1, []); });
    expect(await r.findByText('You no longer have access to this client.')).toBeTruthy();
    fireEvent.click(r.getByText('OK'));
    expect(r.queryByText('You no longer have access to this client.')).toBeNull();
    expect(location.hash).toBe('#/');
  });

  test('deleting an open script shows a deleted message instead of a blank page', async () => {
    const w = await world();
    const r = render(<App auth={auth(anna)} makeRepo={w.makeRepo} />);
    fireEvent.click(await r.findByText('Acme'));
    fireEvent.click(await r.findByText('S.docx'));
    await r.findByText('Vid');
    await act(async () => { await w.bossRepo.deleteScript(w.c1, w.scriptId); });
    expect(await r.findByText('This script was deleted.')).toBeTruthy();
  });

  test('members never see Delete on scripts; the admin does and needs confirmation', async () => {
    const w = await world();
    const a = render(<App auth={auth(anna)} makeRepo={w.makeRepo} />);
    fireEvent.click(await a.findByText('Acme'));
    await a.findByText('S.docx');
    expect(a.queryByLabelText('Delete S.docx')).toBeNull();
    a.unmount();
    location.hash = `#/c/${w.c1}`;
    const b = render(<App auth={auth(boss)} makeRepo={w.makeRepo} />);
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(await b.findByLabelText('Delete S.docx'));
    expect(spy).toHaveBeenCalledWith('Delete S.docx for everyone?');
    expect(b.getByText('S.docx')).toBeTruthy();
    spy.mockReturnValue(true);
    await act(async () => { fireEvent.click(b.getByLabelText('Delete S.docx')); });
    await waitFor(() => expect(b.queryByText('S.docx')).toBeNull());
  });

  test('a member can clear an entry from "no longer in script"', async () => {
    const w = await world();
    await w.bossRepo.addScript(w.c1, 'S.docx', [{ title: 'Vid', paragraphs: ['one', 'two changed'] }]);
    const r = render(<App auth={auth(anna)} makeRepo={w.makeRepo} />);
    fireEvent.click(await r.findByText('Acme'));
    fireEvent.click(await r.findByText('S.docx'));
    fireEvent.click(await r.findByText('1 no longer in script'));
    expect(await r.findByText('two')).toBeTruthy();
    fireEvent.click(r.getByText('Clear'));
    expect(await r.findByText('Nothing here.')).toBeTruthy();
  });

  test('the sync badge reflects offline, unsynced changes and recovery', async () => {
    const w = await world();
    const r = render(<App auth={auth(anna)} makeRepo={w.makeRepo} />);
    fireEvent.click(await r.findByText('Acme'));
    fireEvent.click(await r.findByText('S.docx'));
    fireEvent.click(await r.findByText('Vid'));
    await r.findByText('one');
    expect(await r.findByText('Up to date')).toBeTruthy();
    act(() => w.made[anna.email].setOnline(false));
    expect(await r.findByText('Offline')).toBeTruthy();
    fireEvent.click(r.getByText('one'));
    fireEvent.click(r.getByText('Mark done'));
    expect(await r.findByText('Offline · unsynced changes')).toBeTruthy();
    act(() => w.made[anna.email].setOnline(true));
    expect(await r.findByText('Up to date')).toBeTruthy();
  });

  test('edits rejected after access was removed are reported with a count', async () => {
    const w = await world();
    const real = w.makeRepo(anna);
    const repo: Repo = { ...real, saveScript: async () => ({ droppedOnReject: 2 }) };
    const notices: string[] = [];
    const r = render(<ReaderRoute repo={repo} clientId={w.c1} scriptId={w.scriptId} videoId="x" onError={() => {}} onNotice={(m) => notices.push(m)} />);
    let videoId = '';
    real.watchScript(w.c1, w.scriptId, (d) => { videoId = d!.doc.videos[0].id; }, () => {})();
    r.unmount();
    const r2 = render(<ReaderRoute repo={repo} clientId={w.c1} scriptId={w.scriptId} videoId={videoId} onError={() => {}} onNotice={(m) => notices.push(m)} />);
    fireEvent.click(await r2.findByText('one'));
    fireEvent.click(r2.getByText('Mark done'));
    await waitFor(() => expect(notices).toEqual(["2 changes weren't saved because access was removed."]));
  });
});
