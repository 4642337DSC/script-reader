import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { App } from './App';
import { createMemoryBackend, createMemoryRepo } from '../data/memoryRepo';
import { toggleDone } from '../model/sections';
import { makeDocx } from '../testing/makeDocx';
import type { AuthApi, AuthUser, ScriptData } from '../data/types';

afterEach(cleanup);
beforeEach(() => { location.hash = ''; });

const anna: AuthUser = { email: 'anna@x.com', name: 'Anna' };
const auth = (u: AuthUser): AuthApi => ({ onUser: (cb) => { cb(u); return () => {}; }, signIn: async () => {}, signOut: async () => {} });
const docxFile = async (name: string, ...paras: string[]) =>
  new File([await makeDocx([{ text: 'Title', style: 'Heading1' }, ...paras.map((text) => ({ text }))])], name);

async function setup() {
  const backend = createMemoryBackend();
  const boss = createMemoryRepo({ backend, user: { email: 'boss@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
  const c1 = await boss.createClient('Acme');
  await boss.setMembers(c1, ['anna@x.com']);
  const makeRepo = (u: AuthUser) => createMemoryRepo({ backend, user: u, adminEmail: 'boss@x.com' });
  const r = render(<App auth={auth(anna)} makeRepo={makeRepo} />);
  return { ...r, c1, makeRepo };
}
const pick = (container: Element, file: File) =>
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });

describe('add script (+)', () => {
  test('a valid file appears in the client list', async () => {
    const w = await setup();
    fireEvent.click(await w.findByText('Acme'));
    await w.findByText(/No scripts yet/);
    pick(w.container, await docxFile('New.docx', 'one', 'two'));
    expect(await w.findByText('New.docx')).toBeTruthy();
    expect(await w.findByText('Added New.docx')).toBeTruthy();
  });

  test('the same name updates the script and keeps done on unchanged text', async () => {
    const w = await setup();
    fireEvent.click(await w.findByText('Acme'));
    await w.findByText(/No scripts yet/);
    pick(w.container, await docxFile('Same.docx', 'one', 'two'));
    await w.findByText('Same.docx');
    const peer = w.makeRepo(anna);
    let cur: ScriptData | null = null;
    let id = '';
    peer.watchScripts(w.c1, (l) => { id = l[0]?.id ?? ''; }, () => {})();
    peer.watchScript(w.c1, id, (d) => { cur = d; }, () => {});
    const v = toggleDone(cur!.doc.videos[0], cur!.doc.videos[0].sections[0].id, Date.now());
    await peer.saveScript(w.c1, id, cur!, { ...cur!.doc, videos: [v] });
    pick(w.container, await docxFile('Same.docx', 'one', 'two changed'));
    expect(await w.findByText(/Updated Same\.docx/)).toBeTruthy();
    await waitFor(() => expect(cur!.doc.videos[0].sections.map((s) => [s.text, s.done])).toEqual([['one', true], ['two changed', false]]));
  });

  test('a corrupt file shows an error and adds nothing', async () => {
    const w = await setup();
    fireEvent.click(await w.findByText('Acme'));
    await w.findByText(/No scripts yet/);
    pick(w.container, new File(['not a docx'], 'bad.docx'));
    expect(await w.findByText(/Couldn.t read bad\.docx/)).toBeTruthy();
    expect(w.getByText(/No scripts yet/)).toBeTruthy();
  });

  test('the + button is not shown outside a client', async () => {
    const w = await setup();
    await w.findByText('Acme');
    expect(w.queryByLabelText('Add script file')).toBeNull();
  });
});
