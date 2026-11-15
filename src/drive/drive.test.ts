import { afterEach, describe, expect, test, vi } from 'vitest';
import { AuthExpired, downloadFile, listScriptFiles, readStateFile, writeStateFile } from './drive';
import type { ScriptDoc } from '../model/types';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());
const stub = (...responses: Response[]) => {
  const f = vi.fn();
  responses.forEach((r) => f.mockResolvedValueOnce(r));
  vi.stubGlobal('fetch', f);
  return f;
};

describe('drive', () => {
  test('listScriptFiles finds the Scripts folder then only .docx files', async () => {
    const f = stub(
      json({ files: [{ id: 'folder1' }] }),
      json({ files: [
        { id: 'a', name: 'one.docx', modifiedTime: 't1' },
        { id: 'b', name: 'notes.txt', modifiedTime: 't2' },
        { id: 'c', name: '~$lock.docx', modifiedTime: 't3' },
      ] }),
    );
    const r = await listScriptFiles('tok');
    expect(r).toEqual([{ id: 'a', name: 'one.docx', modifiedTime: 't1' }]);
    expect((f.mock.calls[0][1] as any).headers.Authorization).toBe('Bearer tok');
  });
  test('listScriptFiles returns [] when the folder does not exist', async () => {
    stub(json({ files: [] }));
    expect(await listScriptFiles('tok')).toEqual([]);
  });
  test('downloadFile returns bytes', async () => {
    stub(new Response(new Uint8Array([1, 2, 3])));
    expect(new Uint8Array(await downloadFile('tok', 'a'))).toEqual(new Uint8Array([1, 2, 3]));
  });
  test('401 rejects with AuthExpired', async () => {
    stub(json({}, 401));
    await expect(listScriptFiles('tok')).rejects.toBeInstanceOf(AuthExpired);
  });
  test('readStateFile returns null when absent, docs when present', async () => {
    stub(json({ files: [] }));
    expect(await readStateFile('tok')).toBeNull();
    const docs: ScriptDoc[] = [{ fileId: 'a', name: 'a', videos: [], orphans: [], updatedAt: 1 }];
    stub(json({ files: [{ id: 's1' }] }), json(docs));
    expect(await readStateFile('tok')).toEqual(docs);
  });
  test('writeStateFile creates when absent and updates when present', async () => {
    const create = stub(json({ files: [] }), json({ id: 'new' }));
    await writeStateFile('tok', []);
    expect(String(create.mock.calls[1][0])).toContain('uploadType=multipart');
    expect((create.mock.calls[1][1] as any).method).toBe('POST');
    const update = stub(json({ files: [{ id: 's1' }] }), json({ id: 's1' }));
    await writeStateFile('tok', []);
    expect((update.mock.calls[1][1] as any).method).toBe('PATCH');
    expect(String(update.mock.calls[1][0])).toContain('/s1');
  });
});
