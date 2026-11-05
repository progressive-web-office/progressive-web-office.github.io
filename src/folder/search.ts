/**
 * Search across the documents of a folder (FOLDER-002): Markdown, LaTeX,
 * text, CSV, BibTeX, Word and OpenDocument texts.
 */
import { detectFormat, isTextName } from '../core/format';
import { readBytes, type StorageProvider } from '../fs';
import { allParagraphs, runsText, type RichDocument } from '../document/model';

export interface SearchHit {
  path: string;
  /** Up to three extracts around the matches. */
  snippets: string[];
  count: number;
}

const PLAIN = /\.(md|markdown|txt|tex|bib|csv|tsv|json|ya?ml|html?)$/i;
const RICH = /\.(docx|odt|odm|mdz)$/i;

/** Whether a file's text can be searched. */
export const searchable = (path: string): boolean => PLAIN.test(path) || RICH.test(path) || isTextName(path);

/** Text without case and accents, keeping each character's position. */
const fold = (s: string): string =>
  [...s]
    .map((c) => (c.normalize('NFD').replace(/[̀-ͯ]/g, '') || c).slice(0, 1).toLowerCase())
    .join('');

export const documentText = (doc: RichDocument): string => allParagraphs(doc.blocks).map((p) => runsText(p.runs)).join('\n');

/** Texts of the files, kept while the file bytes do not change. */
export class FolderIndex {
  private readonly texts = new Map<string, { size: number; text: string; folded: string }>();

  constructor(
    private readonly provider: StorageProvider,
    /** Reads Word, OpenDocument and MDZ texts (lazy-loaded readers). */
    private readonly readRich: (name: string, bytes: Uint8Array) => Promise<RichDocument | undefined>,
  ) {}

  private async text(path: string): Promise<{ text: string; folded: string } | undefined> {
    const bytes = await readBytes(this.provider, path).catch(() => undefined);
    if (!bytes) return undefined;
    const cached = this.texts.get(path);
    if (cached && cached.size === bytes.length) return cached;
    let text = '';
    if (PLAIN.test(path) || isTextName(path)) text = new TextDecoder().decode(bytes);
    else if (RICH.test(path) && detectFormat(path, bytes)) text = documentText((await this.readRich(path, bytes).catch(() => undefined)) ?? { blocks: [] } as unknown as RichDocument);
    const entry = { size: bytes.length, text, folded: fold(text) };
    this.texts.set(path, entry);
    return entry;
  }

  /** The text of a file (AI-011), empty when it has none. */
  async textOf(path: string): Promise<string | undefined> {
    return (await this.text(path))?.text;
  }

  /** Files containing `query` (ignoring case and accents), in folder order. */
  async search(query: string, paths: string[], limit = 200): Promise<SearchHit[]> {
    const q = fold(query.trim());
    if (!q) return [];
    const hits: SearchHit[] = [];
    for (const path of paths.filter(searchable)) {
      const entry = await this.text(path);
      if (!entry) continue;
      const snippets: string[] = [];
      let count = 0;
      for (let at = entry.folded.indexOf(q); at >= 0; at = entry.folded.indexOf(q, at + q.length)) {
        count++;
        if (snippets.length < 3) {
          const start = Math.max(0, at - 40);
          const end = Math.min(entry.text.length, at + q.length + 40);
          snippets.push(`${start > 0 ? '…' : ''}${entry.text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < entry.text.length ? '…' : ''}`);
        }
      }
      if (count) hits.push({ path, snippets, count });
      if (hits.length >= limit) break;
    }
    return hits;
  }
}
