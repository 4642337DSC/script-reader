import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { ReaderScreen } from './ReaderScreen';
import type { Video } from '../model/types';

afterEach(cleanup);

const mk = (): Video => ({
  id: 'v', title: 'T',
  sections: [{ id: 's1', text: 'aa bb cc dd ee ff', location: 'Kitchen', done: false, updatedAt: 1 }],
});
function setup() {
  const onChange = vi.fn();
  const r = render(<ReaderScreen video={mk()} recents={[]} fontScale={1} onFontScale={() => {}} onChange={onChange} now={() => 5} />);
  const word = (text: string) => [...r.container.querySelectorAll('.w')].find((e) => e.textContent === text) as HTMLElement;
  const texts = () => [...r.container.querySelectorAll('.section')].map((s) => [...s.querySelectorAll('.w')].map((w) => w.textContent).join(' '));
  return { ...r, onChange, word, texts };
}

describe('splitting a card on a phone', () => {
  test('tap a word, then tap the "Split before" button', () => {
    const r = setup();
    expect(r.queryByText(/Split before/)).toBeNull();
    fireEvent.click(r.word('cc'));
    fireEvent.click(r.getByText('✂ Split before “cc”'));
    expect(r.texts()).toEqual(['aa bb', 'cc dd ee ff']);
    expect((r.onChange.mock.calls.at(-1)![0] as Video).sections[1].location).toBe('Kitchen');
  });

  test('the first word has no split button (nothing before it)', () => {
    const r = setup();
    fireEvent.click(r.word('aa'));
    expect(r.queryByText(/Split before/)).toBeNull();
  });

  test('split mode: every word tap cuts, several in a row, until Done', () => {
    const r = setup();
    fireEvent.click(r.getByLabelText('Split card'));
    fireEvent.click(r.word('cc'));
    fireEvent.click(r.word('ee'));
    fireEvent.click(r.word('bb'));
    expect(r.texts()).toEqual(['aa', 'bb', 'cc dd', 'ee ff']);
    fireEvent.click(r.getAllByLabelText('Done splitting')[0]);
    fireEvent.click(r.word('ff'));
    expect(r.texts().length).toBe(4); // a tap now only selects
  });
});
