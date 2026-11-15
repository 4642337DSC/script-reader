import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { App } from './App';
import { createMemoryBackend, createMemoryRepo } from '../data/memoryRepo';
import { AiUnavailable, type AiLabel, type Classifier } from '../ai/classify';
import { makeDocx } from '../testing/makeDocx';
import type { AuthApi, AuthUser, ScriptData } from '../data/types';

afterEach(cleanup);
beforeEach(() => { location.hash = ''; localStorage.clear(); });

const anna: AuthUser = { email: 'anna@x.com', name: 'Anna' };
const auth: AuthApi = { onUser: (cb) => { cb(anna); return () => {}; }, signIn: async () => {}, signOut: async () => {} };

const smartClassify: Classifier = async (ps) =>
  ps.map((p): AiLabel => ({
    i: p.index,
    label: p.style === 'Heading2' ? 'group' : p.style === 'Heading3' ? 'title' : p.text.startsWith('Cadre') ? 'notes' : 'spoken',
  }));

const docxFile = async (name: string, ...paras: { text: string; style?: string; bold?: boolean }[]) =>
  new File([await makeDocx(paras)], name);
const standard = (name: string, ...spoken: string[]) =>
  docxFile(name, { text: 'Example Print', style: 'Heading2' }, { text: '1. First', style: 'Heading3' },
    ...spoken.map((t) => ({ text: '„' + t + '”' })), { text: 'Cadre și foto. Film the desk.', bold: true });

async function setup(classify?: Classifier) {
  const backend = createMemoryBackend();
  const boss = createMemoryRepo({ backend, user: { email: 'boss@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
  const c1 = await boss.createClient('Acme');
  await boss.setMembers(c1, ['anna@x.com']);
  const makeRepo = (u: AuthUser) => createMemoryRepo({ backend, user: u, adminEmail: 'boss@x.com' });
  const peer = makeRepo(anna);
  const r = render(<App auth={auth} makeRepo={makeRepo} classify={classify} />);
  fireEvent.click(await r.findByText('Acme'));
  await r.findByText(/No scripts yet/);
  const dataOf = (name: string) => {
    let id = '';
    peer.watchScripts(c1, (l) => { id = l.find((s) => s.name === name)?.id ?? ''; }, () => {})();
    let d: ScriptData | null = null;
    peer.watchScript(c1, id, (x) => { d = x; }, () => {})();
    return d as ScriptData | null;
  };
  const pick = (file: File) => fireEvent.change(r.container.querySelector('input[type=file]')!, { target: { files: [file] } });
  return { ...r, pick, dataOf, c1 };
}

describe('smart add', () => {
  test('with the AI available the file becomes grouped videos with notes and only spoken sections', async () => {
    const w = await setup(smartClassify);
    w.pick(await standard('Batch.docx', 'Say this.'));
    expect(await w.findByText('Added Batch.docx')).toBeTruthy();
    const v = w.dataOf('Batch.docx')!.doc.videos;
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ title: '1. First', group: 'Example Print', notes: 'Cadre și foto. Film the desk.' });
    expect(v[0].sections.map((s) => s.text)).toEqual(['Say this.']);
  });

  test('a new script still imports when the AI is unavailable, with a notice', async () => {
    const w = await setup(vi.fn().mockRejectedValue(new AiUnavailable('quota')));
    w.pick(await standard('Batch.docx', 'Say this.'));
    expect(await w.findByText('Added Batch.docx')).toBeTruthy();
    expect(w.getByText('AI reading unavailable, used the basic reading.')).toBeTruthy();
    expect(w.dataOf('Batch.docx')!.doc.videos.length).toBeGreaterThan(0);
  });

  test('an existing script is not changed when the AI is unavailable, until the user chooses the basic reading', async () => {
    const classify = vi.fn<Classifier>().mockImplementationOnce(smartClassify).mockRejectedValue(new AiUnavailable('network'));
    const w = await setup(classify);
    w.pick(await standard('Batch.docx', 'Say this.'));
    await w.findByText('Added Batch.docx');
    const before = JSON.stringify(w.dataOf('Batch.docx'));
    w.pick(await standard('Batch.docx', 'Say this, changed.'));
    expect(await w.findByText('The AI reading is unavailable right now.')).toBeTruthy();
    expect(JSON.stringify(w.dataOf('Batch.docx'))).toBe(before);
    fireEvent.click(w.getByText('Try again later'));
    expect(w.queryByText('The AI reading is unavailable right now.')).toBeNull();
    expect(JSON.stringify(w.dataOf('Batch.docx'))).toBe(before);
    w.pick(await standard('Batch.docx', 'Say this, changed.'));
    fireEvent.click(await w.findByText('Import with basic reading anyway'));
    expect(await w.findByText(/Updated Batch\.docx/)).toBeTruthy();
    await waitFor(() => expect(JSON.stringify(w.dataOf('Batch.docx'))).not.toBe(before));
  });

  test('re-import says how many paragraphs moved to "no longer in script"', async () => {
    const w = await setup(smartClassify);
    w.pick(await standard('Batch.docx', 'one', 'two'));
    await w.findByText('Added Batch.docx');
    w.pick(await standard('Batch.docx', 'one'));
    expect(await w.findByText(/1 paragraph moved to "no longer in script"/)).toBeTruthy();
  });

  test('without an AI configured the file imports with the basic reading and no notice or dialog', async () => {
    const w = await setup(undefined);
    w.pick(await standard('Batch.docx', 'Say this.'));
    expect(await w.findByText('Added Batch.docx')).toBeTruthy();
    expect(w.queryByText('AI reading unavailable, used the basic reading.')).toBeNull();
    w.pick(await standard('Batch.docx', 'Say this.'));
    expect(await w.findByText(/Updated Batch\.docx/)).toBeTruthy();
    expect(w.queryByText('The AI reading is unavailable right now.')).toBeNull();
  });

  test('the one-time notice about sending text to Gemini shows once', async () => {
    const w = await setup(smartClassify);
    expect(w.getByText("Importing sends the document text to Google's Gemini service to read its structure.")).toBeTruthy();
    fireEvent.click(w.getByText('OK'));
    expect(w.queryByText("Importing sends the document text to Google's Gemini service to read its structure.")).toBeNull();
    expect(localStorage.getItem('aiNoticeSeen')).toBe('1');
    w.unmount();
    location.hash = '';
    const again = await setup(smartClassify);
    expect(again.queryByText("Importing sends the document text to Google's Gemini service to read its structure.")).toBeNull();
  });
});
