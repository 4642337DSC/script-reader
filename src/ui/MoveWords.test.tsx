import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { MoveWords } from './MoveWords';
import { App } from './App';
import { createMemoryBackend, createMemoryRepo } from '../data/memoryRepo';
import type { Video } from '../model/types';
import type { AuthApi, AuthUser, ScriptData } from '../data/types';

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => { location.hash = ''; localStorage.clear(); });

const video = (): Video => ({
  id: 'v', title: 'T',
  sections: [
    { id: 'a', text: 'one two three four', location: null, done: false, updatedAt: 1 },
    { id: 'b', text: 'five six seven', location: 'Office', done: false, updatedAt: 1 },
    { id: 'c', text: 'eight nine', location: null, done: false, updatedAt: 1 },
  ],
});
const texts = (v: Video) => v.sections.map((s) => s.text);
const setup = (sectionId = 'b', hit?: (x: number, y: number) => Element | null) => {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  const r = render(<MoveWords video={video()} sectionId={sectionId} onApply={onApply} onCancel={onCancel} hit={hit} now={() => 9} />);
  return { ...r, onApply, onCancel };
};
const word = (r: ReturnType<typeof setup>, w: string) => r.getByText(w, { selector: '.mw-word' });

describe('MoveWords: select, then use the buttons', () => {
  test('tap the first and last word, then send them to the next paragraph', () => {
    const r = setup('a');
    fireEvent.click(word(r, 'three'));
    fireEvent.click(word(r, 'four'));
    expect(r.container.querySelectorAll('.mw-word.sel').length).toBe(2);
    fireEvent.click(r.getByText('To next paragraph'));
    expect(texts(r.onApply.mock.calls[0][0])).toEqual(['one two', 'three four five six seven', 'eight nine']);
  });

  test('the first words go to the previous paragraph', () => {
    const r = setup('b');
    fireEvent.click(word(r, 'five'));
    fireEvent.click(r.getByText('To previous paragraph'));
    expect(texts(r.onApply.mock.calls[0][0])).toEqual(['one two three four five', 'six seven', 'eight nine']);
  });

  test('New paragraph below carves the last words into their own paragraph', () => {
    const r = setup('b');
    fireEvent.click(word(r, 'seven'));
    fireEvent.click(r.getByText('New paragraph below'));
    expect(texts(r.onApply.mock.calls[0][0])).toEqual(['one two three four', 'five six', 'seven', 'eight nine']);
  });

  test('a move that is not allowed shows the reason and changes nothing', () => {
    const r = setup('b');
    fireEvent.click(word(r, 'six'));
    fireEvent.click(r.getByText('To next paragraph'));
    expect(r.getByRole('status').textContent).toMatch(/last word/i);
    expect(r.onApply).not.toHaveBeenCalled();
  });

  test('with nothing selected the buttons say what to do', () => {
    const r = setup('b');
    fireEvent.click(r.getByText('To next paragraph'));
    expect(r.getByRole('status').textContent).toMatch(/select/i);
    expect(r.onApply).not.toHaveBeenCalled();
  });

  test('a third tap starts a fresh selection; Cancel closes', () => {
    const r = setup('a');
    fireEvent.click(word(r, 'one'));
    fireEvent.click(word(r, 'three'));
    fireEvent.click(word(r, 'four'));
    expect(Array.from(r.container.querySelectorAll('.mw-word.sel')).map((e) => e.textContent)).toEqual(['four']);
    fireEvent.click(r.getByText('Cancel'));
    expect(r.onCancel).toHaveBeenCalled();
  });

  test('the neighbouring paragraphs are shown so you can see where words will land', () => {
    const r = setup('b');
    expect(r.getByText('one two three four')).toBeTruthy();
    expect(r.getByText('eight nine')).toBeTruthy();
  });
});

describe('MoveWords: split, merge and edit text live in the same editor', () => {
  test('Split before the selected word cuts the paragraph there', () => {
    const r = setup('b');
    fireEvent.click(word(r, 'six'));
    fireEvent.click(r.getByText('Split before selected word'));
    expect(texts(r.onApply.mock.calls[0][0])).toEqual(['one two three four', 'five', 'six seven', 'eight nine']);
  });

  test('Split needs a selected word after the first one', () => {
    const r = setup('b');
    fireEvent.click(r.getByText('Split before selected word'));
    expect(r.getByRole('status').textContent).toMatch(/select/i);
    fireEvent.click(word(r, 'five'));
    fireEvent.click(r.getByText('Split before selected word'));
    expect(r.getByRole('status').textContent).toMatch(/after the first/i);
    expect(r.onApply).not.toHaveBeenCalled();
  });

  test('Merge with previous joins the paragraph to the one above; it is disabled for the first paragraph', () => {
    const r = setup('b');
    fireEvent.click(r.getByText('Merge with previous'));
    expect(texts(r.onApply.mock.calls[0][0])).toEqual(['one two three four five six seven', 'eight nine']);
    const first = setup('a');
    expect((first.getAllByText('Merge with previous').at(-1) as HTMLButtonElement).disabled).toBe(true);
  });

  test('Edit text opens a text box and Save applies the new text', () => {
    const r = setup('b');
    fireEvent.click(r.getByText('Edit text'));
    fireEvent.input(r.getByLabelText('Section text'), { target: { value: 'five six seven (fixed)' } });
    fireEvent.click(r.getByText('Save'));
    expect(texts(r.onApply.mock.calls[0][0])).toEqual(['one two three four', 'five six seven (fixed)', 'eight nine']);
  });

  test('Cancel in the text box goes back to the words without changing anything', () => {
    const r = setup('b');
    fireEvent.click(r.getByText('Edit text'));
    expect(r.getByLabelText('Section text')).toBeTruthy();
    const cancels = r.getAllByText('Cancel');
    fireEvent.click(cancels[cancels.length - 1]);
    expect(r.queryByLabelText('Section text')).toBeNull();
    expect(r.container.querySelectorAll('.mw-word').length).toBeGreaterThan(0);
    expect(r.onApply).not.toHaveBeenCalled();
  });
});

