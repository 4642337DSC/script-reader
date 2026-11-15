import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { App } from './App';
import { createMemoryBackend, createMemoryRepo } from '../data/memoryRepo';
import { toggleDone } from '../model/sections';
import { para } from '../testing/dom';
import type { AuthApi, AuthUser, ScriptData } from '../data/types';

afterEach(cleanup);
beforeEach(() => { location.hash = ''; localStorage.clear(); });

const anna: AuthUser = { email: 'anna@x.com', name: 'Anna' };
const auth = (u: AuthUser): AuthApi => ({ onUser: (cb) => { cb(u); return () => {}; }, signIn: async () => {}, signOut: async () => {} });

async function open() {
  const backend = createMemoryBackend();
  const boss = createMemoryRepo({ backend, user: { email: 'boss@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
  const c1 = await boss.createClient('Acme');
  await boss.setMembers(c1, ['anna@x.com', 'bob@x.com']);
  const makeRepo = (u: AuthUser) => createMemoryRepo({ backend, user: u, adminEmail: 'boss@x.com' });
  const bob = makeRepo({ email: 'bob@x.com', name: 'Bob' });
  const { scriptId } = await bob.addScript(c1, 'S.docx', [{ title: 'Vid', paragraphs: ['first para', 'second para'] }]);
  let cur: ScriptData | null = null;
  bob.watchScript(c1, scriptId, (d) => { cur = d; }, () => {});
  const r = render(<App auth={auth(anna)} makeRepo={makeRepo} />);
  fireEvent.click(await r.findByText('Acme'));
  fireEvent.click(await r.findByText('S.docx'));
  fireEvent.click(await r.findByText('Vid'));
  await waitFor(() => expect(para(r.container, 'first para')).toBeTruthy());
  return { ...r, bob, c1, scriptId, cur: () => cur! };
}

describe('reader wiring', () => {
  test('ticking in the reader reaches another person\'s watcher', async () => {
    const w = await open();
    fireEvent.click(w.container.querySelectorAll('.done-btn')[0]);
    await waitFor(() => expect(w.cur().doc.videos[0].sections[0].done).toBe(true));
  });

  test('a remote tick appears in the open reader without reloading', async () => {
    const w = await open();
    const before = w.cur();
    const v = toggleDone(before.doc.videos[0], before.doc.videos[0].sections[1].id, Date.now());
    await act(async () => { await w.bob.saveScript(w.c1, w.scriptId, before, { ...before.doc, videos: [v] }); });
    await waitFor(() => expect(w.container.querySelectorAll('[data-section].done').length).toBe(1));
  });

  test('a location added by someone else shows as a suggestion for everyone in the client', async () => {
    const w = await open();
    await act(async () => { await w.bob.addRecent(w.c1, 'Garage'); });
    fireEvent.click(w.container.querySelectorAll('.loc-btn')[0]);
    expect(await w.findByText('Garage')).toBeTruthy();
  });

  test('picking a location saves it and adds it to the client suggestions', async () => {
    const w = await open();
    fireEvent.click(w.container.querySelectorAll('.loc-btn')[0]);
    fireEvent.input(w.getByPlaceholderText('Location'), { target: { value: 'Office' } });
    fireEvent.click(w.getByText('Save'));
    await waitFor(() => expect(w.cur().doc.videos[0].sections[0].location).toBe('Office'));
    let list: string[] = [];
    w.bob.watchRecents(w.c1, (l) => { list = l; })();
    expect(list).toEqual(['Office']);
  });

  test('font scale persists in localStorage', async () => {
    const w = await open();
    fireEvent.click(w.getByLabelText('Larger text'));
    expect(localStorage.getItem('fontScale')).toBe('1.25');
  });
});
