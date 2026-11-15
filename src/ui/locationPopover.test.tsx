import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { LocationSheet } from './LocationSheet';
import { ReaderScreen } from './ReaderScreen';
import type { Video } from '../model/types';

afterEach(cleanup);

const anchor = { left: 100, top: 200, width: 80, height: 30 };

describe('location popup next to the label', () => {
  test('Save is in the same row as the text box, so it is right under the cursor', () => {
    const r = render(<LocationSheet recents={[]} current={null} anchor={anchor} onPick={() => {}} onClose={() => {}} />);
    const input = r.getByPlaceholderText('Location');
    const save = r.getByText('Save');
    expect(save.parentElement).toBe(input.parentElement);
  });

  test('is placed right below the label that was tapped', () => {
    const r = render(<LocationSheet recents={[]} current={null} anchor={anchor} onPick={() => {}} onClose={() => {}} />);
    const pop = r.container.querySelector('.loc-pop') as HTMLElement;
    expect(pop.style.left).toBe('100px');
    expect(pop.style.top).toBe('236px');
  });

  test('a tap outside it, or Escape, closes it without saving', () => {
    const onClose = vi.fn();
    const onPick = vi.fn();
    const r = render(<LocationSheet recents={[]} current={null} anchor={anchor} onPick={onPick} onClose={onClose} />);
    fireEvent.click(r.container.querySelector('.loc-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(r.getByPlaceholderText('Location'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onPick).not.toHaveBeenCalled();
  });

  test('Enter saves what was typed; tapping a recent place picks it straight away', () => {
    const onPick = vi.fn();
    const r = render(<LocationSheet recents={['Kitchen']} current={null} anchor={anchor} onPick={onPick} onClose={() => {}} />);
    fireEvent.click(r.getByText('Kitchen'));
    expect(onPick).toHaveBeenLastCalledWith('Kitchen');
    fireEvent.input(r.getByPlaceholderText('Location'), { target: { value: 'Garage' } });
    fireEvent.keyDown(r.getByPlaceholderText('Location'), { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith('Garage');
  });

  test('on the reading screen it opens next to the tapped label and there is no bottom sheet', () => {
    const video: Video = { id: 'v', title: 'T', sections: [{ id: 's1', text: 'one two', location: null, done: false, updatedAt: 1 }] };
    const onChange = vi.fn();
    const r = render(<ReaderScreen video={video} recents={['Kitchen']} fontScale={1} onFontScale={() => {}} onChange={onChange} now={() => 5} />);
    const label = r.container.querySelector('.loc-btn') as HTMLElement;
    label.getBoundingClientRect = () => ({ left: 40, top: 120, width: 90, height: 28, right: 130, bottom: 148, x: 40, y: 120, toJSON: () => ({}) });
    fireEvent.click(label);
    const pop = r.container.querySelector('.loc-pop') as HTMLElement;
    expect(pop).toBeTruthy();
    expect(pop.style.left).toBe('40px');
    expect(pop.style.top).toBe('154px');
    expect(r.container.querySelector('.sheet')).toBeNull();
    fireEvent.click(r.getByText('Kitchen'));
    expect(onChange.mock.calls.at(-1)![0].sections[0].location).toBe('Kitchen');
    expect(r.container.querySelector('.loc-pop')).toBeNull();
  });
});
