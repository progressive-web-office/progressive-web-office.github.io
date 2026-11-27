/**
 * A file explorer over any storage provider (FOLDER-004): a lazily loaded
 * tree, and creating, renaming, moving (drag and drop) and deleting files and
 * folders; sizes, dates and sorting (FOLDER-008), keyboard navigation
 * (FOLDER-009), importing files of the device (FOLDER-010), several entries at
 * once and undoing a deletion (FOLDER-011). Plain DOM, no framework; texts and
 * icons are given by the host.
 */
import { basename, byKindThenName, checkName, dirname, extname, isInside, join } from '../path';
import { copy, freeName, walk } from '../walk';
import { FsError, type Entry, type StorageProvider } from '../types';

export interface ExplorerStrings {
  tree: string;
  newFile: string;
  newFolder: string;
  rename: string;
  remove: string;
  refresh: string;
  empty: string;
  readOnly: string;
  namePrompt: string;
  folderName: string;
  confirmRemove: (name: string, isFolder: boolean) => string;
  confirmRemoveMany: (n: number) => string;
  /** Added to the confirmation when the deletion is too large to be undone. */
  noUndo: string;
  deleted: (n: number) => string;
  undo: string;
  importFiles: string;
  sortBy: string;
  sortNames: Record<SortKey, string>;
  open: string;
  duplicate: string;
  copy: string;
  cut: string;
  paste: string;
  download: string;
  copyPath: string;
  menu: string;
  collapseAll: string;
  showCurrent: string;
  error: (message: string) => string;
}

export type SortKey = 'name' | 'date' | 'size' | 'type';

const DEFAULT_STRINGS: ExplorerStrings = {
  tree: 'Files',
  newFile: 'New file',
  newFolder: 'New folder',
  rename: 'Rename',
  remove: 'Delete',
  refresh: 'Reload',
  empty: 'This folder is empty.',
  readOnly: 'Read-only',
  namePrompt: 'Name:',
  folderName: 'New folder',
  confirmRemove: (name, folder) => `Delete ${folder ? 'the folder' : ''} “${name}”${folder ? ' and everything in it' : ''}?`,
  confirmRemoveMany: (n) => `Delete these ${n} items?`,
  noUndo: 'This cannot be undone.',
  deleted: (n) => (n === 1 ? 'Deleted.' : `${n} items deleted.`),
  undo: 'Undo',
  importFiles: 'Import files of this device',
  sortBy: 'Sort by',
  sortNames: { name: 'Name', date: 'Date', size: 'Size', type: 'Type' },
  open: 'Open',
  duplicate: 'Duplicate',
  copy: 'Copy',
  cut: 'Cut',
  paste: 'Paste',
  download: 'Download',
  copyPath: 'Copy the path',
  menu: 'Actions',
  collapseAll: 'Collapse all folders',
  showCurrent: 'Show the open document',
  error: (m) => m,
};

export interface ExplorerChange {
  type: 'create' | 'rename' | 'move' | 'remove';
  path: string;
  /** New path of a renamed or moved entry. */
  to?: string;
  kind: Entry['kind'];
}

export interface NewFileKind {
  label: string;
  /** Default name, e.g. `Untitled.md`, or a function giving it (a name with the date). */
  name: string | (() => string);
  /** Content of the new file, given its name. */
  content: (name: string) => Blob | Promise<Blob>;
  /** Other kinds than the first: with an icon, a button of the toolbar too (all are in the menu). */
  icon?: string;
}

export interface ExplorerOptions {
  provider: StorageProvider;
  strings?: Partial<ExplorerStrings>;
  /** Entries shown (default: all but hidden names). */
  filter?: (e: Entry) => boolean;
  /** A decorative icon per entry. */
  icon?: (e: Entry) => string;
  onOpen(entry: Entry): void;
  /** Called after a change made in the explorer (to update links, the open document…). */
  onChange?(change: ExplorerChange): void | Promise<void>;
  /** Kinds of files "New file" offers (default: an empty text file). */
  newFiles?: NewFileKind[];
  /** Dialogs (default: the browser's prompt and confirm). */
  prompt?(message: string, value: string): Promise<string | null>;
  confirm?(message: string): Promise<boolean>;
  onError?(message: string): void;
  /** Initial order of the entries (default: by name). */
  sort?: SortKey;
  /** Called when the user changes the order (to remember it). */
  onSort?(key: SortKey): void;
  /** Language of dates (default: the document's). */
  locale?: string;
  /** Download entries (a folder as an archive, for example); no download action without it. */
  download?(entries: Entry[]): void | Promise<void>;
  /** Put text on the clipboard (default: the browser's clipboard). */
  copyText?(text: string): void | Promise<void>;
  /** FOLDER-032: the name of the folder itself, shown as the first entry of the tree (path ""). */
  root?: string;
  /** More actions of the menu for the selected entries (the root included). */
  actions?(entries: Entry[]): [label: string, run: () => unknown][];
}

