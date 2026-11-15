import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { AutoSaveText } from './AutoSaveText';

afterEach(cleanup);

const open = (props: Partial<Parameters<typeof AutoSaveText>[0]> = {}) => {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const r = render(
    <div>
      <p data-testid="elsewhere">elsewhere</p>
      <AutoSaveText initial="hello world" label="Box" onSave={onSave} onCancel={onCancel} {...props} />
    </div>,
  );
  const box = r.getByLabelText('Box') as HTMLTextAreaElement | HTMLInputElement;
  const type = (v: string) => fireEvent.input(box, { target: { value: v } });
  return { ...r, box, type, onSave, onCancel };
};

describe('AutoSaveText: no Save button, leaving the box saves', () => {
  test('there are no Save or Cancel buttons', () => {
    const r = open();
    expect(r.queryByText('Save')).toBeNull();
    expect(r.queryByText('Cancel')).toBeNull();
  });

  test('tapping outside saves a changed text', () => {
    const r = open();
    r.type('hello brave world');
    fireEvent.pointerDown(r.getByTestId('elsewhere'));
    expect(r.onSave).toHaveBeenCalledWith('hello brave world');
    expect(r.onCancel).not.toHaveBeenCalled();
  });

  test('losing focus saves a changed text, once', () => {
    const r = open();
    r.type('changed');
    fireEvent.blur(r.box);
    fireEvent.pointerDown(r.getByTestId('elsewhere'));
    expect(r.onSave).toHaveBeenCalledTimes(1);
  });

  test('an unchanged text just closes without saving', () => {
    const r = open();
    fireEvent.blur(r.box);
    expect(r.onSave).not.toHaveBeenCalled();
    expect(r.onCancel).toHaveBeenCalledTimes(1);
  });

  test('a blank text is not saved (the old text stays) unless blank is allowed', () => {
    const r = open();
    r.type('   ');
    fireEvent.blur(r.box);
    expect(r.onSave).not.toHaveBeenCalled();
    expect(r.onCancel).toHaveBeenCalled();
    cleanup();
    const notes = open({ allowEmpty: true });
    notes.type('');
    fireEvent.blur(notes.box);
    expect(notes.onSave).toHaveBeenCalledWith('');
  });

  test('Escape closes and throws away the changes', () => {
    const r = open();
    r.type('oops');
    fireEvent.keyDown(r.box, { key: 'Escape' });
    expect(r.onCancel).toHaveBeenCalled();
    expect(r.onSave).not.toHaveBeenCalled();
    fireEvent.blur(r.box);
    expect(r.onSave).not.toHaveBeenCalled();
  });

  test('Enter saves when enterSaves is on; with it off Enter is a new line and Ctrl+Enter saves', () => {
    const a = open();
    a.type('with enter');
    fireEvent.keyDown(a.box, { key: 'Enter' });
    expect(a.onSave).toHaveBeenCalledWith('with enter');
    cleanup();
    const b = open({ enterSaves: false });
    b.type('line one');
    fireEvent.keyDown(b.box, { key: 'Enter' });
    expect(b.onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(b.box, { key: 'Enter', ctrlKey: true });
    expect(b.onSave).toHaveBeenCalledWith('line one');
  });

  test('a single-line box is an input, a multi-line one is a textarea', () => {
    expect(open({ multiline: false }).box.tagName).toBe('INPUT');
    cleanup();
    expect(open().box.tagName).toBe('TEXTAREA');
  });
});
