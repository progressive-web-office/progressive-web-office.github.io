/**
 * FOLDER-025: an index of the notes of a folder — names, aliases, tags, links
 * and a few words around each link — built once, in small steps that leave
 * the page responsive, and kept up to date by reading again only the files
 * that changed (by size and date). The texts themselves are not kept: a
 * folder of thousands of notes stays light, and its links are found by name
 * at once instead of searching every note for each link.
 */
import { nearestPath, readText, resolve as resolvePath, type StorageProvider } from '../fs';
import { frontMatterAliases, frontMatterId, noteId, noteName, parseWikiLinks } from '../document/wiki-links';
import { noteTags } from './tags';
import { parseFrontMatter } from '../document/frontmatter';
import { readProperties } from '../document/note-properties';
import type { NoteTables } from '../code/note-tables';

export interface NoteLink {
  /** As written: a wiki link target, or the resolved path of a relative Markdown link. */
  target: string;
  /** A relative Markdown link (already a path), rather than a wiki link. */
  path?: boolean;
  /** The words around the link, for the list of backlinks. */
  context: string;
}

export interface NoteEntry {
  path: string;
  aliases: string[];
  tags: string[];
  links: NoteLink[];
  /** NOTE-002: the properties of its front matter, a list giving one value per item. */
  props: [key: string, pos: number, value: string | number | null][];
  /** NOTE-002: its tasks (`- [ ] …`), with their line. */
  tasks: [line: number, text: string, done: boolean][];
  /** Size and date of the file when read, to read it again only when it changed. */
  size?: number;
  modified?: number;
}

/** Markdown links `[text](relative/path.md)` of a text, with their place. */
const MD_LINK = /\]\(([^)\s]+\.(?:md|markdown))(?:#[^)]*)?\)/gi;

/** A few words around `index`, on one line. */
function around(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf('\n', index) + 1, index - 80);
  const nl = text.indexOf('\n', index + length);
  const end = Math.min(nl < 0 ? text.length : nl, index + length + 80);
  return `${start > 0 && text[start - 1] !== '\n' ? '…' : ''}${text.slice(start, end).trim()}${end < text.length && text[end] !== '\n' ? '…' : ''}`;
}

/** What the index keeps of a note's text. */
export function noteEntry(path: string, text: string): NoteEntry {
  const links: NoteLink[] = [];
  for (const l of parseWikiLinks(text)) if (l.target) links.push({ target: l.target, context: around(text, l.index, l.length) });
  for (const m of text.matchAll(MD_LINK)) {
    let href = m[1]!;
    try {
      href = decodeURI(href);
    } catch {
      /* as written */
    }
    if (!/^[a-z]+:/i.test(href)) links.push({ target: resolvePath(path, href), path: true, context: around(text, m.index!, m[0].length) });
  }
  // FOLDER-024: the identifier of the front matter works as an alias.
  const id = frontMatterId(text);
  return { path, aliases: [...frontMatterAliases(text), ...(id ? [id] : [])], tags: noteTags(text), links, props: noteProps(text), tasks: noteTasks(text) };
}

/** NOTE-002: the values of the front matter, as the tables of the notes hold them. */
function noteProps(text: string): NoteEntry['props'] {
  if (!/^\uFEFF?---/.test(text)) return [];
  const { meta, extra } = parseFrontMatter(text);
  const out: NoteEntry['props'] = [];
  for (const p of readProperties(meta, extra)) {
    if (!p.key) continue;
    const v = p.value;
    if (v.kind === 'list') v.items.forEach((item, i) => out.push([p.key, i, item]));
    else out.push([p.key, 0, v.kind === 'text' || v.kind === 'raw' ? v.text || null : v.kind === 'bool' ? (v.value ? 1 : 0) : v.value]);
  }
  return out;
}

/** NOTE-002: the tasks of a note, out of its code blocks. */
function noteTasks(text: string): NoteEntry['tasks'] {
  const out: NoteEntry['tasks'] = [];
  let fence: string | undefined;
  text.split('\n').forEach((line, i) => {
    const f = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (f && (!fence || f.startsWith(fence))) fence = fence ? undefined : f;
    if (fence || f) return;
    // MD-020: every one-character state (`[ ]`, `[x]`, `[/]`, `[-]`…); only `x` is done.
    const m = /^\s*(?:[-*+]|\d+[.)])\s+\[([^\]\n])\]\s+(.*?)\s*$/.exec(line);
    if (m) out.push([i + 1, m[2]!, m[1] === 'x' || m[1] === 'X']);
  });
  return out;
}

const stemOf = (path: string): string => path.replace(/\.(md|markdown)$/i, '').toLowerCase();

/** Leave the page time to draw and answer, every few milliseconds of work. */
export function yielder(budgetMs = 12): () => Promise<void> {
  let since = performance.now();
  return async () => {
    if (performance.now() - since < budgetMs) return;
    await new Promise((r) => setTimeout(r, 0));
    since = performance.now();
  };
}

