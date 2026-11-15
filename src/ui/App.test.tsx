import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { App } from './App';
import { openStore } from '../storage/db';
import type { ScriptDoc } from '../model/types';

const seed: ScriptDoc = {
  fileId: 'f1', name: 'Batch one.docx', updatedAt: 1,
  videos: [{ id: 'v1', title: 'Hook video', sections: [
    { id: 'a', text: 'first para', location: 'Kitchen', done: true, updatedAt: 1 },
    { id: 'b', text: 'second para', location: null, done: false, updatedAt: 1 },
  ] }],
  orphans: [{ id: 'o', text: 'removed text', location: 'Garage', done: true, updatedAt: 1 }],
};

beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); location.hash = ''; });
afterEach(cleanup);

describe('App', () => {
  test('lists scripts with progress, opens a video, persists a done toggle', async () => {
    const store = await openStore();
    await store.putScript(seed);
    const { findByText, getByText, container } = render(<App store={store} />);
    expect(await findByText('Batch one.docx')).toBeTruthy();
    expect(getByText('1/2 done')).toBeTruthy();
    fireEvent.click(getByText('Batch one.docx'));
    fireEvent.click(await findByText('Hook video'));
    fireEvent.click(await waitFor(() => container.querySelectorAll('[data-section]')[1] as Element));
    fireEvent.click(getByText('Mark done'));
    await waitFor(async () => {
      const saved = await (await openStore()).getScript('f1');
      expect(saved!.videos[0].sections[1].done).toBe(true);
    });
  });

  test('orphans view lists sections no longer in the script', async () => {
    const store = await openStore();
    await store.putScript(seed);
    const { findByText, getByText } = render(<App store={store} />);
    fireEvent.click(await findByText('Batch one.docx'));
    fireEvent.click(await findByText(/no longer in script/i));
    expect(await findByText('removed text')).toBeTruthy();
    expect(getByText(/Garage/)).toBeTruthy();
  });

  test('empty store shows a hint instead of a blank screen', async () => {
    const { findByText } = render(<App store={await openStore()} />);
    expect(await findByText(/No scripts yet/i)).toBeTruthy();
  });
});
