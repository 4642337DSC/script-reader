import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { App } from './App';
import { createMemoryBackend, createMemoryRepo } from '../data/memoryRepo';
import { toggleDone, setLocation } from '../model/sections';
import type { AuthApi, AuthUser, ScriptData } from '../data/types';

afterEach(cleanup);
beforeEach(() => { location.hash = ''; });

const anna: AuthUser = { email: 'anna@x.com', name: 'Anna' };
const auth = (u: AuthUser): AuthApi => ({ onUser: (cb) => { cb(u); return () => {}; }, signIn: async () => {}, signOut: async () => {} });

async function world() {
  const backend = createMemoryBackend();
  const boss = createMemoryRepo({ backend, user: { email: 'boss@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
  const c1 = await boss.createClient('Acme');
  await boss.setMembers(c1, ['anna@x.com']);
  const makeRepo = (u: AuthUser) => createMemoryRepo({ backend, user: u, adminEmail: 'boss@x.com' });
  const colleague = makeRepo({ email: 'anna@x.com', name: 'Anna' });
  return { c1, makeRepo, colleague };
}

describe('lists', () => {
  test('client -> scripts (with video count) -> videos (with progress) and back', async () => {
    const w = await world();
    await w.colleague.addScript(w.c1, 'Batch.docx', [{ title: 'Hook video', paragraphs: ['a', 'b'] }, { title: 'Second', paragraphs: ['c'] }]);
    const { findByText, getByText } = render(<App auth={auth(anna)} makeRepo={w.makeRepo} />);
    fireEvent.click(await findByText('Acme'));
    expect(await findByText('Batch.docx')).toBeTruthy();
    expect(getByText('2 videos')).toBeTruthy();
    fireEvent.click(getByText('Batch.docx'));
    expect(await findByText('Hook video')).toBeTruthy();
    expect(getByText('0/2 done')).toBeTruthy();
    fireEvent.click(getByText('← Back'));
    expect(await findByText('Batch.docx')).toBeTruthy();
    fireEvent.click(getByText('← Back'));
    expect(await findByText('Acme')).toBeTruthy();
  });

  test('empty client shows the add hint', async () => {
    const w = await world();
    const { findByText } = render(<App auth={auth(anna)} makeRepo={w.makeRepo} />);
    fireEvent.click(await findByText('Acme'));
    expect(await findByText(/No scripts yet/)).toBeTruthy();
  });

  test('a script added by someone else appears live; progress and locations update live', async () => {
    const w = await world();
    const { findByText, getByText } = render(<App auth={auth(anna)} makeRepo={w.makeRepo} />);
    fireEvent.click(await findByText('Acme'));
    await findByText(/No scripts yet/);
    let id = '';
    await act(async () => { id = (await w.colleague.addScript(w.c1, 'Live.docx', [{ title: 'V', paragraphs: ['a', 'b'] }])).scriptId; });
    fireEvent.click(await findByText('Live.docx'));
    await findByText('0/2 done');
    let cur: ScriptData | null = null;
    w.colleague.watchScript(w.c1, id, (d) => { cur = d; }, () => {})();
    let v = toggleDone(cur!.doc.videos[0], cur!.doc.videos[0].sections[0].id, 9);
    v = setLocation(v, v.sections[1].id, 'Kitchen', 9);
    await act(async () => { await w.colleague.saveScript(w.c1, id, cur!, { ...cur!.doc, videos: [v] }); });
    expect(await findByText(/1\/2 done/)).toBeTruthy();
    expect(getByText(/Kitchen/)).toBeTruthy();
  });
});
