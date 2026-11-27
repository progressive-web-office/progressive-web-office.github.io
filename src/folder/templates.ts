/**
 * Templates kept in the open folder (FOLDER-020): the documents of its
 * `Templates` folder (or `_templates`, `Modèles`), offered in the template
 * gallery, and where "Save as template" can put new ones.
 */
import { DEFAULT_DAILY, fillTemplate } from './daily';
import { basename, readText, walk, type StorageProvider } from '../fs';
import { OPENABLE } from './panel';

export const TEMPLATE_DIRS = /^(_?templates|mod[eè]les)$/i;

export interface FolderTemplate {
  /** File name without its extension. */
  name: string;
  path: string;
}

/** The templates folder at the root of the folder, if any. */
export async function templatesDir(provider: StorageProvider): Promise<string | undefined> {
  return (await provider.list('')).find((e) => e.kind === 'directory' && TEMPLATE_DIRS.test(e.name))?.path;
}

export async function folderTemplates(provider: StorageProvider): Promise<FolderTemplate[]> {
  const dir = await templatesDir(provider);
  if (!dir) return [];
  const out: FolderTemplate[] = [];
  for await (const e of walk(provider, dir)) if (OPENABLE.test(e.path)) out.push({ name: basename(e.path).replace(/\.[^.]+$/, ''), path: e.path });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** FOLDER-030: the fields of a template of the folder filled, as for daily notes (`{{date}}` as `YYYY-MM-DD`). */
export function fillFolderTemplate(text: string, title: string, date: Date, lang?: string): string {
  return fillTemplate(text, date, title, { ...DEFAULT_DAILY, format: 'YYYY-MM-DD' }, lang);
}

export const SNIPPET_DIRS = /^(_?snippets|extraits)$/i;

/** DOC-037: the snippets of the folder: the text and Markdown files of its `Snippets` folder, named after them. */
export async function folderSnippets(provider: StorageProvider): Promise<import('../document/snippets').Snippet[]> {
  const dir = (await provider.list('')).find((e) => e.kind === 'directory' && SNIPPET_DIRS.test(e.name))?.path;
  if (!dir) return [];
  const out: import('../document/snippets').Snippet[] = [];
  for await (const e of walk(provider, dir)) {
    if (!/\.(md|markdown|txt)$/i.test(e.path)) continue;
    out.push({ name: basename(e.path).replace(/\.[^.]+$/, ''), body: (await readText(provider, e.path)).replace(/\n$/, ''), origin: 'folder' });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
