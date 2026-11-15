import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { ReaderScreen } from './ReaderScreen';
import { LocationSheet } from './LocationSheet';
import { SplitView } from './SplitView';
import type { Video } from '../model/types';

afterEach(cleanup);

const mkVideo = (): Video => ({
  id: 'v', title: 'T',
  sections: [
    { id: 's1', text: 'one two three four five six', location: null, done: false, updatedAt: 1 },
    { id: 's2', text: 'second para', location: null, done: false, updatedAt: 1 },
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

describe('SplitView', () => {
  test('tapping the 5th word splits at its character offset; first word is ignored', () => {
    const onSplitAt = vi.fn();
    const { getByText } = render(<SplitView text="one two three four five six" onSplitAt={onSplitAt} onCancel={() => {}} />);
    fireEvent.click(getByText('one'));
    expect(onSplitAt).not.toHaveBeenCalled();
    fireEvent.click(getByText('five'));
    expect(onSplitAt).toHaveBeenCalledWith('one two three four '.length);
  });
});

describe('ReaderScreen', () => {
  const setup = () => {
    const onChange = vi.fn();
    const r = render(<ReaderScreen video={mkVideo()} recents={['Kitchen']} fontScale={1} onFontScale={() => {}} onChange={onChange} now={() => 5} />);
    return { ...r, onChange };
  };
  test('tap section -> Set location -> pick updates video and recents', () => {
    const { container, getByText, onChange } = setup();
    fireEvent.click(container.querySelectorAll('[data-section]')[0]);
    fireEvent.click(getByText('Set location'));
    fireEvent.click(getByText('Kitchen'));
    const [video, recents] = onChange.mock.calls.at(-1)!;
    expect(video.sections[0].location).toBe('Kitchen');
    expect(recents[0]).toBe('Kitchen');
  });
  test('tap section -> Mark done toggles done', () => {
    const { container, getByText, onChange } = setup();
    fireEvent.click(container.querySelectorAll('[data-section]')[0]);
    fireEvent.click(getByText('Mark done'));
    expect(onChange.mock.calls.at(-1)![0].sections[0].done).toBe(true);
  });
  test('Split here then word tap yields two sections; Undo merges back', () => {
    const { container, getByText, onChange } = setup();
    fireEvent.click(container.querySelectorAll('[data-section]')[0]);
    fireEvent.click(getByText('Split here'));
    fireEvent.click(getByText('four'));
    const split = onChange.mock.calls.at(-1)![0];
    expect(split.sections.map((s: any) => s.text)).toEqual(['one two three', 'four five six', 'second para']);
    fireEvent.click(getByText('Undo'));
    expect(onChange.mock.calls.at(-1)![0].sections.map((s: any) => s.text)).toEqual(['one two three four five six', 'second para']);
  });
  test('Merge with previous is disabled on the first section', () => {
    const { container, getByText } = setup();
    fireEvent.click(container.querySelectorAll('[data-section]')[0]);
    expect((getByText('Merge with previous') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ReaderScreen (review fixes)', () => {
  test('C4: a new video prop (e.g. after a sync) replaces what is shown', () => {
    const v1 = mkVideo();
    const v2: Video = { ...v1, sections: [{ ...v1.sections[0], text: 'reworded after sync' }] };
    const r = render(<ReaderScreen video={v1} recents={[]} fontScale={1} onFontScale={() => {}} onChange={() => {}} />);
    r.rerender(<ReaderScreen video={v2} recents={[]} fontScale={1} onFontScale={() => {}} onChange={() => {}} />);
    expect(r.getByText('reworded after sync')).toBeTruthy();
  });
});
