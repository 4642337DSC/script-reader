import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { ReaderScreen } from './ReaderScreen';
import { App } from './App';
import { createMemoryBackend, createMemoryRepo } from '../data/memoryRepo';
import type { AuthApi, AuthUser } from '../data/types';
import type { Video } from '../model/types';

afterEach(cleanup);
beforeEach(() => { location.hash = ''; localStorage.clear(); });

const mk = (withShots = true): Video => ({
  id: 'v', title: 'T',
  sections: [{ id: 's1', text: 'one two', location: null, done: false, updatedAt: 1 }],
  ...(withShots ? {
    broll: [
      { id: 'b1', text: 'penița pe hârtie', done: false, updatedAt: 1 },
      { id: 'b2', text: 'agenda', done: true, updatedAt: 1 },
      { id: 'b3', text: 'cutia închisă', done: false, updatedAt: 1 },
    ],
  } : {}),
});

function setup(video = mk()) {
  const onChange = vi.fn();
  const r = render(<ReaderScreen video={video} recents={[]} fontScale={1} onFontScale={() => {}} onChange={onChange} now={() => 5} />);
  const last = () => onChange.mock.calls.at(-1)![0] as Video;
  const open = () => fireEvent.click(r.container.querySelector('.broll-toggle')!);
  return { ...r, onChange, last, open };
}

describe('B-roll panel', () => {
  test('is collapsed by default and shows how many shots are done', () => {
    const r = setup();
    expect(r.container.querySelector('.broll-toggle')!.textContent).toBe('B-roll 1/3');
    expect(r.queryByText('penița pe hârtie')).toBeNull();
    r.open();
    expect(r.getByText('penița pe hârtie')).toBeTruthy();
    expect(r.container.querySelectorAll('.broll-item').length).toBe(3);
  });

  test('each shot has a checkbox; checking one updates the video and the count', () => {
    const r = setup();
    r.open();
    const boxes = r.container.querySelectorAll('.broll-check');
    expect(boxes[1].getAttribute('aria-checked')).toBe('true');
    expect(boxes[0].getAttribute('aria-checked')).toBe('false');
    fireEvent.click(boxes[0]);
    expect(r.last().broll!.map((b) => b.done)).toEqual([true, true, false]);
    expect(r.container.querySelector('.broll-toggle')!.textContent).toBe('B-roll 2/3');
    fireEvent.click(r.container.querySelectorAll('.broll-check')[1]);
    expect(r.last().broll!.map((b) => b.done)).toEqual([true, false, false]);
  });

  test('tapping a shot edits it in place; tapping away saves; a blank text keeps the old one', () => {
    const r = setup();
    r.open();
    fireEvent.click(r.getByText('agenda'));
    const box = r.getByLabelText('Shot text') as HTMLInputElement;
    expect(box.value).toBe('agenda');
    expect(r.queryByText('Save')).toBeNull();
    fireEvent.input(box, { target: { value: 'agenda de birou' } });
    fireEvent.pointerDown(document.body);
    expect(r.last().broll![1].text).toBe('agenda de birou');
    fireEvent.click(r.getByText('cutia închisă'));
    fireEvent.input(r.getByLabelText('Shot text'), { target: { value: '   ' } });
    fireEvent.pointerDown(document.body);
    expect(r.last().broll![2].text).toBe('cutia închisă');
  });

  test('the small x removes a shot', () => {
    const r = setup();
    r.open();
    fireEvent.click(r.getByLabelText('Remove shot: agenda'));
    expect(r.last().broll!.map((b) => b.text)).toEqual(['penița pe hârtie', 'cutia închisă']);
  });

  test('the "Add a shot" box adds on Enter or tapping away, empties itself, and has no Add button', () => {
    const r = setup();
    r.open();
    expect(r.queryByText('Add')).toBeNull();
    const add = r.getByPlaceholderText('Add a shot') as HTMLInputElement;
    fireEvent.input(add, { target: { value: 'mesajul' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    expect(r.last().broll!.map((b) => b.text)).toEqual(['penița pe hârtie', 'agenda', 'cutia închisă', 'mesajul']);
    expect((r.getByPlaceholderText('Add a shot') as HTMLInputElement).value).toBe('');
    fireEvent.input(r.getByPlaceholderText('Add a shot'), { target: { value: 'fotografii' } });
    fireEvent.pointerDown(document.body);
    expect(r.last().broll!.map((b) => b.text).at(-1)).toBe('fotografii');
  });

  test('a video with no shots still offers the list and the add box', () => {
    const r = setup(mk(false));
    expect(r.container.querySelector('.broll-toggle')!.textContent).toBe('B-roll');
    r.open();
    expect(r.getByText('No shots yet')).toBeTruthy();
    fireEvent.input(r.getByPlaceholderText('Add a shot'), { target: { value: 'first shot' } });
    fireEvent.keyDown(r.getByPlaceholderText('Add a shot'), { key: 'Enter' });
    expect(r.last().broll!.map((b) => b.text)).toEqual(['first shot']);
  });

  test('checking a shot is undoable', () => {
    const r = setup();
    r.open();
    fireEvent.click(r.container.querySelectorAll('.broll-check')[0]);
    fireEvent.click(r.getByLabelText('Undo'));
    expect(r.last().broll![0].done).toBe(false);
  });
});

describe('B-roll progress in the video list', () => {
  const anna: AuthUser = { email: 'anna@x.com', name: 'Anna' };
  const auth: AuthApi = { onUser: (cb) => { cb(anna); return () => {}; }, signIn: async () => {}, signOut: async () => {} };

  test('each video shows its B-roll progress, only when it has shots', async () => {
    const backend = createMemoryBackend();
    const boss = createMemoryRepo({ backend, user: { email: 'boss@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
    const c1 = await boss.createClient('Acme');
    await boss.setMembers(c1, ['anna@x.com']);
    const makeRepo = (u: AuthUser) => createMemoryRepo({ backend, user: u, adminEmail: 'boss@x.com' });
    await makeRepo(anna).addScript(c1, 'S.docx', [
      { title: 'With shots', group: null, notes: 'n', broll: ['a', 'b', 'c'], paragraphs: [{ source: 'p', text: 'p' }] },
      { title: 'Without', group: null, notes: '', paragraphs: [{ source: 'q', text: 'q' }] },
    ]);
    const r = render(<App auth={auth} makeRepo={makeRepo} />);
    fireEvent.click(await r.findByText('Acme'));
    fireEvent.click(await r.findByText('S.docx'));
    await r.findByText('With shots');
    await waitFor(() => expect(r.getByText(/B-roll 0\/3/)).toBeTruthy());
    expect(r.queryAllByText(/B-roll/).length).toBe(1);
  });
});
