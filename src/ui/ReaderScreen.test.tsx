import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { ReaderScreen } from './ReaderScreen';
import { LocationSheet } from './LocationSheet';
import { paraTexts, wordIn } from '../testing/dom';
import type { Video } from '../model/types';

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => { vi.useRealTimers(); });

const mkVideo = (): Video => ({
  id: 'v', title: 'T',
  sections: [
    { id: 's1', text: 'one two three four five six', location: null, done: false, updatedAt: 1 },
    { id: 's2', text: 'second para here', location: null, done: false, updatedAt: 1 },
    { id: 's3', text: 'third paragraph', location: null, done: false, updatedAt: 1 },
  ],
});

describe('LocationSheet', () => {
  test('typing shows matching recent chips and picking one calls onPick', () => {
    const onPick = vi.fn();
    const { getByPlaceholderText, getByText } = render(
      <LocationSheet recents={['Kitchen', 'Office']} current={null} onPick={onPick} onClose={() => {}} />);
    fireEvent.input(getByPlaceholderText('Location'), { target: { value: 'ki' } });
    fireEvent.click(getByText('Kitchen'));
    expect(onPick).toHaveBeenCalledWith('Kitchen');
  });
  test('typed text can be submitted and clear picks null', () => {
    const onPick = vi.fn();
    const { getByPlaceholderText, getByText } = render(
      <LocationSheet recents={[]} current="Old" onPick={onPick} onClose={() => {}} />);
    fireEvent.input(getByPlaceholderText('Location'), { target: { value: 'Garage' } });
    fireEvent.click(getByText('Save'));
    expect(onPick).toHaveBeenLastCalledWith('Garage');
    fireEvent.click(getByText('Clear'));
    expect(onPick).toHaveBeenLastCalledWith(null);
  });
});

function setup(hit?: (x: number, y: number) => Element | null) {
  const onChange = vi.fn();
  const r = render(<ReaderScreen video={mkVideo()} recents={['Kitchen']} fontScale={1} onFontScale={() => {}} onChange={onChange} now={() => 5} hit={hit} />);
  const last = () => onChange.mock.calls.at(-1)![0] as Video;
  const lastTexts = () => last().sections.map((s) => s.text);
  const w = (p: string, word: string) => wordIn(r.container, p, word);
  return { ...r, onChange, last, lastTexts, w };
}
const P1 = 'one two three four five six';
const P2 = 'second para here';
const P3 = 'third paragraph';
const selected = (r: ReturnType<typeof setup>) => Array.from(r.container.querySelectorAll('.w.sel')).map((e) => e.textContent);

describe('done bar and location label', () => {
  test('tapping the done bar toggles done, and tapping again undoes it', () => {
    const r = setup();
    const bar = r.container.querySelectorAll('.done-btn')[0];
    fireEvent.click(bar);
    expect(r.last().sections[0].done).toBe(true);
    fireEvent.click(bar);
    expect(r.last().sections[0].done).toBe(false);
  });

  test('tapping the location label opens the location box; picking updates the video and recents', () => {
    const r = setup();
    fireEvent.click(r.container.querySelectorAll('.loc-btn')[0]);
    fireEvent.click(r.getByText('Kitchen'));
    const [video, recents] = r.onChange.mock.calls.at(-1)!;
    expect(video.sections[0].location).toBe('Kitchen');
    expect(recents[0]).toBe('Kitchen');
  });
});

describe('selecting words on the main screen', () => {
  test('tapping a word highlights it; tapping another extends the span; a third tap starts again', () => {
    const r = setup();
    fireEvent.click(r.w(P1, 'two'));
    expect(selected(r)).toEqual(['two']);
    fireEvent.click(r.w(P1, 'four'));
    expect(selected(r)).toEqual(['two', 'three', 'four']);
    fireEvent.click(r.w(P1, 'six'));
    expect(selected(r)).toEqual(['six']);
  });

  test('selecting in another paragraph moves the selection there', () => {
    const r = setup();
    fireEvent.click(r.w(P1, 'two'));
    fireEvent.click(r.w(P2, 'para'));
    expect(selected(r)).toEqual(['para']);
  });

  test('there is no menu, no popup and no separate screen', () => {
    const r = setup();
    fireEvent.click(r.w(P1, 'two'));
    for (const t of ['Set location', 'Mark done', 'Split here', 'Move words', 'To next paragraph', 'Merge with previous']) {
      expect(r.queryByText(t)).toBeNull();
    }
    expect(r.container.querySelector('.mw-overlay')).toBeNull();
  });
});