export class NoteIndex {
  private readonly entries = new Map<string, NoteEntry>();
  /** Lower-case note name → notes with that name. */
  private byName = new Map<string, string[]>();
  private byAlias = new Map<string, string>();
  private byId = new Map<string, string>();
  /** Resolved links, and links each way (computed again after a change). */
  private graph: { out: Map<string, Set<string>>; in: Map<string, { from: string; context: string }[]>; unresolved: Map<string, { from: string }[]> } | undefined;
  private running: Promise<void> = Promise.resolve();

  private readonly read: (path: string) => Promise<string>;

  constructor(provider: StorageProvider, read?: (path: string) => Promise<string>) {
    this.read = read ?? ((path) => readText(provider, path));
  }

  /** The notes indexed, in path order. */
  notes(): string[] {
    return [...this.entries.keys()];
  }

  entry(path: string): NoteEntry | undefined {
    return this.entries.get(path);
  }

  /**
   * Bring the index to these notes: read the new ones and those whose size or
   * date changed, forget those gone; `progress(done, total)` while reading.
   * Calls run one after the other.
   */
  update(notes: { path: string; size?: number; modified?: number }[], progress?: (done: number, total: number) => void): Promise<void> {
    const task = this.running.then(() => this.doUpdate(notes, progress));
    this.running = task.catch(() => undefined);
    return task;
  }

  /** Read one note again (it was just saved here, or made: NOTE-003). */
  refresh(path: string): Promise<void> {
    const task = this.running.then(async () => {
      const text = await this.read(path).catch(() => undefined);
      if (text === undefined) return;
      const known = this.entries.has(path);
      // Without its size and date: the next update reads it once more, with them.
      this.entries.set(path, noteEntry(path, text));
      if (!known) {
        // Kept in path order.
        const sorted = [...this.entries].sort(([a], [b]) => a.localeCompare(b));
        this.entries.clear();
        for (const [k, v] of sorted) this.entries.set(k, v);
      }
      this.reindexNames();
    });
    this.running = task.catch(() => undefined);
    return task;
  }

