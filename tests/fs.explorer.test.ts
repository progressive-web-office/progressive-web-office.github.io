import { describe, expect, it } from 'vitest';
import { Explorer, MemoryProvider, formatSize, listFiles, sortEntries, type Entry } from '../src/fs';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await tick();
};

async function explorer(files: Record<string, string>, extra: Partial<ConstructorParameters<typeof Explorer>[0]> = {}) {
  const provider = new MemoryProvider('memory', 'Memory', files);
  const opened: string[] = [];
  const x = new Explorer({ provider, onOpen: (e) => opened.push(e.path), confirm: async () => true, ...extra });
  document.body.replaceChildren(x.element);
  await x.refresh();
  const row = (path: string): HTMLButtonElement => x.element.querySelector<HTMLButtonElement>(`[data-path="${path}"]`)!;
  const key = (target: HTMLElement, k: string, init: KeyboardEventInit = {}): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
  };
  return { provider, x, opened, row, key };
}

describe('FOLDER-008 file explorer: sizes, dates and sorting', () => {
  const e = (name: string, size: number, lastModified: number, kind: Entry['kind'] = 'file'): Entry => ({ name, path: name, kind, size, lastModified });
  const entries = [e('b.md', 300, 3), e('a.txt', 100, 1), e('c.pdf', 200, 2), e('z', 0, 0, 'directory'), e('y', 0, 9, 'directory')];

  it('sorts by name, date, size or type, folders first', () => {
    expect(sortEntries(entries, 'name').map((x) => x.name)).toEqual(['y', 'z', 'a.txt', 'b.md', 'c.pdf']);
    expect(sortEntries(entries, 'date').map((x) => x.name)).toEqual(['y', 'z', 'b.md', 'c.pdf', 'a.txt']);
    expect(sortEntries(entries, 'size').map((x) => x.name)).toEqual(['y', 'z', 'b.md', 'c.pdf', 'a.txt']);
    expect(sortEntries(entries, 'type').map((x) => x.name)).toEqual(['y', 'z', 'b.md', 'c.pdf', 'a.txt']);
  });

  it('formats sizes', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('shows the size and date of files, and sorts the tree', async () => {
    const sorted: string[] = [];
    const { x, row } = await explorer({ 'small.md': 'a', 'big.md': 'a'.repeat(5000) }, { onSort: (k) => sorted.push(k) });
    expect(row('big.md').dataset.meta).toContain('4.9 KB');
    expect(row('big.md').title).toContain('4.9 KB');
    const select = x.element.querySelector<HTMLSelectElement>('.fs-sort')!;
    select.value = 'size';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect([...x.element.querySelectorAll<HTMLElement>('.fs-entry')].map((b) => b.dataset.path)).toEqual(['big.md', 'small.md']);
    expect(sorted).toEqual(['size']);
  });
});

describe('FOLDER-009 file explorer: keyboard', () => {
  it('moves with the arrows, opens and closes folders, jumps with Home and End', async () => {
    const { x, row, key, opened } = await explorer({ 'docs/a.md': '', 'docs/b.md': '', 'z.md': '' });
    row('docs').focus();
    key(row('docs'), 'ArrowDown');
    expect(document.activeElement).toBe(row('z.md'));
    key(row('z.md'), 'ArrowUp');
    expect(document.activeElement).toBe(row('docs'));
    key(row('docs'), 'ArrowRight');
    await settle();
    expect(row('docs').getAttribute('aria-expanded')).toBe('true');
    key(row('docs'), 'ArrowRight');
    expect(document.activeElement).toBe(row('docs/a.md'));
    key(row('docs/a.md'), 'End');
    expect(document.activeElement).toBe(row('z.md'));
    key(row('z.md'), 'Home');
    expect(document.activeElement).toBe(row('docs'));
    row('docs/b.md').focus();
    key(row('docs/b.md'), 'ArrowLeft');
    expect(document.activeElement).toBe(row('docs'));
    key(row('docs'), 'ArrowLeft');
    await settle();
    expect(row('docs').getAttribute('aria-expanded')).toBe('false');
    expect(x.element.querySelector('[data-path="docs/a.md"]')).toBeNull();
    row('z.md').click();
    expect(opened).toEqual(['z.md']);
  });
});

describe('FOLDER-010 file explorer: importing files of the device', () => {
  it('copies files into the selected folder, renaming those already there', async () => {
    const { provider, x, row } = await explorer({ 'docs/a.md': 'old' });
    row('docs').click();
    await settle();
    await x.importFiles([new File(['new'], 'a.md'), new File(['b'], 'b.md')]);
    expect(await listFiles(provider)).toEqual(['docs/a 2.md', 'docs/a.md', 'docs/b.md']);
    expect(await (await provider.read('docs/a 2.md')).text()).toBe('new');
  });
});

describe('FOLDER-011 file explorer: several entries at once, undoing a deletion', () => {
  it('selects with Ctrl and Shift, deletes them all, and undoes the deletion', async () => {
    const { provider, x, row, key, opened } = await explorer({ 'a.md': 'A', 'b.md': 'B', 'c.md': 'C', 'd/e.md': 'E' });
    row('a.md').click();
    row('c.md').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(x.selection()).toEqual(['a.md', 'b.md', 'c.md']);
    row('b.md').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    row('d').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(x.selection()).toEqual(['d', 'a.md', 'c.md']);
    expect(opened).toEqual(['a.md']);
    await x.removeSelected();
    expect(await listFiles(provider)).toEqual(['b.md']);
    const undo = x.element.querySelector<HTMLElement>('.fs-undo')!;
    expect(undo.hidden).toBe(false);
    key(row('b.md'), 'z', { ctrlKey: true });
    await settle();
    expect(await listFiles(provider)).toEqual(['d/e.md', 'a.md', 'b.md', 'c.md']);
    expect(await (await provider.read('d/e.md')).text()).toBe('E');
    expect(undo.hidden).toBe(true);
  });

  it('moves the selected entries together', async () => {
    const { provider, x, row } = await explorer({ 'a.md': 'A', 'b.md': 'B', 'dir/keep.md': '' });
    row('a.md').click();
    row('b.md').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    await x.moveSelectionInto('dir');
    expect(await listFiles(provider)).toEqual(['dir/a.md', 'dir/b.md', 'dir/keep.md']);
  });
});

describe('FOLDER-012 file explorer: copy, cut, paste and duplicate', () => {
  it('copies and pastes into another folder, giving a free name when taken', async () => {
    const { provider, row, key } = await explorer({ 'a.md': 'A', 'docs/a.md': 'old', 'docs/b.md': 'B' });
    row('a.md').click();
    key(row('a.md'), 'c', { ctrlKey: true });
    row('docs').click();
    await settle();
    key(row('docs'), 'v', { ctrlKey: true });
    await settle();
    expect(await listFiles(provider)).toEqual(['docs/a 2.md', 'docs/a.md', 'docs/b.md', 'a.md']);
    expect(await (await provider.read('docs/a 2.md')).text()).toBe('A');
  });

  it('cuts and pastes (a move), folders with their contents', async () => {
    const { provider, x, row } = await explorer({ 'src/one.md': '1', 'src/sub/two.md': '2', 'dst/keep.md': '' });
    row('src').click();
    x.cutSelection();
    row('dst').click();
    await settle();
    await x.paste();
    expect(await listFiles(provider)).toEqual(['dst/src/sub/two.md', 'dst/src/one.md', 'dst/keep.md']);
  });

  it('duplicates next to the original', async () => {
    const { provider, x, row } = await explorer({ 'notes/plan.md': 'P' });
    row('notes').click();
    await settle();
    row('notes/plan.md').click();
    await x.duplicateSelection();
    expect(await listFiles(provider)).toEqual(['notes/plan 2.md', 'notes/plan.md']);
  });
});

describe('FOLDER-013 file explorer: context menu', () => {
  it('opens on a right click with the actions for the entry, and runs them', async () => {
    const { provider, x, row } = await explorer({ 'a.md': 'A' }, { download: () => undefined });
    row('a.md').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    const menu = x.element.ownerDocument.querySelector<HTMLElement>('.fs-menu')!;
    expect(menu.getAttribute('role')).toBe('menu');
    const items = [...menu.querySelectorAll<HTMLElement>('[role=menuitem]')].map((b) => b.textContent);
    expect(items).toEqual(expect.arrayContaining(['Open', 'Rename', 'Duplicate', 'Copy', 'Cut', 'Download', 'Copy the path', 'Delete']));
    expect(document.activeElement).toBe(menu.querySelector('[role=menuitem]'));
    [...menu.querySelectorAll<HTMLElement>('[role=menuitem]')].find((b) => b.textContent === 'Duplicate')!.click();
    await settle();
    expect(await listFiles(provider)).toEqual(['a 2.md', 'a.md']);
    expect(x.element.ownerDocument.querySelector('.fs-menu')).toBeNull();
  });

  it('opens from the keyboard and closes with Escape', async () => {
    const { x, row, key } = await explorer({ 'a.md': 'A' });
    row('a.md').focus();
    key(row('a.md'), 'F10', { shiftKey: true });
    const menu = document.querySelector<HTMLElement>('.fs-menu')!;
    expect(menu).not.toBeNull();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(menu.querySelectorAll('[role=menuitem]')[1]);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.fs-menu')).toBeNull();
    expect(document.activeElement).toBe(row('a.md'));
    expect(x).toBeTruthy();
  });
});

describe('FOLDER-014 file explorer: downloads', () => {
  it('gives the selected entries to the host to download', async () => {
    const got: string[][] = [];
    const { x, row } = await explorer({ 'a.md': 'A', 'dir/b.md': 'B' }, { download: (entries) => void got.push(entries.map((e) => e.path)) });
    row('a.md').click();
    row('dir').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    await x.downloadSelection();
    expect(got).toEqual([['dir', 'a.md']]);
  });
});

describe('FOLDER-016 file explorer: collapse all, show the open document', () => {
  it('closes every folder, and opens those leading to the open document', async () => {
    const { x, row } = await explorer({ 'a/b/c.md': '', 'd/e.md': '' });
    row('a').click();
    await settle();
    row('d').click();
    await settle();
    expect(x.element.querySelectorAll('[aria-expanded=true]')).toHaveLength(2);
    await x.collapseAll();
    expect(x.element.querySelectorAll('[aria-expanded=true]')).toHaveLength(0);
    x.setCurrent('a/b/c.md');
    await x.revealCurrent();
    expect(row('a/b/c.md').getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(row('a/b/c.md'));
  });
});

describe('FOLDER-024 kinds of new files', () => {
  it('offers the other kinds in the toolbar and creates them with a computed name and content', async () => {
    const { x, provider, opened } = await explorer(
      {},
      {
        prompt: async (_m, value) => value,
        newFiles: [
          { label: 'New note', name: 'Untitled.md', content: () => new Blob(['# U\n']) },
          { label: 'New dated note', icon: '🆔', name: () => '202410031530 Untitled.md', content: (name) => new Blob([`id from ${name}`]) },
        ],
      },
    );
    const button = x.element.querySelector<HTMLButtonElement>('[aria-label="New dated note"]')!;
    expect(button.textContent).toBe('🆔');
    button.click();
    await settle();
    expect(await (await provider.read('202410031530 Untitled.md')).text()).toBe('id from 202410031530 Untitled.md');
    expect(opened).toEqual(['202410031530 Untitled.md']);
  });
});

describe('FOLDER-032 file explorer: the folder itself', () => {
  it('shows the folder as the first entry, holding the tree, folded and unfolded by a click', async () => {
    const { x, row } = await explorer({ 'a.md': 'A', 'sub/b.md': 'B' }, { root: 'Vault.zip' });
    const rows = [...x.element.querySelectorAll<HTMLElement>('.fs-entry')];
    expect(rows[0]!.dataset.path).toBe('');
    expect(rows[0]!.textContent).toBe('Vault.zip');
    expect(rows[0]!.getAttribute('aria-expanded')).toBe('true');
    expect(row('a.md').closest('li')!.parentElement!.closest('li')!.querySelector(':scope > .fs-entry')).toBe(rows[0]);
    rows[0]!.click();
    await settle();
    expect(x.element.querySelector('[data-path="a.md"]')).toBeNull();
    row('').click();
    await settle();
    expect(row('a.md')).not.toBeNull();
  });

  it('gives the folder the actions of a folder and the host actions, never rename, move or delete', async () => {
    const seen: string[][] = [];
    const { provider, x, row, key } = await explorer({ 'a.md': 'A' }, { root: 'Notes', download: () => undefined, actions: (entries) => [['Pseudonymise…', () => seen.push(entries.map((e) => e.path))]] });
    row('').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    const menu = document.querySelector<HTMLElement>('.fs-menu')!;
    const items = [...menu.querySelectorAll<HTMLElement>('[role=menuitem]')].map((b) => b.textContent);
    expect(items).toEqual(expect.arrayContaining(['New file', 'New folder', 'Download', 'Pseudonymise…']));
    for (const no of ['Rename', 'Duplicate', 'Cut', 'Copy', 'Delete', 'Copy the path']) expect(items).not.toContain(no);
    [...menu.querySelectorAll<HTMLElement>('[role=menuitem]')].find((b) => b.textContent === 'Pseudonymise…')!.click();
    expect(seen).toEqual([['']]);
    // Delete and F2 on the folder itself do nothing; Ctrl+A then Delete keeps the folder.
    row('').focus();
    key(row(''), 'Delete');
    key(row(''), 'F2');
    await settle();
    expect(await listFiles(provider)).toEqual(['a.md']);
    key(row(''), 'a', { ctrlKey: true });
    await x.removeSelected();
    expect(await listFiles(provider)).toEqual([]);
    expect(row('')).not.toBeNull();
  });
});
