import { describe, expect, test } from 'vitest';
import { placePopover } from './placePopover';

const viewport = { width: 400, height: 700 };
const size = { width: 300, height: 150 };

describe('placePopover', () => {
  test('sits just below the clicked label, left edges aligned', () => {
    expect(placePopover({ left: 20, top: 100, width: 80, height: 30 }, size, viewport)).toEqual({ left: 20, top: 136 });
  });

  test('is pulled back inside the screen on the right and on the left', () => {
    expect(placePopover({ left: 380, top: 100, width: 20, height: 30 }, size, viewport).left).toBe(92);
    expect(placePopover({ left: -30, top: 100, width: 20, height: 30 }, size, viewport).left).toBe(8);
  });

  test('flips above the label when there is no room below', () => {
    expect(placePopover({ left: 20, top: 600, width: 80, height: 30 }, size, viewport)).toEqual({ left: 20, top: 444 });
  });

  test('when it fits neither above nor below it is kept on screen', () => {
    const r = placePopover({ left: 20, top: 60, width: 80, height: 30 }, { width: 300, height: 640 }, viewport);
    expect(r.top).toBe(52);
  });
});
