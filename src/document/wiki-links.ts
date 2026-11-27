/**
 * Wiki links between Markdown notes (FOLDER-005): `[[note]]`,
 * `[[note#heading]]`, `[[note|shown text]]` and embeds `![[note]]`,
 * `![[image.png]]`. In the document model a wiki link is a link whose target
 * starts with `wiki:`; an embedded picture is an image titled `embed`.
 */
import type { Run, TextRun } from './model';

export const WIKI = 'wiki:';
export const EMBED = 'embed';

const PATTERN = /(!?)\[\[([^\[\]|#\n]*)(#[^\[\]|\n]*)?(?:\|([^\[\]\n]*))?\]\]/g;
const IMAGE = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;

export interface WikiLink {
  /** Note name or path, without `.md` when written so. */
  target: string;
  /** `#heading`, if any. */
  heading?: string;
  alias?: string;
  embed: boolean;
  /** Position in the text. */
  index: number;
  length: number;
}

/** Wiki links of a Markdown text. */
export function parseWikiLinks(text: string): WikiLink[] {
  const out: WikiLink[] = [];
  for (const m of text.matchAll(PATTERN)) {
    const target = m[2]!.trim();
    if (!target && !m[3]) continue;
    const link: WikiLink = { target, embed: m[1] === '!', index: m.index!, length: m[0].length };
    if (m[3]) link.heading = m[3].slice(1).trim();
    if (m[4] !== undefined) link.alias = m[4].trim();
    out.push(link);
  }
  return out;
}

/** The text shown for a link without alias. */
export const defaultLabel = (target: string, heading?: string): string => (heading ? (target ? `${target} > ${heading}` : heading) : target);

/** `[[target#heading|alias]]`, the alias left out when it is the default label. */
export function wikiLink(ref: string, shown: string): string {
  const bang = ref.startsWith('!') ? '!' : '';
  if (bang) ref = ref.slice(1);
  const hash = ref.indexOf('#');
  const target = hash >= 0 ? ref.slice(0, hash) : ref;
  const heading = hash >= 0 ? ref.slice(hash + 1) : undefined;
  const alias = shown === defaultLabel(target, heading) ? '' : `|${shown}`;
  return `${bang}[[${target}${heading !== undefined ? `#${heading}` : ''}${alias}]]`;
}

/** Text runs with their wiki links as link and image runs (Markdown reading). */
export function wikiRuns(runs: Run[]): Run[] {
  return runs.flatMap((r): Run[] => {
    if (!('text' in r) || r.code || r.link || !r.text.includes('[[')) return [r];
    const out: Run[] = [];
    let last = 0;
    for (const l of parseWikiLinks(r.text)) {
      if (l.index > last) out.push({ ...r, text: r.text.slice(last, l.index) });
      if (l.embed && IMAGE.test(l.target)) {
        // MD-022: `![[picture.png|300]]`, `|300x200`: a size, not a text.
        const size = l.alias ? /^(\d{1,5})(?:x(\d{1,5}))?$/.exec(l.alias.trim()) : null;
        out.push({ image: '', src: l.target, title: EMBED, ...(size ? { width: Number(size[1]), ...(size[2] ? { height: Number(size[2]) } : {}) } : l.alias ? { alt: l.alias } : {}) });
      }
      else {
        // An embedded note is a link whose target starts with `!`.
        const run: TextRun = { ...r, text: l.alias || defaultLabel(l.target, l.heading), link: `${WIKI}${l.embed ? '!' : ''}${l.target}${l.heading !== undefined ? `#${l.heading}` : ''}` };
        out.push(run);
      }
      last = l.index + l.length;
    }
    if (last < r.text.length) out.push({ ...r, text: r.text.slice(last) });
    return out.length ? out : [r];
  });
}

/** A note's name: its file name without `.md`. */
export const noteName = (path: string): string => (path.split('/').pop() ?? path).replace(/\.(md|markdown)$/i, '');

/**
 * The note a wiki link points to: an exact path, else the nearest note with
 * that name (same folder first), else a note with that alias.
 */
export function resolveNote(target: string, notes: string[], from: string, aliases: Map<string, string[]> = new Map()): string | undefined {
  const t = target.replace(/\.(md|markdown)$/i, '').toLowerCase();
  if (!t) return from;
  const withPath = t.includes('/');
  const candidates = notes.filter((n) => {
    const stem = n.replace(/\.(md|markdown)$/i, '').toLowerCase();
    return withPath ? stem === t || stem.endsWith(`/${t}`) : noteName(n).toLowerCase() === t;
  });
  if (candidates.length) {
    const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
    return candidates.find((c) => c.startsWith(dir) && !c.slice(dir.length).includes('/')) ?? candidates.sort((a, b) => a.split('/').length - b.split('/').length)[0];
  }
  for (const [note, names] of aliases) if (names.some((a) => a.toLowerCase() === t)) return note;
  // FOLDER-024: a link by identifier, to the note whose name starts with it.
  if (/^\d{8,14}$/.test(t)) return notes.find((n) => noteId(n) === t);
  return undefined;
}

/** FOLDER-024: the identifier a note name starts with (a date and time, 8 to 14 digits), if any. */
export function noteId(path: string): string | undefined {
  return /^(\d{8,14})(?=[\s_-]|$)/.exec(noteName(path))?.[1];
}

/** FOLDER-024: the `id:` of a note's front matter, if any. */
export function frontMatterId(text: string): string | undefined {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  const id = fm && /^id:[ \t]*(\S.*?)[ \t]*$/m.exec(fm)?.[1];
  return id ? id.replace(/^["']|["']$/g, '') : undefined;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** FOLDER-024: an identifier for a new note, from the date and time (`YYYYMMDDHHmm`). */
export const newNoteId = (d = new Date()): string => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;

/** FOLDER-024: the text of a new note with an identifier. */
export const newNoteText = (id: string, title: string): string => `---\nid: ${id}\n---\n# ${title}\n`;

/** Rename the wiki links to a note (`[[old…]]` → `[[new…]]`); returns the new text and the number of links changed. */
export function renameWikiLinks(text: string, oldName: string, newName: string): { text: string; count: number } {
  let count = 0;
  const old = oldName.toLowerCase();
  const out = text.replace(PATTERN, (all, bang: string, target: string, heading: string | undefined, alias: string | undefined) => {
    const t = target.trim();
    const stem = t.replace(/\.(md|markdown)$/i, '');
    const name = stem.split('/').pop()!.toLowerCase();
    if (name !== old) return all;
    count++;
    const prefix = stem.includes('/') ? stem.slice(0, stem.lastIndexOf('/') + 1) : '';
    return `${bang}[[${prefix}${newName}${heading ?? ''}${alias !== undefined ? `|${alias}` : ''}]]`;
  });
  return { text: out, count };
}

/** `aliases` of a note's YAML front matter (inline list or block list). */
export function frontMatterAliases(text: string): string[] {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (!fm) return [];
  const inline = /^aliases:\s*\[(.*)\]\s*$/m.exec(fm);
  if (inline) return inline[1]!.split(',').map((a) => a.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  const block = /^aliases:\s*\n((?:\s*-\s*.*\n?)+)/m.exec(fm);
  if (block) return block[1]!.split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  const single = /^aliases?:\s*(\S.*)$/m.exec(fm);
  return single ? [single[1]!.trim().replace(/^["']|["']$/g, '')] : [];
}
