import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { ReaderScreen } from './ReaderScreen';
import { LocationSheet } from './LocationSheet';
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

describe('ReaderScreen: three direct taps instead of a menu', () => {
  const setup = () => {
    const onChange = vi.fn();
    const r = render(<ReaderScreen video={mkVideo()} recents={['Kitchen']} fontScale={1} onFontScale={() => {}} onChange={onChange} now={() => 5} />);
    const done = (i: number) => r.container.querySelectorAll('.done-btn')[i] as HTMLElement;
    const loc = (i: number) => r.container.querySelectorAll('.loc-btn')[i] as HTMLElement;
    const text = (i: number) => r.container.querySelectorAll('.section .text')[i] as HTMLElement;
    return { ...r, onChange, done, loc, text };
  };

  test('tapping the done bar toggles done, and tapping again undoes it', () => {
    const w = setup();
    fireEvent.click(w.done(0));
    expect(w.onChange.mock.calls.at(-1)![0].sections[0].done).toBe(true);
    fireEvent.click(w.done(0));
    expect(w.onChange.mock.calls.at(-1)![0].sections[0].done).toBe(false);
  });

  test('the done bar says what it will do, for screen readers too', () => {
    const w = setup();
    expect(w.done(0).getAttribute('aria-label')).toBe('Mark done');
    fireEvent.click(w.done(0));
    expect(w.done(0).getAttribute('aria-label')).toBe('Mark not done');
    expect(w.done(0).getAttribute('aria-pressed')).toBe('true');
  });

  test('tapping the location label opens the location box; picking updates the video and recents', () => {
    const w = setup();
    fireEvent.click(w.loc(0));
    fireEvent.click(w.getByText('Kitchen'));
    const [video, recents] = w.onChange.mock.calls.at(-1)!;
    expect(video.sections[0].location).toBe('Kitchen');
    expect(recents[0]).toBe('Kitchen');
  });

  test('tapping the text opens the paragraph editor; there is no popup menu any more', () => {
    const w = setup();
    fireEvent.click(w.text(0));
    expect(w.getByText('Merge with previous')).toBeTruthy();
    expect(w.getByText('Edit text')).toBeTruthy();
    expect(w.queryByText('Set location')).toBeNull();
    expect(w.queryByText('Mark done')).toBeNull();
    expect(w.queryByText('Split here')).toBeNull();
  });

  test('the done bar and the location label do not open the editor', () => {
    const w = setup();
    fireEvent.click(w.done(0));
    fireEvent.click(w.loc(1));
    expect(w.queryByText('Edit text')).toBeNull();
  });

  test('Split before the selected word in the editor yields two sections', () => {
    const w = setup();
    fireEvent.click(w.text(0));
    fireEvent.click(w.getByText('four', { selector: '.mw-word' }));
    fireEvent.click(w.getByText('Split before selected word'));
    expect(w.onChange.mock.calls.at(-1)![0].sections.map((s: any) => s.text)).toEqual(['one two three', 'four five six', 'second para']);
    expect(w.queryByText('Edit text')).toBeNull();
  });

  test('Merge with previous in the editor joins the paragraph to the one above', () => {
    const w = setup();
    fireEvent.click(w.text(1));
    fireEvent.click(w.getByText('Merge with previous'));
    expect(w.onChange.mock.calls.at(-1)![0].sections.map((s: any) => s.text)).toEqual(['one two three four five six second para']);
  });

  test('Edit text in the editor saves the new text', () => {
    const w = setup();
    fireEvent.click(w.text(1));
    fireEvent.click(w.getByText('Edit text'));
    fireEvent.input(w.getByLabelText('Section text'), { target: { value: 'second para fixed' } });
    fireEvent.click(w.getByText('Save'));
    expect(w.onChange.mock.calls.at(-1)![0].sections[1].text).toBe('second para fixed');
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
