import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { Reader } from './Reader';
import type { Video } from '../model/types';

afterEach(cleanup);

const video: Video = {
  id: 'v', title: 'Titlu',
  sections: [
    { id: 's1', text: 'Primul paragraf', location: 'Kitchen', done: true, updatedAt: 1 },
    { id: 's2', text: 'Al doilea', location: null, done: false, updatedAt: 1 },
  ],
};

const noop = { onToggleDone: () => {}, onOpenLocation: () => {}, onOpenEditor: () => {}, onFontScale: () => {} };

describe('Reader', () => {
  test('renders title and one block per section', () => {
    const { container, getByText } = render(<Reader video={video} fontScale={1} {...noop} />);
    expect(getByText('Titlu')).toBeTruthy();
    expect(container.querySelectorAll('[data-section]').length).toBe(2);
  });
  test('done section has done class, other does not', () => {
    const { container } = render(<Reader video={video} fontScale={1} {...noop} />);
    const [a, b] = Array.from(container.querySelectorAll('[data-section]'));
    expect(a.classList.contains('done')).toBe(true);
    expect(b.classList.contains('done')).toBe(false);
  });
  test('shows location text or + location', () => {
    const { getByText } = render(<Reader video={video} fontScale={1} {...noop} />);
    expect(getByText('📍 Kitchen')).toBeTruthy();
    expect(getByText('+ location')).toBeTruthy();
  });
  test('the done bar, the location label and the text each call their own handler with the section id', () => {
    const done = vi.fn();
    const loc = vi.fn();
    const edit = vi.fn();
    const { container } = render(<Reader video={video} fontScale={1} {...noop} onToggleDone={done} onOpenLocation={loc} onOpenEditor={edit} />);
    const second = container.querySelectorAll('[data-section]')[1];
    fireEvent.click(second.querySelector('.done-btn')!);
    fireEvent.click(second.querySelector('.loc-btn')!);
    fireEvent.click(second.querySelector('.text')!);
    expect(done).toHaveBeenCalledWith('s2');
    expect(loc).toHaveBeenCalledWith('s2');
    expect(edit).toHaveBeenCalledWith('s2');
    expect(done).toHaveBeenCalledTimes(1);
    expect(loc).toHaveBeenCalledTimes(1);
    expect(edit).toHaveBeenCalledTimes(1);
  });
  test('scale css variable follows fontScale and A+/A- call onFontScale', () => {
    const fn = vi.fn();
    const { container, getByLabelText } = render(<Reader video={video} fontScale={1.5} {...noop} onFontScale={fn} />);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--scale')).toBe('1.5');
    fireEvent.click(getByLabelText('Larger text'));
    expect(fn).toHaveBeenLastCalledWith(1.75);
    fireEvent.click(getByLabelText('Smaller text'));
    expect(fn).toHaveBeenLastCalledWith(1.25);
  });
});