describe('split, merge, edit in place', () => {
  test('double-tapping a word splits the paragraph right before it', () => {
    const r = setup();
    fireEvent.click(r.w(P1, 'four'));
    fireEvent.click(r.w(P1, 'four'));
    expect(r.lastTexts()).toEqual(['one two three', 'four five six', P2, P3]);
  });

  test('double-tapping the first word explains why it cannot split', () => {
    const r = setup();
    fireEvent.click(r.w(P1, 'one'));
    fireEvent.click(r.w(P1, 'one'));
    expect(r.getByRole('status').textContent).toMatch(/after the first/i);
    expect(r.onChange).not.toHaveBeenCalled();
  });

  test('two slow taps on the same word are two selections, not a split', () => {
    vi.useFakeTimers();
    const r = setup();
    fireEvent.click(r.w(P1, 'four'));
    act(() => { vi.advanceTimersByTime(900); });
    fireEvent.click(r.w(P1, 'four'));
    expect(r.onChange).not.toHaveBeenCalled();
  });

  test('tapping the thin line between two paragraphs joins them', () => {
    const r = setup();
    const joins = r.container.querySelectorAll('.gap-join');
    expect(joins.length).toBe(2); // only between paragraphs, not above the first or below the last
    fireEvent.click(joins[0]);
    expect(r.lastTexts()).toEqual([`${P1} ${P2}`, P3]);
  });

  test('the pencil turns the paragraph into a text box in place; Save applies it', () => {
    const r = setup();
    fireEvent.click(r.container.querySelectorAll('.edit-btn')[1]);
    const box = r.getByLabelText('Section text') as HTMLTextAreaElement;
    expect(box.value).toBe(P2);
    expect(r.container.querySelector('.mw-overlay')).toBeNull();
    fireEvent.input(box, { target: { value: 'second para fixed' } });
    fireEvent.click(r.getByText('Save'));
    expect(r.lastTexts()[1]).toBe('second para fixed');
    expect(r.queryByLabelText('Section text')).toBeNull();
  });

  test('a blank text cannot be saved, and Cancel restores the paragraph', () => {
    const r = setup();
    fireEvent.click(r.container.querySelectorAll('.edit-btn')[1]);
    fireEvent.input(r.getByLabelText('Section text'), { target: { value: '   ' } });
    expect((r.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(r.getByText('Cancel'));
    expect(paraTexts(r.container)).toEqual([P1, P2, P3]);
    expect(r.onChange).not.toHaveBeenCalled();
  });
});

describe('dragging selected words', () => {
  const drag = (r: ReturnType<typeof setup>, from: HTMLElement) => {
    fireEvent.pointerDown(from, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 90, pointerId: 1 });
  };
  const section = (r: ReturnType<typeof setup>, i: number) => r.container.querySelectorAll('[data-section]')[i] as HTMLElement;
  const gap = (r: ReturnType<typeof setup>, i: number) => r.container.querySelector(`[data-drop-gap="${i}"]`) as HTMLElement;

  test('dragging the last words onto the next paragraph moves them there', () => {
    let target: Element | null = null;
    const r = setup(() => target);
    fireEvent.click(r.w(P1, 'six'));
    target = section(r, 1);
    drag(r, r.w(P1, 'six'));
    expect(r.lastTexts()).toEqual(['one two three four five', 'six second para here', P3]);
  });

  test('dragging the first words onto the previous paragraph moves them there', () => {
    let target: Element | null = null;
    const r = setup(() => target);
    fireEvent.click(r.w(P2, 'second'));
    target = section(r, 0);
    drag(r, r.w(P2, 'second'));
    expect(r.lastTexts()).toEqual([`${P1} second`, 'para here', P3]);
  });

  test('dragging onto the gap below makes a new paragraph; the gap above works for the first words', () => {
    let target: Element | null = null;
    const r = setup(() => target);
    fireEvent.click(r.w(P1, 'six'));
    target = gap(r, 1);
    drag(r, r.w(P1, 'six'));
    expect(r.lastTexts()).toEqual(['one two three four five', 'six', P2, P3]);
  });

  test('a move that is not allowed shows the reason on the same screen and changes nothing', () => {
    let target: Element | null = null;
    const r = setup(() => target);
    fireEvent.click(r.w(P1, 'three'));
    target = section(r, 1);
    drag(r, r.w(P1, 'three'));
    expect(r.getByRole('status').textContent).toMatch(/last word/i);
    expect(r.onChange).not.toHaveBeenCalled();
  });

  test('a paragraph that is not directly above or below is refused', () => {
    let target: Element | null = null;
    const r = setup(() => target);
    fireEvent.click(r.w(P1, 'six'));
    target = section(r, 2);
    drag(r, r.w(P1, 'six'));
    expect(r.getByRole('status').textContent).toMatch(/directly above or below/i);
    expect(r.onChange).not.toHaveBeenCalled();
  });

  test('dropping on nothing, or pressing an unselected word and moving, does nothing', () => {
    let target: Element | null = null;
    const r = setup(() => target);
    fireEvent.click(r.w(P1, 'six'));
    drag(r, r.w(P1, 'six'));
    target = section(r, 1);
    drag(r, r.w(P1, 'five'));
    expect(r.onChange).not.toHaveBeenCalled();
  });

  test('pressing and holding a word picks it up so it can be dragged', () => {
    vi.useFakeTimers();
    let target: Element | null = null;
    const r = setup(() => target);
    fireEvent.pointerDown(r.w(P1, 'six'), { clientX: 10, clientY: 10, pointerId: 1 });
    act(() => { vi.advanceTimersByTime(450); });
    expect(selected(r)).toEqual(['six']);
    target = section(r, 1);
    fireEvent.pointerMove(window, { clientX: 30, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 30, clientY: 90, pointerId: 1 });
    expect(r.lastTexts()).toEqual(['one two three four five', 'six second para here', P3]);
  });
});

describe('undo', () => {
  test('Undo is disabled at first; after a change it restores the previous version and syncs it', () => {
    const r = setup();
    const undo = r.getByLabelText('Undo') as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    fireEvent.click(r.container.querySelectorAll('.gap-join')[0]);
    expect(r.lastTexts()).toEqual([`${P1} ${P2}`, P3]);
    expect((r.getByLabelText('Undo') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(r.getByLabelText('Undo'));
    expect(r.lastTexts()).toEqual([P1, P2, P3]);
    expect((r.getByLabelText('Undo') as HTMLButtonElement).disabled).toBe(true);
  });

  test('undo does not outlive a change made by someone else (it would overwrite their work)', () => {
    const onChange = vi.fn();
    const v1 = mkVideo();
    const r = render(<ReaderScreen video={v1} recents={[]} fontScale={1} onFontScale={() => {}} onChange={onChange} now={() => 5} />);
    fireEvent.click(r.container.querySelectorAll('.done-btn')[0]);
    expect((r.getByLabelText('Undo') as HTMLButtonElement).disabled).toBe(false);
    const remote: Video = { ...v1, sections: v1.sections.map((s, i) => (i === 1 ? { ...s, text: 'changed by bob' } : s)) };
    r.rerender(<ReaderScreen video={remote} recents={[]} fontScale={1} onFontScale={() => {}} onChange={onChange} now={() => 5} />);
    expect((r.getByLabelText('Undo') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ReaderScreen (review fixes)', () => {
  test('C4: a new video prop (e.g. after a sync) replaces what is shown', () => {
    const v1 = mkVideo();
    const v2: Video = { ...v1, sections: [{ ...v1.sections[0], text: 'reworded after sync' }] };
    const r = render(<ReaderScreen video={v1} recents={[]} fontScale={1} onFontScale={() => {}} onChange={() => {}} />);
    r.rerender(<ReaderScreen video={v2} recents={[]} fontScale={1} onFontScale={() => {}} onChange={() => {}} />);
    expect(paraTexts(r.container)).toEqual(['reworded after sync']);
  });
});
