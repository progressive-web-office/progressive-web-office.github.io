/**
 * AI-011: tools for AI agents on the open folder — list, search and read its
 * notes and documents, as text, within that folder only and without changing
 * anything.
 */
import type { SearchHit } from '../folder/search';
import type { AgentTool } from './tools';

export interface FolderAgentHost {
  label: string;
  /** The paths of the files of the folder. */
  files(): Promise<string[]>;
  search(query: string, paths: string[], limit: number): Promise<SearchHit[]>;
  /** The text of a file, undefined when it has none. */
  read(path: string): Promise<string | undefined>;
}

const MAX_TEXT = 40_000;
const MAX_FILES = 2000;

export function folderTools(host: FolderAgentHost): AgentTool[] {
  return [
    {
      name: 'list_notes',
      description: `List the files of the open folder "${host.label}" (notes and documents), by their path in the folder.`,
      input_schema: { type: 'object', properties: { under: { type: 'string', description: 'Only the files under this sub-folder.' } } },
      mutates: false,
      run: async (input) => {
        const under = String(input.under ?? '').replace(/^\/+|\/+$/g, '');
        const files = (await host.files()).filter((p) => !under || p.startsWith(`${under}/`));
        const shown = files.slice(0, MAX_FILES);
        return [`Folder "${host.label}":`, ...shown, ...(files.length > shown.length ? [`[… ${files.length - shown.length} more: list a sub-folder with "under".]`] : [])].join('\n');
      },
    },
    {
      name: 'search_notes',
      description: 'Search the notes and documents of the open folder for a text (ignoring case and accents); gives the files with extracts around the matches.',
      input_schema: { type: 'object', properties: { query: { type: 'string', description: 'The text to find.' }, limit: { type: 'integer', description: 'At most this many files (default 20).' } }, required: ['query'] },
      mutates: false,
      run: async (input) => {
        const query = String(input.query);
        const limit = Math.min(200, Math.max(1, Number(input.limit ?? 20)));
        const hits = await host.search(query, await host.files(), limit);
        if (!hits.length) return `No note contains "${query}".`;
        return hits.map((h) => [`${h.path} (${h.count} match${h.count === 1 ? '' : 'es'})`, ...h.snippets.map((s) => `  ${s}`)].join('\n')).join('\n');
      },
    },
    {
      name: 'read_note',
      description: 'Read a note or document of the open folder as text, by its path as listed by list_notes or search_notes.',
      input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Its path in the folder.' } }, required: ['path'] },
      mutates: false,
      run: async (input) => {
        const path = String(input.path).replace(/^\/+/, '');
        // Only a file listed in the folder: no way out of it.
        if (!(await host.files()).includes(path)) throw new Error(`${path} is not a file of the folder`);
        const text = await host.read(path);
        if (text === undefined) throw new Error(`${path} cannot be read as text`);
        return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[… cut: ${text.length - MAX_TEXT} more characters]` : text;
      },
    },
  ];
}
