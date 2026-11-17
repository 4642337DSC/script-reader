import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { ReaderScreen } from './ReaderScreen';
import type { Video } from '../model/types';

afterEach(cleanup);

const mk = (): Video => ({
  id: 'v', title: 'T',
  sections: [
    { id: 's1', text: 'Cadre la bucătărie', location: null, done: true, updatedAt: 1 },
    { id: 's2', text: 'a doua frază', location: null, done: false, updatedAt: 1 },
    { id: 's3', text: 'iar bucătărie și foto', location: null, done: false, updatedAt: 1 },
    { id: 's4', text: 'ultima', location: null, done: true, updatedAt: 1 },
  ],
});

function setup() {
  const r = render(<ReaderScreen video={mk()} recents={[]} fontScale={1} onFontScale={() => {}} onChange={() => {}} now={() => 5} />);
  const cards = () => Array.from(r.container.querySelectorAll('[data-section]')).map((e) => e.querySelector('.card-no')!.textContent);
  const search = (v: string) => {
    if (!r.queryByLabelText('Search words')) fireEvent.click(r.getByLabelText('Search in video'));
    fireEvent.input(r.getByLabelText('Search words'), { target: { value: v } });
  };
  const chips = () => Array.from(r.container.querySelectorAll('.hit-chip')).map((e) => e.textContent);
  return { ...r, cards, search, chips };
}

describe('trash icon', () => {
  test('is an svg drawn in the current (red) colour, not an emoji', () => {
    const r = setup();
    const btn = r.container.querySelector('.del-card')!;
    expect(btn.querySelector('svg')).toBeTruthy();
    expect(btn.textContent).toBe('');
  });
});

describe('search within a video', () => {
  test('lists the numbers of the cards that contain the word', () => {
    const r = setup();
    r.search('bucătărie');
    expect(r.chips()).toEqual(['1', '3']);
  });

  test('ignores case and accents', () => {
    const r = setup();
    r.search('BUCATARIE');
    expect(r.chips()).toEqual(['1', '3']);
    r.search('si');
    expect(r.chips()).toEqual(['3']);
  });

  test('tapping a number scrolls to that card; Enter goes to the next match', () => {
    const r = setup();
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.getAttribute('data-section')!); };
    r.search('bucătărie');
    expect(scrolled.at(-1)).toBe('s1');
    fireEvent.click(r.getByLabelText('Go to card 3'));
    expect(scrolled.at(-1)).toBe('s3');
    fireEvent.keyDown(r.getByLabelText('Search words'), { key: 'Enter' });
    expect(scrolled.at(-1)).toBe('s1'); // wraps around
  });

  test('highlights the matching words and says so when nothing matches', () => {
    const r = setup();
    r.search('foto');
    expect(Array.from(r.container.querySelectorAll('.w.hit')).map((e) => e.textContent)).toEqual(['foto']);
    r.search('zzz');
    expect(r.getByText(/No cards contain/)).toBeTruthy();
    expect(r.chips()).toEqual([]);
  });

  test('closing the search clears it', () => {
    const r = setup();
    r.search('foto');
    fireEvent.click(r.getByLabelText('Close search'));
    expect(r.queryByLabelText('Search words')).toBeNull();
    expect(r.container.querySelectorAll('.w.hit').length).toBe(0);
  });
});

describe('unchecked-only filter', () => {
  test('shows only unchecked cards, keeping their real numbers, and toggles back', () => {
    const r = setup();
    expect(r.cards()).toEqual(['1', '2', '3', '4']);
    fireEvent.click(r.getByLabelText('Show only unchecked cards'));
    expect(r.cards()).toEqual(['2', '3']);
    expect(r.getByText('Showing 2 unchecked of 4 cards')).toBeTruthy();
    expect(r.container.querySelectorAll('.gap-join').length).toBe(0);
    fireEvent.click(r.getByLabelText('Show only unchecked cards'));
    expect(r.cards()).toEqual(['1', '2', '3', '4']);
  });

  test('a card disappears as soon as it is checked, and the search only lists visible cards', () => {
    const r = setup();
    fireEvent.click(r.getByLabelText('Show only unchecked cards'));
    r.search('bucătărie');
    expect(r.chips()).toEqual(['3']);
    fireEvent.click(r.container.querySelectorAll('.done-btn')[1]); // tick card 3
    expect(r.cards()).toEqual(['2']);
  });

  test('says when everything is checked', () => {
    const v = mk();
    v.sections.forEach((s) => { s.done = true; });
    const r = render(<ReaderScreen video={v} recents={[]} fontScale={1} onFontScale={() => {}} onChange={vi.fn()} />);
    fireEvent.click(r.getByLabelText('Show only unchecked cards'));
    expect(r.getByText('All cards are checked ✓')).toBeTruthy();
  });
});