  private async doUpdate(notes: { path: string; size?: number; modified?: number }[], progress?: (done: number, total: number) => void): Promise<void> {
    const wanted = new Map(notes.map((n) => [n.path, n]));
    for (const path of [...this.entries.keys()]) if (!wanted.has(path)) this.entries.delete(path);
    const stale = notes.filter((n) => {
      const e = this.entries.get(n.path);
      return !e || e.size !== n.size || e.modified !== n.modified || n.size === undefined;
    });
    const pause = yielder();
    let done = 0;
    // A few files read at once: the storage answers while the others are parsed.
    const queue = [...stale];
    const worker = async (): Promise<void> => {
      for (let n = queue.shift(); n; n = queue.shift()) {
        const text = await this.read(n.path).catch(() => undefined);
        if (text !== undefined) this.entries.set(n.path, { ...noteEntry(n.path, text), ...(n.size !== undefined ? { size: n.size } : {}), ...(n.modified !== undefined ? { modified: n.modified } : {}) });
        done++;
        progress?.(done, stale.length);
        await pause();
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, stale.length) }, worker));
    // Kept in path order, as the folder lists them.
    const sorted = [...this.entries].sort(([a], [b]) => a.localeCompare(b));
    this.entries.clear();
    for (const [k, v] of sorted) this.entries.set(k, v);
    this.reindexNames();
  }

  private reindexNames(): void {
    this.byName = new Map();
    this.byAlias = new Map();
    this.byId = new Map();
    for (const e of this.entries.values()) {
      const name = noteName(e.path).toLowerCase();
      this.byName.set(name, [...(this.byName.get(name) ?? []), e.path]);
      for (const a of e.aliases) if (!this.byAlias.has(a.toLowerCase())) this.byAlias.set(a.toLowerCase(), e.path);
      const id = noteId(e.path);
      if (id && !this.byId.has(id)) this.byId.set(id, e.path);
    }
    this.graph = undefined;
  }

  /**
   * The note a `[[target]]` written in `from` points to (FOLDER-005): an
   * exact path, else the nearest note with that name (same folder first, then
   * the shallowest), else a note with that alias, else an identifier.
   */
  resolve(target: string, from: string): string | undefined {
    const t = target.replace(/\.(md|markdown)$/i, '').toLowerCase();
    if (!t) return from;
    const last = t.split('/').pop()!;
    let candidates = this.byName.get(last) ?? [];
    if (t.includes('/')) candidates = candidates.filter((n) => stemOf(n) === t || stemOf(n).endsWith(`/${t}`));
    // FOLDER-033: of several notes of that name, the nearest to the note linking (its folder first).
    if (candidates.length) return nearestPath(candidates, from);
    const alias = this.byAlias.get(t);
    if (alias) return alias;
    if (/^\d{8,14}$/.test(t)) return this.byId.get(t);
    return undefined;
  }

  private build(): NonNullable<NoteIndex['graph']> {
    if (this.graph) return this.graph;
    const out = new Map<string, Set<string>>();
    const inn = new Map<string, { from: string; context: string }[]>();
    const unresolved = new Map<string, { from: string }[]>();
    for (const e of this.entries.values()) {
      const targets = new Set<string>();
      for (const l of e.links) {
        const to = l.path ? (this.entries.has(l.target) ? l.target : undefined) : this.resolve(l.target, e.path);
        if (!to) {
          if (!l.path) {
            const key = l.target.replace(/\.(md|markdown)$/i, '').trim();
            unresolved.set(key, [...(unresolved.get(key) ?? []), { from: e.path }]);
          }
          continue;
        }
        if (to === e.path) continue;
        if (!targets.has(to)) inn.set(to, [...(inn.get(to) ?? []), { from: e.path, context: l.context }]);
        targets.add(to);
      }
      out.set(e.path, targets);
    }
    this.graph = { out, in: inn, unresolved };
    return this.graph;
  }

  /**
   * NOTE-002: the notes as tables of SQL — notes, properties, tags, links
   * (resolved to the notes they point to) and tasks.
   */
  tables(): NoteTables {
    const out: NoteTables = { notes: [], props: [], tags: [], links: [], tasks: [] };
    for (const e of this.entries.values()) {
      const slash = e.path.lastIndexOf('/');
      out.notes.push([e.path, noteName(e.path), slash < 0 ? '' : e.path.slice(0, slash), e.size ?? null, e.modified ? new Date(e.modified).toISOString().slice(0, 19) : null]);
      for (const [key, pos, value] of e.props) out.props.push([e.path, key, pos, value]);
      for (const tag of e.tags) out.tags.push([e.path, tag.replace(/^#/, '')]);
      const seen = new Set<string>();
      for (const l of e.links) {
        const to = l.path ? (this.entries.has(l.target) ? l.target : undefined) : this.resolve(l.target, e.path);
        const target = to ?? l.target;
        if (seen.has(target)) continue;
        seen.add(target);
        out.links.push([e.path, target, to ? 1 : 0]);
      }
      for (const [line, text, done] of e.tasks) out.tasks.push([e.path, line, text, done ? 1 : 0]);
    }
    return out;
  }

  /** Links between the notes, each once (FOLDER-018). */
  links(): { from: string; to: string }[] {
    return [...this.build().out].flatMap(([from, tos]) => [...tos].map((to) => ({ from, to })));
  }

  /** The notes linking to `path`, with the words around the link (FOLDER-005). */
  backlinks(path: string): { from: string; context: string }[] {
    return this.build().in.get(path) ?? [];
  }

  /** Links to notes that do not exist (yet), by name, with the notes writing them. */
  unresolved(): Map<string, { from: string }[]> {
    return this.build().unresolved;
  }

  /** Notes of each tag, the most used first (FOLDER-017). */
  tags(): Map<string, string[]> {
    const byKey = new Map<string, { tag: string; notes: string[] }>();
    for (const e of this.entries.values()) {
      for (const tag of e.tags) {
        const key = tag.toLowerCase();
        const entry = byKey.get(key) ?? { tag, notes: [] };
        entry.notes.push(e.path);
        byKey.set(key, entry);
      }
    }
    const sorted = [...byKey.values()].sort((a, b) => b.notes.length - a.notes.length || a.tag.localeCompare(b.tag));
    return new Map(sorted.map((e) => [e.tag, e.notes]));
  }

  /**
   * Notes related to `path` (FOLDER-019): sharing its tags (2 points each) or
   * linked with it either way (3 points), the closest first.
   */
  related(path: string, max = 10): { path: string; tags: string[]; linked: boolean }[] {
    const me = this.entries.get(path);
    if (!me) return [];
    const mine = new Map(me.tags.map((t) => [t.toLowerCase(), t]));
    const g = this.build();
    const linked = new Set([...(g.out.get(path) ?? []), ...(g.in.get(path) ?? []).map((b) => b.from)]);
    const out: { path: string; tags: string[]; linked: boolean; score: number }[] = [];
    for (const e of this.entries.values()) {
      if (e.path === path) continue;
      const shared = e.tags.filter((t) => mine.has(t.toLowerCase())).map((t) => mine.get(t.toLowerCase())!);
      const isLinked = linked.has(e.path);
      const score = shared.length * 2 + (isLinked ? 3 : 0);
      if (score) out.push({ path: e.path, tags: shared, linked: isLinked, score });
    }
    return out
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, max)
      .map(({ score: _score, ...r }) => r);
  }

  /** The notes whose tags hold `tag`, and those writing a link named `name` (to rewrite only them). */
  notesWithTag(tag: string): string[] {
    const t = tag.toLowerCase();
    return [...this.entries.values()].filter((e) => e.tags.some((x) => x.toLowerCase() === t)).map((e) => e.path);
  }

  notesLinkingName(name: string): string[] {
    const n = name.toLowerCase();
    return [...this.entries.values()].filter((e) => e.links.some((l) => !l.path && l.target.replace(/\.(md|markdown)$/i, '').split('/').pop()!.trim().toLowerCase() === n)).map((e) => e.path);
  }
}
