import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { Reader } from './Reader';
import type { WordCtl } from './SectionView';
import type { Video } from '../model/types';

afterEach(cleanup);

const video: Video = {
  id: 'v', title: 'Titlu',
  sections: [
    { id: 's1', text: 'Primul paragraf', location: 'Kitchen', done: true, updatedAt: 1 },
    { id: 's2', text: 'Al doilea', location: null, done: false, updatedAt: 1 },
  ],
};

const ctl = (over: Partial<WordCtl> = {}): WordCtl => ({
  selection: null, editingId: null,
  onWordClick: () => {}, onWordPointerDown: () => {}, onStartEdit: () => {}, onSaveEdit: () => {}, onCancelEdit: () => {},
  ...over,
});
const base = { fontScale: 1, onToggleDone: () => {}, onOpenLocation: () => {}, onJoin: () => {}, onFontScale: () => {} };

describe('Reader', () => {
  test('renders title and one block per section', () => {
    const { container, getByText } = render(<Reader video={video} ctl={ctl()} {...base} />);
    expect(getByText('Titlu')).toBeTruthy();
    expect(container.querySelectorAll('[data-section]').length).toBe(2);
  });
  test('done section has done class, other does not', () => {
    const { container } = render(<Reader video={video} ctl={ctl()} {...base} />);
    const [a, b] = Array.from(container.querySelectorAll('[data-section]'));
    expect(a.classList.contains('done')).toBe(true);
    expect(b.classList.contains('done')).toBe(false);
  });
  test('shows location text or + location', () => {
    const { getByText } = render(<Reader video={video} ctl={ctl()} {...base} />);
    expect(getByText('📍 Kitchen')).toBeTruthy();
    expect(getByText('+ location')).toBeTruthy();
  });
  test('the done bar, the location label, a word and the pencil each call their own handler', () => {
    const done = vi.fn();
    const loc = vi.fn();
    const word = vi.fn();
    const edit = vi.fn();
    const { container } = render(
      <Reader video={video} ctl={ctl({ onWordClick: word, onStartEdit: edit })} {...base} onToggleDone={done} onOpenLocation={loc} />,
    );
    const second = container.querySelectorAll('[data-section]')[1];
    fireEvent.click(second.querySelector('.done-btn')!);
    fireEvent.click(second.querySelector('.loc-btn')!);
    fireEvent.click(second.querySelectorAll('.w')[1]);
    fireEvent.click(second.querySelector('.edit-btn')!);
    expect(done).toHaveBeenCalledWith('s2');
    expect(loc).toHaveBeenCalledWith('s2', expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) }));
    expect(word).toHaveBeenCalledWith('s2', 1);
    expect(edit).toHaveBeenCalledWith('s2');
  });
  test('there is a thin gap above, between and below the paragraphs; only the one between has a join button', () => {
    const join = vi.fn();
    const { container } = render(<Reader video={video} ctl={ctl()} {...base} onJoin={join} />);
    expect(container.querySelectorAll('[data-drop-gap]').length).toBe(3);
    const joins = container.querySelectorAll('.gap-join');
    expect(joins.length).toBe(1);
    fireEvent.click(joins[0]);
    expect(join).toHaveBeenCalledWith('s2');
  });
  test('scale css variable follows fontScale and A+/A- call onFontScale', () => {
    const fn = vi.fn();
    const { container, getByLabelText } = render(<Reader video={video} ctl={ctl()} {...base} fontScale={1.5} onFontScale={fn} />);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--scale')).toBe('1.5');
    fireEvent.click(getByLabelText('Larger text'));
    expect(fn).toHaveBeenLastCalledWith(1.75);
    fireEvent.click(getByLabelText('Smaller text'));
    expect(fn).toHaveBeenLastCalledWith(1.25);
  });
});