describe('MoveWords: dragging', () => {
  const drop = (r: ReturnType<typeof setup>, target: string) => {
    const el = r.container.querySelector(`[data-drop="${target}"]`)!;
    return el;
  };
  const dragSelectionTo = (r: ReturnType<typeof setup>, from: string, to: Element) => {
    fireEvent.pointerDown(word(r, from), { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 80, pointerId: 1 });
    return to;
  };

  test('dragging the selected words onto the next paragraph moves them there', () => {
    let target: Element | null = null;
    const r = setup('b', () => target);
    fireEvent.click(word(r, 'seven'));
    target = drop(r, 'next');
    dragSelectionTo(r, 'seven', target);
    expect(texts(r.onApply.mock.calls[0][0])).toEqual(['one two three four', 'five six', 'seven eight nine']);
  });

  test('dragging onto the gap below makes a new paragraph', () => {
    let target: Element | null = null;
    const r = setup('b', () => target);
    fireEvent.click(word(r, 'seven'));
    target = drop(r, 'below');
    dragSelectionTo(r, 'seven', target);
    expect(texts(r.onApply.mock.calls[0][0])).toEqual(['one two three four', 'five six', 'seven', 'eight nine']);
  });

  test('a drop that is not allowed shows the reason; a drop on nothing does nothing', () => {
    let target: Element | null = null;
    const r = setup('b', () => target);
    fireEvent.click(word(r, 'six'));
    target = drop(r, 'next');
    dragSelectionTo(r, 'six', target);
    expect(r.getByRole('status').textContent).toMatch(/last word/i);
    expect(r.onApply).not.toHaveBeenCalled();
    target = null;
    dragSelectionTo(r, 'six', document.body);
    expect(r.onApply).not.toHaveBeenCalled();
  });

  test('a short press-and-move without holding does not drag an unselected word', () => {
    let target: Element | null = null;
    const r = setup('b', () => target);
    target = drop(r, 'next');
    dragSelectionTo(r, 'seven', target);
    expect(r.onApply).not.toHaveBeenCalled();
  });

  test('pressing and holding a word picks it up (selects it) so it can be dragged straight away', () => {
    vi.useFakeTimers();
    let target: Element | null = null;
    const r = setup('b', () => target);
    fireEvent.pointerDown(word(r, 'seven'), { clientX: 10, clientY: 10, pointerId: 1 });
    act(() => { vi.advanceTimersByTime(450); });
    expect(Array.from(r.container.querySelectorAll('.mw-word.sel')).map((e) => e.textContent)).toEqual(['seven']);
    target = drop(r, 'next');
    fireEvent.pointerMove(window, { clientX: 30, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 30, clientY: 90, pointerId: 1 });
    expect(texts(r.onApply.mock.calls[0][0])).toEqual(['one two three four', 'five six', 'seven eight nine']);
  });
});

describe('Move words inside the reader', () => {
  const anna: AuthUser = { email: 'anna@x.com', name: 'Anna' };
  const auth: AuthApi = { onUser: (cb) => { cb(anna); return () => {}; }, signIn: async () => {}, signOut: async () => {} };

  test('Tapping a paragraph opens the editor, and moving words changes the script for everyone', async () => {
    const backend = createMemoryBackend();
    const boss = createMemoryRepo({ backend, user: { email: 'boss@x.com', name: 'B' }, adminEmail: 'boss@x.com' });
    const c1 = await boss.createClient('Acme');
    await boss.setMembers(c1, ['anna@x.com', 'bob@x.com']);
    const makeRepo = (u: AuthUser) => createMemoryRepo({ backend, user: u, adminEmail: 'boss@x.com' });
    const bob = makeRepo({ email: 'bob@x.com', name: 'Bob' });
    const { scriptId } = await bob.addScript(c1, 'S.docx', [{ title: 'Vid', paragraphs: ['alpha beta gamma', 'delta epsilon'] }]);
    let cur: ScriptData | null = null;
    bob.watchScript(c1, scriptId, (d) => { cur = d; }, () => {});
    const r = render(<App auth={auth} makeRepo={makeRepo} />);
    fireEvent.click(await r.findByText('Acme'));
    fireEvent.click(await r.findByText('S.docx'));
    fireEvent.click(await r.findByText('Vid'));
    fireEvent.click(await r.findByText('alpha beta gamma'));
    fireEvent.click(r.getByText('gamma', { selector: '.mw-word' }));
    fireEvent.click(r.getByText('To next paragraph'));
    await r.findByText('gamma delta epsilon');
    await vi.waitFor(() => expect(texts(cur!.doc.videos[0])).toEqual(['alpha beta', 'gamma delta epsilon']));
  });
});
