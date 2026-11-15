import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { App } from './App';
import { createMemoryBackend, createMemoryRepo } from '../data/memoryRepo';
import type { AuthApi, AuthUser, ImportedVideo, ParsedVideo, ScriptData } from '../data/types';

afterEach(cleanup);
beforeEach(() => { location.hash = ''; localStorage.clear(); });

const anna: AuthUser = { email: 'anna@x.com', name: 'Anna' };
const auth: AuthApi = { onUser: (cb) => { cb(anna); return () => {}; }, signIn: async () => {}, signOut: async () => {} };

async function open(videos: ImportedVideo[] | ParsedVideo[], goTo?: string) {
  const backend = createMemoryBackend();
  const boss = createMemoryRepo({ backend, user: { email: 'boss@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
  const c1 = await boss.createClient('Acme');
  await boss.setMembers(c1, ['anna@x.com', 'bob@x.com']);
  const makeRepo = (u: AuthUser) => createMemoryRepo({ backend, user: u, adminEmail: 'boss@x.com' });
  const bob = makeRepo({ email: 'bob@x.com', name: 'Bob' });
  const { scriptId } = await bob.addScript(c1, 'S.docx', videos);
  let cur: ScriptData | null = null;
  bob.watchScript(c1, scriptId, (d) => { cur = d; }, () => {});
  let recents: string[] = [];
  bob.watchRecents(c1, (l) => { recents = l; });
  const r = render(<App auth={auth} makeRepo={makeRepo} />);
  fireEvent.click(await r.findByText('Acme'));
  fireEvent.click(await r.findByText('S.docx'));
  if (goTo) { fireEvent.click(await r.findByText(goTo)); }
  return { ...r, cur: () => cur!, recents: () => recents };
}

const imp = (title: string, group: string | null, ...paras: { text: string; cue?: string }[]): ImportedVideo => ({
  title, group, notes: '', paragraphs: paras.map((p) => ({ source: p.text, text: p.text, suggestedLocation: p.cue ?? null })),
});

describe('groups in the video list', () => {
  test('videos are listed under their group headings, in order', async () => {
    const w = await open([imp('One', 'Print', { text: 'a' }), imp('Two', 'Print', { text: 'b' }), imp('Three', 'Shop', { text: 'c' })]);
    await w.findByText('Three');
    const heads = Array.from(w.container.querySelectorAll('.group-head')).map((h) => h.textContent);
    expect(heads).toEqual(['Print', 'Shop']);
    const order = Array.from(w.container.querySelectorAll('.group-head, .list-item')).map((e) => e.textContent!.replace(/\d+\/\d+ done.*/, '').trim());
    expect(order.slice(0, 7)).toEqual(['Print', 'One', 'Two', 'Shop', 'Three']);
  });

  test('a script without groups looks as before', async () => {
    const w = await open([{ title: 'Only', paragraphs: ['a'] }]);
    await w.findByText('Only');
    expect(w.container.querySelectorAll('.group-head').length).toBe(0);
  });
});

describe('suggested locations', () => {
  const doc = [imp('Film', 'Print', { text: 'first line', cue: 'tipografie' }, { text: 'second line' })];

  test('a suggestion shows as a chip; Accept makes it the real location and a recent one', async () => {
    const w = await open(doc, 'Film');
    expect(await w.findByText('📍 tipografie?')).toBeTruthy();
    fireEvent.click(w.getByLabelText('Accept suggested location'));
    expect(await w.findByText('📍 tipografie')).toBeTruthy();
    expect(w.queryByText('📍 tipografie?')).toBeNull();
    await waitFor(() => expect(w.cur().doc.videos[0].sections[0]).toMatchObject({ location: 'tipografie' }));
    await waitFor(() => expect(w.recents()).toEqual(['tipografie']));
  });

  test('Dismiss removes the suggestion without setting a location', async () => {
    const w = await open(doc, 'Film');
    await w.findByText('📍 tipografie?');
    fireEvent.click(w.getByLabelText('Dismiss suggested location'));
    await waitFor(() => expect(w.queryByText('📍 tipografie?')).toBeNull());
    await waitFor(() => expect(w.cur().doc.videos[0].sections[0].location).toBeNull());
    expect(w.cur().doc.videos[0].sections[0].suggestedLocation).toBe('');
  });

  test('tapping a chip button does not open the section menu', async () => {
    const w = await open(doc, 'Film');
    await w.findByText('📍 tipografie?');
    fireEvent.click(w.getByLabelText('Dismiss suggested location'));
    expect(w.queryByText('Set location')).toBeNull();
  });

  test('no chip once the section has a real location', async () => {
    const w = await open(doc, 'Film');
    await w.findByText('📍 tipografie?');
    fireEvent.click(w.container.querySelectorAll('.loc-btn')[0]);
    fireEvent.input(w.getByPlaceholderText('Location'), { target: { value: 'Office' } });
    fireEvent.click(w.container.querySelector('.loc-backdrop')!);
    expect(await w.findByText('📍 Office')).toBeTruthy();
    expect(w.queryByText('📍 tipografie?')).toBeNull();
  });
});
