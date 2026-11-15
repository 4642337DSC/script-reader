import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { LocationSheet } from './LocationSheet';
import { ReaderScreen } from './ReaderScreen';
import type { Video } from '../model/types';

afterEach(cleanup);

const anchor = { left: 100, top: 200, width: 80, height: 30 };
const open = (props: Partial<Parameters<typeof LocationSheet>[0]> = {}) => {
  const onPick = vi.fn();
  const onClose = vi.fn();
  const r = render(<LocationSheet recents={['Kitchen']} current={null} anchor={anchor} onPick={onPick} onClose={onClose} {...props} />);
  return { ...r, onPick, onClose, input: r.getByPlaceholderText('Location') };
};
const type = (r: ReturnType<typeof open>, value: string) => fireEvent.input(r.input, { target: { value } });

describe('location popup next to the label', () => {
  test('there is no Save button: closing the popup saves what was typed', () => {
    const r = open();
    expect(r.queryByText('Save')).toBeNull();
    type(r, 'Garage');
    fireEvent.click(r.container.querySelector('.loc-backdrop')!);
    expect(r.onPick).toHaveBeenCalledWith('Garage');
  });

  test('is placed right below the label that was tapped', () => {
    const r = open();
    const pop = r.container.querySelector('.loc-pop') as HTMLElement;
    expect(pop.style.left).toBe('100px');
    expect(pop.style.top).toBe('236px');
  });

  test('Enter saves and closes', () => {
    const r = open();
    type(r, 'Office');
    fireEvent.keyDown(r.input, { key: 'Enter' });
    expect(r.onPick).toHaveBeenCalledWith('Office');
  });

  test('tapping a recent place picks it straight away', () => {
    const r = open();
    fireEvent.click(r.getByText('Kitchen'));
    expect(r.onPick).toHaveBeenLastCalledWith('Kitchen');
  });

  test('tapping outside without typing anything just closes', () => {
    const r = open();
    fireEvent.click(r.container.querySelector('.loc-backdrop')!);
    expect(r.onClose).toHaveBeenCalledTimes(1);
    expect(r.onPick).not.toHaveBeenCalled();
  });

  test('tapping outside when the text is unchanged, or was emptied, closes without changing the location', () => {
    const same = open({ current: 'Office' });
    fireEvent.click(same.container.querySelector('.loc-backdrop')!);
    expect(same.onPick).not.toHaveBeenCalled();
    expect(same.onClose).toHaveBeenCalled();
    cleanup();
    const emptied = open({ current: 'Office' });
    type(emptied, '   ');
    fireEvent.click(emptied.container.querySelector('.loc-backdrop')!);
    expect(emptied.onPick).not.toHaveBeenCalled();
    expect(emptied.onClose).toHaveBeenCalled();
  });

  test('Escape closes and throws away what was typed', () => {
    const r = open();
    type(r, 'Garage');
    fireEvent.keyDown(r.input, { key: 'Escape' });
    expect(r.onClose).toHaveBeenCalled();
    expect(r.onPick).not.toHaveBeenCalled();
  });

  test('Clear removes the location', () => {
    const r = open({ current: 'Office' });
    fireEvent.click(r.getByText('Clear'));
    expect(r.onPick).toHaveBeenCalledWith(null);
  });

  test('on the reading screen: opens next to the tapped label, saves on tapping outside, no bottom sheet', () => {
    const video: Video = { id: 'v', title: 'T', sections: [{ id: 's1', text: 'one two', location: null, done: false, updatedAt: 1 }] };
    const onChange = vi.fn();
    const r = render(<ReaderScreen video={video} recents={['Kitchen']} fontScale={1} onFontScale={() => {}} onChange={onChange} now={() => 5} />);
    const label = r.container.querySelector('.loc-btn') as HTMLElement;
    label.getBoundingClientRect = () => ({ left: 40, top: 120, width: 90, height: 28, right: 130, bottom: 148, x: 40, y: 120, toJSON: () => ({}) });
    fireEvent.click(label);
    const pop = r.container.querySelector('.loc-pop') as HTMLElement;
    expect(pop.style.left).toBe('40px');
    expect(pop.style.top).toBe('154px');
    expect(r.container.querySelector('.sheet')).toBeNull();
    fireEvent.input(r.getByPlaceholderText('Location'), { target: { value: 'Garage' } });
    fireEvent.click(r.container.querySelector('.loc-backdrop')!);
    const [saved, recents] = onChange.mock.calls.at(-1)!;
    expect(saved.sections[0].location).toBe('Garage');
    expect(recents[0]).toBe('Garage');
    expect(r.container.querySelector('.loc-pop')).toBeNull();
  });
});