/** Entries in the given order, folders first (newest, largest first for dates and sizes). */
export function sortEntries(entries: Entry[], key: SortKey): Entry[] {
  const by: Record<SortKey, (a: Entry, b: Entry) => number> = {
    name: () => 0,
    date: (a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0),
    size: (a, b) => (b.size ?? 0) - (a.size ?? 0),
    type: (a, b) => extname(a.name).localeCompare(extname(b.name)),
  };
  return [...entries].sort((a, b) => (a.kind !== b.kind ? byKindThenName(a, b) : by[key](a, b) || byKindThenName(a, b)));
}

/** `1.5 KB`, `5 MB`. */
export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u++;
  }
  return `${u ? Number(n.toFixed(n < 10 ? 1 : 0)) : n} ${units[u]}`;
}

/** Deleted entries kept in memory to be put back. */
interface Removed {
  dirs: string[];
  files: { path: string; data: Blob }[];
  count: number;
}

/** Larger deletions are not kept for undo. */
const UNDO_LIMIT = 64 * 1024 * 1024;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(e, rest);
  if (dataset) Object.assign(e.dataset, dataset);
  e.append(...kids);
  return e;
};

const DRAG_TYPE = 'application/x-fs-path';

export class Explorer {
  readonly element: HTMLElement;
  private readonly tree: HTMLElement;
  private readonly toolbar: HTMLElement;
  private readonly undoBar: HTMLElement;
  private readonly strings: ExplorerStrings;
  private readonly expanded = new Set<string>(['']);
  /** The entry the toolbar acts on (the last one clicked). */
  private selected: Entry | undefined;
  /** Every selected entry, by path (FOLDER-011). */
  private readonly chosen = new Map<string, Entry>();
  private current: string | undefined;
  private sort: SortKey;
  private removed: Removed | undefined;
  /** A focus coming from a click: the click selects. */
  private pointer = false;
  /** A focus moved by the keyboard keeping the selection. */
  private keep = false;
  private readonly picker: HTMLInputElement;
  /** Entries copied or cut, to paste (FOLDER-012). */
  private clip: { cut: boolean; entries: Entry[] } | undefined;
  private menu: HTMLElement | undefined;

