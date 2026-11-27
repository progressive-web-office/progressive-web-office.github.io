/**
 * FILE-033: the entry note of a ZIP of Markdown notes (a vault) opened as a
 * folder — a single folder at the top of the archive taken as its root, the
 * note named index, README, Home, Accueil… (optionally after a number such as
 * `00-`), else the only Markdown file of the root.
 */

const MARKDOWN = /\.(md|markdown)$/i;
const ENTRY_NAMES = ['index', 'readme', 'home', 'accueil', 'start', 'welcome', 'sommaire', 'bienvenue'];
const ENTRY = new RegExp(`^(?:\\d+[-_ .]*)?(${ENTRY_NAMES.join('|')})\\.(md|markdown)$`, 'i');
const JUNK = /(^|\/)(__MACOSX|\.[^/]*)(\/|$)/;

/** The Markdown files of an archive, junk and hidden folders (`.obsidian/`, `.trash/`) left out. */
export const notesOf = (paths: readonly string[]): string[] => paths.filter((p) => MARKDOWN.test(p) && !JUNK.test(p));

export function entryNote(paths: readonly string[]): string | undefined {
  const files = paths.filter((p) => !p.endsWith('/') && !JUNK.test(p));
  if (!files.length) return undefined;
  // A single folder at the top is the root ("vault/…").
  const tops = new Set(files.map((p) => (p.includes('/') ? p.split('/')[0]! : '')));
  const root = tops.size === 1 && !tops.has('') ? `${[...tops][0]}/` : '';
  const level = notesOf(files).filter((p) => p.startsWith(root) && !p.slice(root.length).includes('/'));
  const named = level
    .map((p) => ({ p, m: ENTRY.exec(p.slice(root.length)) }))
    .filter((x): x is { p: string; m: RegExpExecArray } => !!x.m)
    .sort((a, b) => ENTRY_NAMES.indexOf(a.m[1]!.toLowerCase()) - ENTRY_NAMES.indexOf(b.m[1]!.toLowerCase()) || a.p.localeCompare(b.p));
  if (named.length) return named[0]!.p;
  return level.length === 1 ? level[0] : undefined;
}
