/**
 * Folders of linked Markdown notes (FOLDER-005): names, aliases, backlinks,
 * and links kept up to date when a note is renamed — on the index of the
 * notes (FOLDER-025), so that a folder of thousands of notes stays quick.
 */
import { readText, relative, resolve, walk, type Entry, type StorageProvider } from '../fs';
import { noteName, renameWikiLinks } from '../document/wiki-links';
import { renameTag } from './tags';
import { NoteIndex } from './note-index';

export const isNote = (path: string): boolean => /\.(md|markdown)$/i.test(path);

export class NoteVault {
  readonly index: NoteIndex;
  private ready: Promise<void> | undefined;
  /** The files of the folder as the panel listed them, for the next reading. */
  private listing: Entry[] | undefined;

  constructor(private readonly provider: StorageProvider) {
    this.index = new NoteIndex(provider);
  }

  /**
   * Bring the index up to date with the folder (only the notes changed since
   * are read); `progress` tells how far the reading is.
   */
  sync(progress?: (done: number, total: number) => void, entries = this.listing): Promise<void> {
    this.ready = (async () => {
      const notes: { path: string; size?: number; modified?: number }[] = [];
      const add = (e: Entry): void => {
        if (e.kind === 'file' && isNote(e.path)) notes.push({ path: e.path, ...(e.size !== undefined ? { size: e.size } : {}), ...(e.lastModified !== undefined ? { modified: e.lastModified } : {}) });
      };
      // The files listed by the caller, or listed here.
      if (entries) entries.forEach(add);
      else for await (const e of walk(this.provider, '', { maxDepth: 32, maxEntries: 100_000 })) add(e);
      await this.index.update(notes, progress);
    })();
    return this.ready;
  }

  /**
   * The files of the folder, listed again: read from them when next needed —
   * a folder of a server (a repository, WebDAV) is read only then, not each
   * of its notes as soon as it is opened.
   */
  listed(entries: Entry[]): void {
    this.listing = entries;
    if (!this.started) this.ready = undefined;
  }

  /** Whether the notes were read once (then kept up to date at once). */
  get started(): boolean {
    return this.ready !== undefined;
  }

  /** The index as last brought up to date (brought up to date first, the first time). */
  async indexed(): Promise<NoteIndex> {
    await (this.ready ?? this.sync());
    return this.index;
  }

  /** A note was saved or changed here: read it again. */
  async changed(path: string): Promise<void> {
    if (isNote(path)) await this.index.refresh(path);
  }

  async text(path: string): Promise<string> {
    return readText(this.provider, path).catch(() => '');
  }

  /** The note a `[[target]]` written in `from` points to. */
  async resolve(target: string, from: string): Promise<string | undefined> {
    return (await this.indexed()).resolve(target, from);
  }

  /** Notes that link to `path`, with the words around the link. */
  async backlinks(path: string): Promise<{ from: string; context: string }[]> {
    return (await this.indexed()).backlinks(path);
  }

  /** Notes of each tag, the most used first (FOLDER-017). */
  async tags(): Promise<Map<string, string[]>> {
    return (await this.indexed()).tags();
  }

  /** Rename a tag in the notes holding it; returns the notes changed. */
  async renameTag(from: string, to: string): Promise<string[]> {
    const index = await this.indexed();
    const changed: string[] = [];
    for (const n of index.notesWithTag(from)) {
      const { text, count } = renameTag(await this.text(n), from, to);
      if (!count) continue;
      await this.provider.write(n, new Blob([text]));
      await index.refresh(n);
      changed.push(n);
    }
    return changed;
  }

  /** Notes related to `path` (FOLDER-019). */
  async related(path: string, max = 10): Promise<{ path: string; tags: string[]; linked: boolean }[]> {
    return (await this.indexed()).related(path, max);
  }

  /** Links between the notes, each once (FOLDER-018). */
  async links(): Promise<{ from: string; to: string }[]> {
    return (await this.indexed()).links();
  }

  /**
   * After `from` was renamed to `to`: rewrite the wiki links naming it in the
   * notes writing them; returns the notes changed (`skip` is left alone).
   */
  async renameLinks(from: string, to: string, skip?: string): Promise<string[]> {
    const oldName = noteName(from);
    const newName = noteName(to);
    const index = await this.indexed();
    const changed = new Set<string>();
    if (oldName !== newName) {
      for (const n of index.notesLinkingName(oldName)) {
        if (n === skip) continue;
        const { text, count } = renameWikiLinks(await this.text(n), oldName, newName);
        if (!count) continue;
        await this.provider.write(n, new Blob([text]));
        await index.refresh(n);
        changed.add(n);
      }
    }
    // FOLDER-031: relative Markdown links to the note, encoded or not, follow it.
    const file = from.split('/').pop()!.toLowerCase();
    for (const n of index.notes()) {
      if (n === skip || n === to || n === from) continue;
      const before = await this.text(n).catch(() => '');
      if (!before.toLowerCase().includes(file) && !before.toLowerCase().includes(encodeURI(file).toLowerCase())) continue;
      const { text, count } = renameMarkdownLinks(before, n, from, to);
      if (!count) continue;
      await this.provider.write(n, new Blob([text]));
      await index.refresh(n);
      changed.add(n);
    }
    return [...changed];
  }
}

/**
 * FOLDER-031: the relative Markdown links of the note at `notePath` pointing
 * to `from`, rewritten to point to `to` (encoded as they were written).
 */
export function renameMarkdownLinks(text: string, notePath: string, from: string, to: string): { text: string; count: number } {
  let count = 0;
  const out = text.replace(/(\]\()(<[^>\n]+>|[^)\s]+)((?:\s+"[^"]*")?\))/g, (all, open: string, href: string, close: string) => {
    const angle = href.startsWith('<');
    const raw = angle ? href.slice(1, -1) : href;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#')) return all;
    const hash = raw.indexOf('#');
    const path = hash >= 0 ? raw.slice(0, hash) : raw;
    const sub = hash >= 0 ? raw.slice(hash) : '';
    let decoded = path;
    try {
      decoded = decodeURI(path);
    } catch {
      /* written as it is */
    }
    let target: string;
    try {
      target = resolve(notePath, decoded);
    } catch {
      return all;
    }
    if (target !== from) return all;
    count++;
    const rel = relative(notePath, to);
    const written = angle ? `<${rel}>` : decoded !== path || /\s/.test(rel) ? encodeURI(rel) : rel;
    return `${open}${angle ? written : written}${sub}${close}`;
  });
  return { text: out, count };
}

export { noteName };
