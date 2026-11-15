import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { App } from './App';
import { createMemoryBackend, createMemoryRepo } from '../data/memoryRepo';
import { setText } from '../model/sections';
import { para } from '../testing/dom';
import type { AuthApi, AuthUser, ScriptData } from '../data/types';

afterEach(cleanup);
beforeEach(() => { location.hash = ''; localStorage.clear(); });

const anna: AuthUser = { email: 'anna@x.com', name: 'Anna' };
const auth: AuthApi = { onUser: (cb) => { cb(anna); return () => {}; }, signIn: async () => {}, signOut: async () => {} };

async function open() {
  const backend = createMemoryBackend();
  const boss = createMemoryRepo({ backend, user: { email: 'boss@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
  const c1 = await boss.createClient('Acme');
  await boss.setMembers(c1, ['anna@x.com', 'bob@x.com']);
  const makeRepo = (u: AuthUser) => createMemoryRepo({ backend, user: u, adminEmail: 'boss@x.com' });
  const bob = makeRepo({ email: 'bob@x.com', name: 'Bob' });
  const { scriptId } = await bob.addScript(c1, 'S.docx', [{
    title: 'Vid', group: null, notes: 'Cadre: x',
    paragraphs: [{ source: 'first para', text: 'first para' }, { source: 'second para', text: 'second para' }],
  }]);
  let cur: ScriptData | null = null;
  bob.watchScript(c1, scriptId, (d) => { cur = d; }, () => {});
  const r = render(<App auth={auth} makeRepo={makeRepo} />);
  fireEvent.click(await r.findByText('Acme'));
  fireEvent.click(await r.findByText('S.docx'));
  fireEvent.click(await r.findByText('Vid'));
  await waitFor(() => expect(para(r.container, 'first para')).toBeTruthy());
  return { ...r, bob, c1, scriptId, cur: () => cur! };
}

describe('editing', () => {
  test('Edit text saves the new text, keeps the original, and reaches other members', async () => {
    const w = await open();
    fireEvent.click(w.container.querySelectorAll('.edit-btn')[0]);
    const box = w.getByLabelText('Section text') as HTMLTextAreaElement;
    expect(box.value).toBe('first para');
    fireEvent.input(box, { target: { value: 'first para (fixed)' } });
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(para(w.container, 'first para (fixed)')).toBeTruthy());
    await waitFor(() => expect(w.cur().doc.videos[0].sections[0]).toMatchObject({ text: 'first para (fixed)', originalText: 'first para' }));
  });

  test('blank text is not saved and the old text stays', async () => {
    const w = await open();
    fireEvent.click(w.container.querySelectorAll('.edit-btn')[0]);
    fireEvent.input(w.getByLabelText('Section text'), { target: { value: '   ' } });
    fireEvent.pointerDown(document.body);
    expect(w.queryByLabelText('Section text')).toBeNull();
    expect(para(w.container, 'first para')).toBeTruthy();
    expect(w.cur().doc.videos[0].sections[0].text).toBe('first para');
  });

  test('the video title can be edited; the original title is kept', async () => {
    const w = await open();
    fireEvent.click(w.getByLabelText('Edit title'));
    fireEvent.input(w.getByLabelText('Title'), { target: { value: 'Vid renamed' } });
    fireEvent.keyDown(w.getByLabelText('Title'), { key: 'Enter' });
    expect(await w.findByText('Vid renamed')).toBeTruthy();
    await waitFor(() => expect(w.cur().doc.videos[0]).toMatchObject({ title: 'Vid renamed', originalTitle: 'Vid' }));
  });

  test('Notes show collapsed, open on tap, can be edited and cleared', async () => {
    const w = await open();
    expect(w.queryByText('Cadre: x')).toBeNull();
    fireEvent.click(w.getByText('Notes'));
    expect(w.getByText('Cadre: x')).toBeTruthy();
    fireEvent.click(w.getByText('Edit notes'));
    fireEvent.input(w.getByLabelText('Notes text'), { target: { value: 'Cadre: y' } });
    fireEvent.pointerDown(document.body);
    expect(await w.findByText('Cadre: y')).toBeTruthy();
    await waitFor(() => expect(w.cur().doc.videos[0]).toMatchObject({ notes: 'Cadre: y', originalNotes: 'Cadre: x' }));
    fireEvent.click(w.getByText('Edit notes'));
    fireEvent.input(w.getByLabelText('Notes text'), { target: { value: '' } });
    fireEvent.pointerDown(document.body);
    expect(await w.findByText('No notes')).toBeTruthy();
  });

  test('an edit made by someone else appears in the open reader', async () => {
    const w = await open();
    const before = w.cur();
    const v = setText(before.doc.videos[0], before.doc.videos[0].sections[1].id, 'second para (bob fixed)', Date.now());
    await act(async () => { await w.bob.saveScript(w.c1, w.scriptId, before, { ...before.doc, videos: [v] }); });
    await waitFor(() => expect(para(w.container, 'second para (bob fixed)')).toBeTruthy());
  });
});