  constructor(private readonly opts: ExplorerOptions) {
    this.strings = { ...DEFAULT_STRINGS, ...opts.strings };
    this.sort = opts.sort ?? 'name';
    const writable = opts.provider.capabilities.write;
    const tool = (label: string, text: string, fn: () => void): HTMLButtonElement => {
      const b = el('button', { type: 'button', title: label, textContent: text, className: 'fs-tool' });
      b.setAttribute('aria-label', label);
      b.addEventListener('click', fn);
      return b;
    };
    this.picker = el('input', { type: 'file', multiple: true, hidden: true });
    this.picker.addEventListener('change', () => {
      const files = [...(this.picker.files ?? [])];
      this.picker.value = '';
      if (files.length) void this.importFiles(files);
    });
    const sort = el('select', { className: 'fs-sort', title: this.strings.sortBy });
    sort.setAttribute('aria-label', this.strings.sortBy);
    for (const key of ['name', 'date', 'size', 'type'] as SortKey[]) sort.append(el('option', { value: key, textContent: this.strings.sortNames[key], selected: key === this.sort }));
    sort.addEventListener('change', () => {
      this.sort = sort.value as SortKey;
      this.opts.onSort?.(this.sort);
      void this.refresh();
    });
    this.toolbar = el(
      'div',
      { className: 'fs-toolbar' },
      ...(writable
        ? [
            tool(this.strings.newFile, '＋', () => void this.createFile()),
            ...(this.opts.newFiles ?? []).slice(1).flatMap((kind) => (kind.icon ? [tool(kind.label, kind.icon, () => void this.createFile(kind))] : [])),
            tool(this.strings.newFolder, '📁＋', () => void this.createFolder()),
            tool(this.strings.importFiles, '📥', () => this.picker.click()),
            tool(this.strings.rename, '✎', () => void this.renameSelected()),
            tool(this.strings.remove, '🗑', () => void this.removeSelected()),
          ]
        : [el('span', { className: 'fs-readonly', textContent: this.strings.readOnly })]),
      tool(this.strings.refresh, '↻', () => void this.refresh()),
      tool(this.strings.collapseAll, '⊟', () => void this.collapseAll()),
      tool(this.strings.showCurrent, '◎', () => void this.revealCurrent()),
      sort,
      this.picker,
    );
    this.toolbar.setAttribute('role', 'toolbar');
    this.toolbar.setAttribute('aria-label', this.strings.tree);
    this.undoBar = el('div', { className: 'fs-undo', hidden: true });
    this.undoBar.setAttribute('role', 'status');
    this.tree = el('nav', { className: 'fs-tree' });
    this.tree.setAttribute('aria-label', this.strings.tree);
    this.tree.addEventListener('keydown', (e) => this.onKey(e));
    this.tree.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const row = (e.target as HTMLElement).closest<HTMLElement>('.fs-entry');
      if (row && !this.chosen.has(row.dataset.path!)) this.select(this.entryOf(row));
      if (!row) {
        this.chosen.clear();
        this.selected = undefined;
        this.paint();
      }
      this.openMenu(e.clientX, e.clientY, row ?? this.tree);
    });
    if (writable) this.dropZone();
    this.element = el('div', { className: 'fs-explorer' }, this.toolbar, this.undoBar, this.tree);
  }

  get provider(): StorageProvider {
    return this.opts.provider;
  }

  /** Paths of the selected entries, in tree order. */
  selection(): string[] {
    const order = this.rows().map((r) => r.dataset.path!);
    return [...this.chosen.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  private visible(e: Entry): boolean {
    return this.opts.filter ? this.opts.filter(e) : !e.name.startsWith('.');
  }

  /** Reload the tree, keeping open folders open. */
  async refresh(): Promise<void> {
    try {
      this.tree.replaceChildren(this.opts.root === undefined ? await this.renderDir('') : await this.renderRoot(this.opts.root));
    } catch (err) {
      this.fail(err);
    }
  }

  /** Mark the entry being edited by the host. */
  setCurrent(path: string | undefined): void {
    this.current = path;
    // The open entry is also the one the toolbar acts on.
    // A selection already holding it is kept (the document opens after a Ctrl+click elsewhere).
    if (path && !this.chosen.has(path)) {
      this.selected = { name: basename(path), path, kind: 'file' };
      this.chosen.clear();
      this.chosen.set(path, this.selected);
    }
    for (const b of this.rows()) {
      if (b.dataset.path === path) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    this.paint();
  }

  /** Close every folder (FOLDER-016). */
  async collapseAll(): Promise<void> {
    this.expanded.clear();
    this.expanded.add('');
    await this.refresh();
  }

  /** Open the folders leading to the open document and bring it into view (FOLDER-016). */
  async revealCurrent(): Promise<void> {
    if (!this.current) return;
    await this.reveal(this.current);
    const row = this.row(this.current);
    row?.scrollIntoView?.({ block: 'nearest' });
    row?.focus();
  }

  /** Open the folders leading to `path`. */
  async reveal(path: string): Promise<void> {
    for (let d = dirname(path); d; d = dirname(d)) this.expanded.add(d);
    await this.refresh();
  }

  private rows(): HTMLButtonElement[] {
    return [...this.tree.querySelectorAll<HTMLButtonElement>('.fs-entry')];
  }

  private row(path: string): HTMLButtonElement | undefined {
    return this.rows().find((r) => r.dataset.path === path);
  }

  private entryOf(row: HTMLElement): Entry {
    const path = row.dataset.path!;
    return { name: path ? basename(path) : (this.opts.root ?? ''), path, kind: row.classList.contains('fs-directory') ? 'directory' : 'file' };
  }

  /** FOLDER-032: the folder itself, holding the tree; it can be folded, selected and given actions, never renamed, moved or deleted. */
  private async renderRoot(name: string): Promise<HTMLElement> {
    const list = el('ul', { className: 'fs-list' });
    list.setAttribute('role', 'list');
    const entry: Entry = { name, path: '', kind: 'directory' };
    const row = el('button', { type: 'button', className: 'fs-entry fs-directory fs-root', title: name, dataset: { path: '', icon: this.opts.icon?.(entry) ?? '📁' } }, el('span', { className: 'fs-name', textContent: name }));
    if (this.chosen.has('')) row.classList.add('fs-selected');
    row.addEventListener('mousedown', () => {
      this.pointer = true;
    });
    row.addEventListener('focus', () => {
      if (this.pointer) this.pointer = false;
      else if (this.keep) this.keep = false;
      else this.select(entry);
    });
    row.addEventListener('click', (ev) => {
      this.pointer = false;
      if (ev.ctrlKey || ev.metaKey) return this.toggleChosen(entry);
      this.select(entry);
      void this.toggle(entry, row);
    });
    const open = this.expanded.has('');
    row.setAttribute('aria-expanded', String(open));
    const li = el('li', {}, row);
    if (open) li.append(await this.renderDir(''));
    list.append(li);
    return list;
  }

  private async renderDir(path: string): Promise<HTMLElement> {
    const entries = sortEntries((await this.opts.provider.list(path)).filter((e) => this.visible(e)), this.sort);
    const list = el('ul', { className: 'fs-list' });
    list.setAttribute('role', 'list');
    if (!entries.length && !path) list.append(el('li', { className: 'fs-empty', textContent: this.strings.empty }));
    for (const e of entries) list.append(await this.renderEntry(e));
    return list;
  }

  private meta(e: Entry): string {
    if (e.kind !== 'file') return '';
    const parts: string[] = [];
    if (e.size !== undefined) parts.push(formatSize(e.size));
    if (e.lastModified) {
      const d = new Date(e.lastModified);
      const sameYear = d.getFullYear() === new Date().getFullYear();
      parts.push(d.toLocaleDateString(this.opts.locale ?? (document.documentElement.lang || undefined), sameYear ? { day: 'numeric', month: 'short' } : { year: 'numeric', month: 'short' }));
    }
    return parts.join(' · ');
  }

  private async renderEntry(e: Entry): Promise<HTMLElement> {
    const icon = this.opts.icon?.(e) ?? (e.kind === 'directory' ? '📁' : '📄');
    const meta = this.meta(e);
    const full = e.lastModified ? new Date(e.lastModified).toLocaleString(this.opts.locale ?? (document.documentElement.lang || undefined)) : '';
    const title = [e.path, e.size !== undefined && e.kind === 'file' ? formatSize(e.size) : '', full].filter(Boolean).join('\n');
    const row = el('button', { type: 'button', className: `fs-entry fs-${e.kind}`, title, dataset: { path: e.path, icon, ...(meta ? { meta } : {}) } }, el('span', { className: 'fs-name', textContent: e.name }));
    if (e.path === this.current) row.setAttribute('aria-current', 'page');
    if (this.chosen.has(e.path)) row.classList.add('fs-selected');
    row.addEventListener('mousedown', () => {
      this.pointer = true;
    });
    row.addEventListener('focus', () => {
      if (this.pointer) this.pointer = false;
      else if (this.keep) this.keep = false;
      else this.select(e);
    });
    row.addEventListener('click', (ev) => {
      this.pointer = false;
      if (ev.ctrlKey || ev.metaKey) return this.toggleChosen(e);
      if (ev.shiftKey) return this.extendTo(e);
      this.select(e);
      if (e.kind === 'file') this.opts.onOpen(e);
      else void this.toggle(e, row);
    });
    if (this.opts.provider.capabilities.write) {
      row.draggable = true;
      row.addEventListener('dragstart', (ev) => {
        // Dragging a selected entry drags the whole selection.
        const paths = this.chosen.has(e.path) ? this.selection() : [e.path];
        ev.dataTransfer?.setData(DRAG_TYPE, paths.join('\n'));
        ev.dataTransfer?.setData('text/plain', paths.join('\n'));
      });
    }
    const li = el('li', {}, row);
    if (e.kind === 'directory') {
      const open = this.expanded.has(e.path);
      row.setAttribute('aria-expanded', String(open));
      if (open) li.append(await this.renderDir(e.path));
    }
    return li;
  }

  private paint(): void {
    for (const r of this.rows()) r.classList.toggle('fs-selected', this.chosen.has(r.dataset.path!));
  }

  private select(e: Entry): void {
    this.selected = e;
    this.chosen.clear();
    this.chosen.set(e.path, e);
    this.paint();
  }

  private toggleChosen(e: Entry): void {
    if (this.chosen.has(e.path)) {
      this.chosen.delete(e.path);
      if (this.selected?.path === e.path) this.selected = [...this.chosen.values()].pop();
    } else {
      this.chosen.set(e.path, e);
      this.selected = e;
    }
    this.paint();
  }

  /** Select every row from the last selected one to `e`. */
  private extendTo(e: Entry): void {
    const rows = this.rows();
    const from = rows.findIndex((r) => r.dataset.path === this.selected?.path);
    const to = rows.findIndex((r) => r.dataset.path === e.path);
    if (from < 0 || to < 0) return this.select(e);
    this.chosen.clear();
    for (const r of rows.slice(Math.min(from, to), Math.max(from, to) + 1)) {
      const x = this.entryOf(r);
      this.chosen.set(x.path, x);
    }
    this.paint();
  }

  private async toggle(e: Entry, row: HTMLElement, open = !this.expanded.has(e.path)): Promise<void> {
    const li = row.parentElement!;
    if (!open) {
      this.expanded.delete(e.path);
      li.querySelector(':scope > ul')?.remove();
      row.setAttribute('aria-expanded', 'false');
    } else if (!this.expanded.has(e.path) || !li.querySelector(':scope > ul')) {
      this.expanded.add(e.path);
      row.setAttribute('aria-expanded', 'true');
      try {
        li.append(await this.renderDir(e.path));
        this.paint();
      } catch (err) {
        this.fail(err);
      }
    }
  }

  /** Arrows, Home and End move; Right and Left open and close folders (FOLDER-009). */
  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT') return;
    const rows = this.rows();
    const row = target.closest<HTMLButtonElement>('.fs-entry');
    const at = row ? rows.indexOf(row) : -1;
    const writable = this.opts.provider.capabilities.write;
    const ctrl = e.ctrlKey || e.metaKey;
    const go = (i: number): void => {
      const to = rows[Math.max(0, Math.min(rows.length - 1, i))];
      if (!to) return;
      e.preventDefault();
      if (e.shiftKey && row) {
        this.keep = true;
        to.focus();
        const x = this.entryOf(to);
        this.chosen.set(x.path, x);
        this.selected = x;
        this.paint();
      } else to.focus();
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(rows.length - 1);
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && row) {
      e.preventDefault();
      const entry = this.entryOf(row);
      const open = row.getAttribute('aria-expanded') === 'true';
      if (e.key === 'ArrowRight') {
        if (entry.kind !== 'directory') return;
        if (!open) void this.toggle(entry, row, true);
        else row.parentElement?.querySelector<HTMLElement>(':scope > ul .fs-entry')?.focus();
      } else if (entry.kind === 'directory' && open) void this.toggle(entry, row, false);
      else row.parentElement?.parentElement?.closest('li')?.querySelector<HTMLElement>(':scope > .fs-entry')?.focus();
    } else if (ctrl && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      for (const r of rows) {
        const x = this.entryOf(r);
        this.chosen.set(x.path, x);
      }
      this.paint();
    } else if (ctrl && e.key.toLowerCase() === 'z' && this.removed) {
      e.preventDefault();
      void this.undoRemove();
    } else if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      e.preventDefault();
      const r = (row ?? this.tree).getBoundingClientRect();
      this.openMenu(r.left + 16, r.bottom, row ?? this.tree);
    } else if (ctrl && e.key.toLowerCase() === 'c' && this.chosen.size) {
      e.preventDefault();
      this.copySelection();
    } else if (writable && ctrl && e.key.toLowerCase() === 'x' && this.chosen.size) {
      e.preventDefault();
      this.cutSelection();
    } else if (writable && ctrl && e.key.toLowerCase() === 'v' && this.clip) {
      e.preventDefault();
      void this.paste();
    } else if (writable && e.key === 'F2') {
      e.preventDefault();
      void this.renameSelected();
    } else if (writable && e.key === 'Delete') {
      e.preventDefault();
      void this.removeSelected();
    }
  }

  /** Entries dragged inside the tree are moved; files of the device are imported (FOLDER-010). */
  private dropZone(): void {
    const dirAt = (ev: DragEvent): { dir: string; mark: HTMLElement } => {
      const row = (ev.target as HTMLElement).closest<HTMLElement>('.fs-entry');
      if (!row) return { dir: '', mark: this.tree };
      if (row.classList.contains('fs-directory')) return { dir: row.dataset.path!, mark: row };
      const dir = dirname(row.dataset.path!);
      return { dir, mark: (dir && this.row(dir)) || this.tree };
    };
    const unmark = (): void => {
      for (const m of [this.tree, ...this.tree.querySelectorAll('.fs-drop')]) m.classList.remove('fs-drop');
    };
    this.tree.addEventListener('dragover', (ev) => {
      const types = ev.dataTransfer?.types ?? [];
      if (!types.includes(DRAG_TYPE) && !types.includes('Files')) return;
      ev.preventDefault();
      unmark();
      dirAt(ev).mark.classList.add('fs-drop');
    });
    this.tree.addEventListener('dragleave', (ev) => {
      if (!this.tree.contains(ev.relatedTarget as Node)) unmark();
    });
    this.tree.addEventListener('drop', (ev) => {
      unmark();
      const { dir } = dirAt(ev);
      const moved = ev.dataTransfer?.getData(DRAG_TYPE);
      if (moved) {
        ev.preventDefault();
        void this.moveAll(moved.split('\n').filter(Boolean), dir);
        return;
      }
      const items = [...(ev.dataTransfer?.items ?? [])];
      const files = [...(ev.dataTransfer?.files ?? [])];
      if (!files.length) return;
      ev.preventDefault();
      // Folders dropped from the desktop are imported with their contents where the browser allows it.
      const entries = items.map((i) => (i.kind === 'file' && 'webkitGetAsEntry' in i ? i.webkitGetAsEntry() : null));
      if (entries.length && entries.every(Boolean)) void this.importEntries(entries as FileSystemEntry[], dir);
      else void this.importFiles(files, dir);
    });
  }

  /** The folder new entries go to: the selected folder, or the selected file's folder. */
  private targetDir(): string {
    const s = this.selected;
    if (!s) return '';
    return s.kind === 'directory' ? s.path : dirname(s.path);
  }

  private prompt(message: string, value: string): Promise<string | null> {
    return this.opts.prompt ? this.opts.prompt(message, value) : Promise.resolve(window.prompt(message, value));
  }

  private confirm(message: string): Promise<boolean> {
    return this.opts.confirm ? this.opts.confirm(message) : Promise.resolve(window.confirm(message));
  }

  private fail(err: unknown): void {
    const message = this.strings.error(err instanceof Error ? err.message : String(err));
    if (this.opts.onError) this.opts.onError(message);
    else console.error(message);
  }

  private async changed(...changes: ExplorerChange[]): Promise<void> {
    const last = changes[changes.length - 1];
    if (last && last.type !== 'remove') await this.reveal(last.to ?? last.path);
    else await this.refresh();
    for (const change of changes) await this.opts.onChange?.(change);
  }

  async createFile(kind: NewFileKind = this.opts.newFiles?.[0] ?? { label: this.strings.newFile, name: 'Untitled.txt', content: () => new Blob([]) }): Promise<Entry | undefined> {
    const dir = this.targetDir();
    const name = await this.prompt(this.strings.namePrompt, await freeName(this.provider, dir, typeof kind.name === 'function' ? kind.name() : kind.name));
    if (!name) return undefined;
    try {
      const path = join(dir, checkName(name));
      if ((await this.provider.list(dir)).some((e) => e.name.toLowerCase() === basename(path).toLowerCase())) throw new FsError('Exists', path, `“${basename(path)}” already exists.`);
      await this.provider.write(path, await kind.content(basename(path)));
      const entry: Entry = { name: basename(path), path, kind: 'file' };
      this.select(entry);
      await this.changed({ type: 'create', path, kind: 'file' });
      this.opts.onOpen(entry);
      return entry;
    } catch (err) {
      this.fail(err);
      return undefined;
    }
  }

  async createFolder(): Promise<void> {
    const dir = this.targetDir();
    const name = await this.prompt(this.strings.namePrompt, await freeName(this.provider, dir, this.strings.folderName));
    if (!name) return;
    try {
      const path = join(dir, checkName(name));
      await this.provider.mkdir(path);
      this.expanded.add(path);
      this.select({ name: basename(path), path, kind: 'directory' });
      await this.changed({ type: 'create', path, kind: 'directory' });
    } catch (err) {
      this.fail(err);
    }
  }

  /** Copy files of the device into `dir` (default: the selected folder), renaming those whose name is taken. */
  async importFiles(files: File[], dir = this.targetDir()): Promise<string[]> {
    const done: string[] = [];
    try {
      for (const file of files) {
        const path = join(dir, await freeName(this.provider, dir, checkName(file.name)));
        await this.provider.write(path, file);
        done.push(path);
      }
    } catch (err) {
      this.fail(err);
    }
    if (dir) this.expanded.add(dir);
    if (done.length) await this.changed(...done.map((path): ExplorerChange => ({ type: 'create', path, kind: 'file' })));
    return done;
  }

  /** Import files and folders dropped from the desktop. */
  private async importEntries(entries: FileSystemEntry[], dir: string): Promise<void> {
    const files: { path: string; file: File }[] = [];
    const visit = async (entry: FileSystemEntry, base: string): Promise<void> => {
      if (entry.isFile) {
        const file = await new Promise<File>((ok, ko) => (entry as FileSystemFileEntry).file(ok, ko));
        files.push({ path: join(base, entry.name), file });
        return;
      }
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // A directory is read in batches until an empty one.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((ok, ko) => reader.readEntries(ok, ko));
        if (!batch.length) break;
        for (const child of batch) await visit(child, join(base, entry.name));
      }
    };
    try {
      const tops: string[] = [];
      for (const entry of entries) {
        // A dropped folder whose name is taken gets a free one; its contents keep theirs.
        const name = await freeName(this.provider, dir, checkName(entry.name));
        tops.push(name);
        const start = files.length;
        await visit(entry, '');
        for (const f of files.slice(start)) f.path = join(dir, name, f.path.split('/').slice(1).join('/'));
        if (entry.isDirectory) await this.provider.mkdir(join(dir, name));
      }
      for (const f of files) await this.provider.write(f.path, f.file);
      if (dir) this.expanded.add(dir);
      await this.changed(...tops.map((name, i): ExplorerChange => ({ type: 'create', path: join(dir, name), kind: entries[i]!.isDirectory ? 'directory' : 'file' })));
    } catch (err) {
      this.fail(err);
    }
  }

  async renameSelected(): Promise<void> {
    const s = this.selected;
    if (!s?.path) return;
    const name = await this.prompt(this.strings.namePrompt, s.name);
    if (!name || name === s.name) return;
    try {
      const to = join(dirname(s.path), checkName(name));
      await this.provider.move(s.path, to);
      this.rebaseExpanded(s.path, to);
      this.select({ ...s, name: basename(to), path: to });
      await this.changed({ type: 'rename', path: s.path, to, kind: s.kind });
    } catch (err) {
      this.fail(err);
    }
  }

  async moveInto(from: string, dir: string): Promise<void> {
    await this.moveAll([from], dir);
  }

  /** Move the selected entries into `dir`. */
  async moveSelectionInto(dir: string): Promise<void> {
    await this.moveAll(this.selection(), dir);
  }

  private async moveAll(paths: string[], dir: string): Promise<void> {
    const changes: ExplorerChange[] = [];
    try {
      for (const from of topmost(paths)) {
        const to = join(dir, basename(from));
        if (to === from || dirname(from) === dir) continue;
        if (isInside(dir, from)) throw new FsError('Invalid', to, `Cannot move ${from} into itself`);
        const kind = (await this.provider.list(dirname(from))).find((e) => e.path === from)?.kind ?? 'file';
        await this.provider.move(from, to);
        this.rebaseExpanded(from, to);
        changes.push({ type: 'move', path: from, to, kind });
      }
    } catch (err) {
      this.fail(err);
    }
    if (!changes.length) return;
    this.expanded.add(dir);
    this.chosen.clear();
    for (const c of changes) this.chosen.set(c.to!, { name: basename(c.to!), path: c.to!, kind: c.kind });
    await this.changed(...changes);
  }

  async removeSelected(): Promise<void> {
    // The folder itself is never deleted (FOLDER-032).
    const targets = topmost((this.selection().length ? this.selection() : this.selected ? [this.selected.path] : []).filter(Boolean)).map((p) => this.chosen.get(p) ?? this.selected!);
    if (!targets.length) return;
    // What would be deleted, to put it back (FOLDER-011).
    let size = 0;
    for (const t of targets) {
      if (t.kind === 'file') size += (await this.sizeOf(t.path)) ?? 0;
      else for await (const f of walk(this.provider, t.path, { skip: () => false })) size += f.size ?? 0;
    }
    const undoable = size <= UNDO_LIMIT;
    const [first] = targets;
    const question = targets.length === 1 ? this.strings.confirmRemove(first!.name, first!.kind === 'directory') : this.strings.confirmRemoveMany(targets.length);
    if (!(await this.confirm(undoable ? question : `${question} ${this.strings.noUndo}`))) return;
    const removed: Removed = { dirs: [], files: [], count: targets.length };
    const changes: ExplorerChange[] = [];
    try {
      for (const t of targets) {
        if (undoable) await this.keepCopy(t, removed);
        await this.provider.remove(t.path, { recursive: true });
        changes.push({ type: 'remove', path: t.path, kind: t.kind });
      }
    } catch (err) {
      this.fail(err);
    }
    this.selected = undefined;
    this.chosen.clear();
    if (undoable && changes.length) this.offerUndo(removed);
    if (changes.length) await this.changed(...changes);
  }

  private async sizeOf(path: string): Promise<number | undefined> {
    return (await this.provider.list(dirname(path))).find((e) => e.path === path)?.size;
  }

  private async keepCopy(entry: Entry, into: Removed): Promise<void> {
    // The bytes are copied: a file of the device can no longer be read once deleted.
    const keep = async (path: string): Promise<void> => {
      into.files.push({ path, data: new Blob([await (await this.provider.read(path)).arrayBuffer()]) });
    };
    if (entry.kind === 'file') return keep(entry.path);
    const visit = async (dir: string): Promise<void> => {
      into.dirs.push(dir);
      for (const e of await this.provider.list(dir)) {
        if (e.kind === 'directory') await visit(e.path);
        else await keep(e.path);
      }
    };
    await visit(entry.path);
  }

  private offerUndo(removed: Removed): void {
    this.removed = removed;
    const undo = el('button', { type: 'button', className: 'fs-undo-button', textContent: this.strings.undo });
    undo.addEventListener('click', () => void this.undoRemove());
    const close = el('button', { type: 'button', className: 'fs-undo-close', textContent: '✕', title: '✕' });
    close.setAttribute('aria-label', '✕');
    close.addEventListener('click', () => this.dropUndo());
    this.undoBar.replaceChildren(el('span', { textContent: this.strings.deleted(removed.count) }), undo, close);
    this.undoBar.hidden = false;
  }

  private dropUndo(): void {
    this.removed = undefined;
    this.undoBar.hidden = true;
    this.undoBar.replaceChildren();
  }

  /** Put back the entries deleted last. */
  async undoRemove(): Promise<void> {
    const removed = this.removed;
    if (!removed) return;
    this.dropUndo();
    const changes: ExplorerChange[] = [];
    try {
      for (const d of removed.dirs) {
        await this.provider.mkdir(d);
        if (!removed.dirs.includes(dirname(d))) changes.push({ type: 'create', path: d, kind: 'directory' });
      }
      for (const f of removed.files) {
        await this.provider.write(f.path, f.data);
        if (!removed.dirs.includes(dirname(f.path))) changes.push({ type: 'create', path: f.path, kind: 'file' });
      }
    } catch (err) {
      this.fail(err);
    }
    if (changes.length) await this.changed(...changes);
  }

  /** The selected entries, without those inside another selected folder. */
  private targets(): Entry[] {
    const paths = this.selection().length ? this.selection() : this.selected ? [this.selected.path] : [];
    return topmost(paths).map((p) => this.chosen.get(p) ?? this.selected!);
  }

  copySelection(): void {
    const entries = this.targets().filter((e) => e.path);
    if (entries.length) this.clip = { cut: false, entries };
  }

  cutSelection(): void {
    const entries = this.targets().filter((e) => e.path);
    if (entries.length && this.provider.capabilities.write) this.clip = { cut: true, entries };
  }

  /** Paste what was copied or cut into `dir` (default: the selected folder); taken names get a number. */
  async paste(dir = this.targetDir()): Promise<void> {
    const clip = this.clip;
    if (!clip) return;
    const changes: ExplorerChange[] = [];
    try {
      for (const e of clip.entries) {
        if (clip.cut && dirname(e.path) === dir) continue;
        if (isInside(dir, e.path)) throw new FsError('Invalid', dir, `Cannot put ${e.path} into itself`);
        const to = join(dir, await freeName(this.provider, dir, e.name));
        if (clip.cut) {
          await this.provider.move(e.path, to);
          this.rebaseExpanded(e.path, to);
          changes.push({ type: 'move', path: e.path, to, kind: e.kind });
        } else {
          await copy(this.provider, e.path, this.provider, to);
          changes.push({ type: 'create', path: to, kind: e.kind });
        }
      }
    } catch (err) {
      this.fail(err);
    }
    // What was cut is pasted once; a copy can be pasted again.
    if (clip.cut) this.clip = undefined;
    if (dir) this.expanded.add(dir);
    if (changes.length) await this.changed(...changes);
  }

  /** A copy of each selected entry next to it (`name 2.ext`). */
  async duplicateSelection(): Promise<void> {
    const changes: ExplorerChange[] = [];
    try {
      for (const e of this.targets().filter((x) => x.path)) {
        const dir = dirname(e.path);
        const to = join(dir, await freeName(this.provider, dir, e.name));
        await copy(this.provider, e.path, this.provider, to);
        changes.push({ type: 'create', path: to, kind: e.kind });
      }
    } catch (err) {
      this.fail(err);
    }
    if (changes.length) await this.changed(...changes);
  }

  async downloadSelection(): Promise<void> {
    const entries = this.targets();
    if (!entries.length || !this.opts.download) return;
    try {
      await this.opts.download(entries);
    } catch (err) {
      this.fail(err);
    }
  }

  private async copyPath(): Promise<void> {
    const text = this.targets().map((e) => e.path).join('\n');
    try {
      if (this.opts.copyText) await this.opts.copyText(text);
      else await navigator.clipboard.writeText(text);
    } catch (err) {
      this.fail(err);
    }
  }

  /** The actions for the selection (or for the folder, on empty space), as a menu at (x, y) (FOLDER-013). */
  private openMenu(x: number, y: number, origin: HTMLElement): void {
    this.closeMenu();
    const doc = this.element.ownerDocument;
    const writable = this.provider.capabilities.write;
    const entries = this.targets();
    const one = entries.length === 1 ? entries[0] : undefined;
    const items: [string, () => unknown][] = [];
    if (one) items.push([this.strings.open, () => (one.kind === 'file' ? this.opts.onOpen(one) : this.row(one.path) && this.toggle(one, this.row(one.path)!, true))]);
    if (writable && (!entries.length || one?.kind === 'directory')) {
      items.push(
        [this.strings.newFile, () => this.createFile()],
        ...(this.opts.newFiles ?? []).slice(1).map((kind): [string, () => unknown] => [kind.label, () => this.createFile(kind)]),
        [this.strings.newFolder, () => this.createFolder()],
        [this.strings.importFiles, () => this.picker.click()],
      );
    }
    // The folder itself (FOLDER-032) is not renamed, copied, moved or deleted.
    const movable = entries.length > 0 && entries.every((e) => e.path);
    if (movable) {
      if (writable && one) items.push([this.strings.rename, () => this.renameSelected()]);
      if (writable) items.push([this.strings.duplicate, () => this.duplicateSelection()]);
      items.push([this.strings.copy, () => this.copySelection()]);
      if (writable) items.push([this.strings.cut, () => this.cutSelection()]);
    }
    if (writable && this.clip) items.push([this.strings.paste, () => this.paste()]);
    if (entries.length) {
      if (this.opts.download) items.push([this.strings.download, () => this.downloadSelection()]);
      if (movable) items.push([this.strings.copyPath, () => this.copyPath()]);
      if (writable && movable) items.push([this.strings.remove, () => this.removeSelected()]);
    }
    items.push(...(this.opts.actions?.(entries.length ? entries : [{ name: this.opts.root ?? '', path: '', kind: 'directory' }]) ?? []));
    const menu = el('div', { className: 'fs-menu' });
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', this.strings.menu);
    const buttons = items.map(([label, run]) => {
      const b = el('button', { type: 'button', className: 'fs-menu-item', textContent: label });
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => {
        this.closeMenu(origin);
        void run();
      });
      return b;
    });
    menu.append(...buttons);
    menu.addEventListener('keydown', (e) => {
      const at = buttons.indexOf(doc.activeElement as HTMLButtonElement);
      const go = (i: number): void => {
        e.preventDefault();
        buttons[(i + buttons.length) % buttons.length]?.focus();
      };
      if (e.key === 'ArrowDown') go(at + 1);
      else if (e.key === 'ArrowUp') go(at - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(buttons.length - 1);
      else if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        this.closeMenu(origin);
      }
    });
    menu.style.left = `${Math.max(0, x)}px`;
    menu.style.top = `${Math.max(0, y)}px`;
    doc.body.append(menu);
    this.menu = menu;
    // Kept inside the window.
    const r = menu.getBoundingClientRect();
    const view = doc.defaultView;
    if (view && r.right > view.innerWidth) menu.style.left = `${Math.max(0, view.innerWidth - r.width - 4)}px`;
    if (view && r.bottom > view.innerHeight) menu.style.top = `${Math.max(0, view.innerHeight - r.height - 4)}px`;
    const away = (e: Event): void => {
      if (!menu.contains(e.target as Node)) this.closeMenu();
    };
    setTimeout(() => doc.addEventListener('mousedown', away, { capture: true }), 0);
    this.menuAway = () => doc.removeEventListener('mousedown', away, { capture: true });
    buttons[0]?.focus();
  }

  private menuAway: (() => void) | undefined;

  private closeMenu(focus?: HTMLElement): void {
    this.menuAway?.();
    this.menuAway = undefined;
    this.menu?.remove();
    this.menu = undefined;
    if (focus?.isConnected) focus.focus();
  }

  private rebaseExpanded(from: string, to: string): void {
    for (const d of [...this.expanded]) {
      if (d && isInside(d, from)) {
        this.expanded.delete(d);
        this.expanded.add(to + d.slice(from.length));
      }
    }
  }
}

/** The paths not inside another one of the list. */
const topmost = (paths: string[]): string[] => paths.filter((p) => !paths.some((q) => q !== p && isInside(p, q)));
