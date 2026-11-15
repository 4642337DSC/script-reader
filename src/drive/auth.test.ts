import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getAccessToken, TOKEN_KEY } from './auth';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('getAccessToken', () => {
  test('returns a cached unexpired token without any network', async () => {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: 'abc', exp: Date.now() + 600_000 }));
    expect(await getAccessToken(false)).toBe('abc');
  });
  test('offline with no usable token resolves to null and never throws', async () => {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: 'old', exp: Date.now() - 1000 }));
    vi.stubGlobal('navigator', { onLine: false });
    expect(await getAccessToken(true)).toBeNull();
  });
  test('missing client id resolves to null', async () => {
    expect(await getAccessToken(false)).toBeNull();
  });
});
