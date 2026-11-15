import { afterEach, describe, expect, test, vi } from 'vitest';
import { fetchGoogleDoc, GDocError, parseDocLink } from './gdocs';

afterEach(() => vi.unstubAllGlobals());

const DOC_MIME = 'application/vnd.google-apps.document';
const stub = (...responses: (Response | Error)[]) => {
  const f = vi.fn();
  responses.forEach((r) => (r instanceof Error ? f.mockRejectedValueOnce(r) : f.mockResolvedValueOnce(r)));
  vi.stubGlobal('fetch', f);
  return f;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('parseDocLink', () => {
  test.each([
    ['https://docs.google.com/document/d/1AbC-def_123/edit', '1AbC-def_123'],
    ['https://docs.google.com/document/d/1AbC-def_123/edit?usp=sharing', '1AbC-def_123'],
    ['https://docs.google.com/document/d/1AbC-def_123', '1AbC-def_123'],
    ['  https://docs.google.com/document/u/0/d/1AbC-def_123/edit#heading=h.x  ', '1AbC-def_123'],
  ])('%s -> %s', (link, id) => {
    expect(parseDocLink(link)).toBe(id);
  });

  test.each([
    [''],
    ['hello'],
    ['https://example.com/document/d/abc/edit'],
    ['https://docs.google.com/spreadsheets/d/abc/edit'],
    ['https://docs.google.com/document/'],
  ])('%j is not a Google Docs link', (link) => {
    expect(parseDocLink(link)).toBeNull();
  });
});

describe('fetchGoogleDoc', () => {
  test('reads the title, then exports the document as .docx with the bearer token', async () => {
    const f = stub(json({ name: 'My script', mimeType: DOC_MIME }), new Response(new Uint8Array([1, 2, 3])));
    const r = await fetchGoogleDoc('tok', 'abc');
    expect(r.name).toBe('My script');
    expect(new Uint8Array(r.bytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(String(f.mock.calls[1][0])).toContain('/files/abc/export');
    expect(String(f.mock.calls[1][0])).toContain(encodeURIComponent('application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
    expect((f.mock.calls[0][1] as any).headers.Authorization).toBe('Bearer tok');
  });

  test.each([[401], [403], [404]])('HTTP %i means no access', async (status) => {
    stub(json({}, status));
    await expect(fetchGoogleDoc('tok', 'abc')).rejects.toMatchObject({ code: 'no-access' });
  });

  test('a file that is not a Google Doc is rejected', async () => {
    stub(json({ name: 'sheet', mimeType: 'application/vnd.google-apps.spreadsheet' }));
    await expect(fetchGoogleDoc('tok', 'abc')).rejects.toMatchObject({ code: 'not-a-doc' });
  });

  test('a network failure is reported as network', async () => {
    stub(new TypeError('Failed to fetch'));
    const e = await fetchGoogleDoc('tok', 'abc').catch((x) => x);
    expect(e).toBeInstanceOf(GDocError);
    expect(e.code).toBe('network');
  });

  test('a failing export step (server error) is reported as other', async () => {
    stub(json({ name: 'n', mimeType: DOC_MIME }), json({}, 500));
    await expect(fetchGoogleDoc('tok', 'abc')).rejects.toMatchObject({ code: 'other' });
  });
});
