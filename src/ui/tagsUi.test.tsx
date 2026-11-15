import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { ReaderScreen } from './ReaderScreen';
import { TAG_INFO } from './tagInfo';
import { TagIcon } from './TagIcon';
import type { Video } from '../model/types';

afterEach(cleanup);

const mk = (): Video => ({
  id: 'v', title: 'T',
  sections: [
    { id: 's1', text: 'one two', location: null, done: false, updatedAt: 1 },
    { id: 's2', text: 'three four', location: null, done: false, updatedAt: 1, tag: 'closeup' },
  ],
});

function setup() {
  const onChange = vi.fn();
  const r = render(<ReaderScreen video={mk()} recents={[]} fontScale={1} onFontScale={() => {}} onChange={onChange} now={() => 5} />);
  const tagBtn = (i: number) => r.container.querySelectorAll('.tag-btn')[i] as HTMLElement;
  return { ...r, onChange, tagBtn, last: () => onChange.mock.calls.at(-1)![0] as Video };
}

describe('shot tag icon on each card', () => {
  test('every card has a tag icon: a quiet one when untagged, the shot icon when tagged', () => {
    const r = setup();
    expect(r.tagBtn(0).getAttribute('aria-label')).toBe('Shot tag: none');
    expect(r.tagBtn(1).getAttribute('aria-label')).toBe('Shot tag: Close-up');
    expect(r.tagBtn(1).querySelector('svg[data-icon="closeup"]')).toBeTruthy();
    expect(r.tagBtn(0).querySelector('svg[data-icon="none"]')).toBeTruthy();
    expect(r.tagBtn(1).textContent?.trim()).toBe('');
    expect(r.tagBtn(1).getAttribute('title')).toBe('Close-up');
    expect(r.tagBtn(1).getAttribute('data-tag')).toBe('closeup');
  });

  test('the four tags have their own name and their own line icon, all drawn in the same style', () => {
    expect(Object.keys(TAG_INFO)).toEqual(['wide', 'medium', 'closeup', 'voiceover']);
    expect(Object.values(TAG_INFO).map((t) => t.label)).toEqual(['Wide', 'Medium', 'Close-up', 'Voiceover']);
    const kinds = ['none', 'wide', 'medium', 'closeup', 'voiceover'] as const;
    const drawn = kinds.map((k) => render(<TagIcon tag={k === 'none' ? undefined : k} />).container.querySelector('svg')!);
    expect(new Set(drawn.map((s) => s.innerHTML)).size).toBe(5);
    for (const s of drawn) {
      expect(s.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(s.getAttribute('fill')).toBe('none');
      expect(s.getAttribute('stroke')).toBe('currentColor');
      expect(s.getAttribute('aria-hidden')).toBe('true');
    }
  });

  test('tapping the icon cycles none, wide, medium, close-up, voiceover, none', () => {
    const r = setup();
    const seen: (string | undefined)[] = [];
    for (let i = 0; i < 5; i++) {
      fireEvent.click(r.tagBtn(0));
      seen.push(r.last().sections[0].tag);
    }
    expect(seen).toEqual(['wide', 'medium', 'closeup', 'voiceover', undefined]);
    expect(r.tagBtn(0).getAttribute('aria-label')).toBe('Shot tag: none');
  });

  test('tapping it does not open the location popup, select a word or open the text editor', () => {
    const r = setup();
    fireEvent.click(r.tagBtn(0));
    expect(r.container.querySelector('.loc-pop')).toBeNull();
    expect(r.container.querySelectorAll('.w.sel').length).toBe(0);
    expect(r.queryByLabelText('Section text')).toBeNull();
  });

  test('tagging is undoable like any other change', () => {
    const r = setup();
    fireEvent.click(r.tagBtn(0));
    fireEvent.click(r.getByLabelText('Undo'));
    expect(r.last().sections[0].tag).toBeUndefined();
  });
});
