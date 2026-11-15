import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { App } from './App';
import { createMemoryBackend, createMemoryRepo } from '../data/memoryRepo';
import { makeDocx } from '../testing/makeDocx';
import type { AuthApi, AuthUser } from '../data/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => { location.hash = ''; });

const anna: AuthUser = { email: 'anna@x.com', name: 'Anna' };
const DOC_MIME = 'application/vnd.google-apps.document';
const LINK = 'https://docs.google.com/document/d/DOC123/edit?usp=sharing';

async function setup(getDriveToken?: () => Promise<string>) {
  const backend = createMemoryBackend();
  const boss = createMemoryRepo({ backend, user: { email: 'boss@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
  const c1 = await boss.createClient('Acme');
  await boss.setMembers(c1, ['anna@x.com']);
  const auth: AuthApi = { onUser: (cb) => { cb(anna); return () => {}; }, signIn: async () => {}, signOut: async () => {}, getDriveToken };
  const makeRepo = (u: AuthUser) => createMemoryRepo({ backend, user: u, adminEmail: 'boss@x.com' });
  const r = render(<App auth={auth} makeRepo={makeRepo} />);
  fireEvent.click(await r.findByText('Acme'));
  await r.findByText(/No scripts yet/);
  return r;
}

async function openLinkBox(r: Awaited<ReturnType<typeof setup>>) {
  fireEvent.click(r.getByLabelText('Add script'));
  fireEvent.click(r.getByText('From Google Docs link'));
  return r.findByPlaceholderText('Paste Google Docs link');
}

describe('import from a Google Docs link', () => {
  test('a valid link imports the doc as a script named after its title', async () => {
    const bytes = await makeDocx([{ text: 'Video one', style: 'Heading1' }, { text: 'first' }, { text: 'second' }]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'Batch from Docs', mimeType: DOC_MIME })))
      .mockResolvedValueOnce(new Response(bytes));
    vi.stubGlobal('fetch', fetchMock);
    const getDriveToken = vi.fn().mockResolvedValue('tok');
    const r = await setup(getDriveToken);
    fireEvent.input(await openLinkBox(r), { target: { value: LINK } });
    fireEvent.keyDown(r.getByPlaceholderText('Paste Google Docs link'), { key: 'Enter' });
    expect(await r.findByText('Added Batch from Docs')).toBeTruthy();
    expect(await r.findByText('Batch from Docs')).toBeTruthy();
    expect(getDriveToken).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('DOC123');
  });

  test('there is an Import button next to the box; clicking it imports once (not twice)', async () => {
    const bytes = await makeDocx([{ text: 'Video one', style: 'Heading1' }, { text: 'first' }]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'Via button', mimeType: DOC_MIME })))
      .mockResolvedValueOnce(new Response(bytes));
    vi.stubGlobal('fetch', fetchMock);
    const getDriveToken = vi.fn().mockResolvedValue('tok');
    const r = await setup(getDriveToken);
    fireEvent.input(await openLinkBox(r), { target: { value: LINK } });
    const button = r.getByText('Import');
    // a real tap presses down first (which leaves the box) and then clicks
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    expect(await r.findByText('Added Via button')).toBeTruthy();
    expect(getDriveToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('clicking Import with an invalid link says so and keeps the text', async () => {
    const r = await setup(vi.fn().mockResolvedValue('tok'));
    const box = (await openLinkBox(r)) as HTMLInputElement;
    fireEvent.input(box, { target: { value: 'https://example.com/x' } });
    fireEvent.click(r.getByText('Import'));
    expect(await r.findByText("That doesn't look like a Google Docs link.")).toBeTruthy();
    expect(box.value).toBe('https://example.com/x');
  });

  test('something that is not a Google Docs link is rejected without asking for permission', async () => {
    const getDriveToken = vi.fn().mockResolvedValue('tok');
    const r = await setup(getDriveToken);
    fireEvent.input(await openLinkBox(r), { target: { value: 'https://example.com/x' } });
    fireEvent.keyDown(r.getByPlaceholderText('Paste Google Docs link'), { key: 'Enter' });
    expect(await r.findByText("That doesn't look like a Google Docs link.")).toBeTruthy();
    expect(getDriveToken).not.toHaveBeenCalled();
  });

  test('a doc the account cannot open shows how to fix it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    const r = await setup(async () => 'tok');
    fireEvent.input(await openLinkBox(r), { target: { value: LINK } });
    fireEvent.keyDown(r.getByPlaceholderText('Paste Google Docs link'), { key: 'Enter' });
    expect(await r.findByText("Your Google account can't open that document. Ask the owner to share it with you.")).toBeTruthy();
    expect(r.getByText(/No scripts yet/)).toBeTruthy();
  });

  test('declining the Google permission shows a message and imports nothing', async () => {
    const r = await setup(async () => { throw new Error('popup closed'); });
    fireEvent.input(await openLinkBox(r), { target: { value: LINK } });
    fireEvent.keyDown(r.getByPlaceholderText('Paste Google Docs link'), { key: 'Enter' });
    expect(await r.findByText("Google permission wasn't granted, so nothing was imported.")).toBeTruthy();
  });

  test('importing a doc with the same title again updates the script and keeps ticks', async () => {
    const first = await makeDocx([{ text: 'V', style: 'Heading1' }, { text: 'one' }, { text: 'two' }]);
    const second = await makeDocx([{ text: 'V', style: 'Heading1' }, { text: 'one' }, { text: 'two changed' }]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'Same', mimeType: DOC_MIME })))
      .mockResolvedValueOnce(new Response(first))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'Same', mimeType: DOC_MIME })))
      .mockResolvedValueOnce(new Response(second));
    vi.stubGlobal('fetch', fetchMock);
    const r = await setup(async () => 'tok');
    fireEvent.input(await openLinkBox(r), { target: { value: LINK } });
    fireEvent.keyDown(r.getByPlaceholderText('Paste Google Docs link'), { key: 'Enter' });
    await r.findByText('Added Same');
    fireEvent.click(r.getByLabelText('Add script'));
    fireEvent.click(r.getByText('From Google Docs link'));
    fireEvent.input(await r.findByPlaceholderText('Paste Google Docs link'), { target: { value: LINK } });
    fireEvent.keyDown(r.getByPlaceholderText('Paste Google Docs link'), { key: 'Enter' });
    expect(await r.findByText(/Updated Same/)).toBeTruthy();
  });

  test('without Google Docs support the + button only offers the file picker', async () => {
    const r = await setup(undefined);
    expect(r.queryByLabelText('Add script')).toBeNull();
    expect(r.getByLabelText('Add script file')).toBeTruthy();
  });
});
