/**
 * Format-neutral rich-text document model shared by the DOCX, ODT, Markdown
 * and MDZ readers/writers and by the WYSIWYG editor.
 */
import type { BibEntry } from './bibliography';

export type ParagraphStyle = 'normal' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'quote' | 'code' | 'caption';
export type Align = 'left' | 'center' | 'right' | 'justify';

export interface TextFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** DOC-048: small capitals (LaTeX's \\textsc). */
  smallCaps?: boolean;
  code?: boolean;
  /** Hyperlink target (validated with `isSafeUrl` before rendering). */
  link?: string;
  /** Font size in points. */
  size?: number;
  /** Text colour as `#rrggbb`. */
  color?: string;
  /** Font family name (e.g. `Liberation Serif`). */
  font?: string;
  /** Background (highlight) colour as `#rrggbb`. */
  highlight?: string;
  /** Comments on this text (REV-001): ids into `RichDocument.comments`. */
  comments?: string[];
  /** A tracked insertion or deletion (REV-005). */
  inserted?: Revision;
  deleted?: Revision;
  /** MD-024: a comment of the note (`%%…%%`), hidden in reading mode, kept on save. */
  mdComment?: boolean;
  /** MD-023: raw inline HTML of a Markdown file, shown and written as it is. */
  rawHtml?: boolean;
}

/** Who made a tracked change, and when (REV-005). */
export interface Revision {
  author?: string;
  /** ISO 8601 timestamp. */
  date?: string;
}

/** A comment on a range of text, or a reply to one (REV-001). */
export interface DocComment {
  id: string;
  author?: string;
  initials?: string;
  /** ISO 8601 timestamp. */
  date?: string;
  /** Plain text; `\n` separates paragraphs. */
  text: string;
  /** The comment this one replies to; a reply has no range of its own. */
  parent?: string;
  resolved?: boolean;
}

export interface TextRun extends TextFormat {
  /** Text; `\n` is a line break, `\t` a tab. */
  text: string;
}

export interface ImageRun {
  /** Key into `RichDocument.resources` (empty when the image is external). */
  image: string;
  /** Original reference for images that could not be embedded (e.g. Markdown URL). */
  src?: string;
  alt?: string;
  /** Picture title; a diagram language (e.g. `mermaid`) marks a rendered diagram whose `alt` is the source (DIAG-005). */
  title?: string;
  /** Display size in CSS pixels, when known. */
  width?: number;
  height?: number;
  /** MD-022: the size was written in the Markdown link (`![alt|300](…)`), and is written back there. */
  linkSize?: boolean;
}

/** An equation, stored as LaTeX (MATH-001). */
export interface MathRun {
  math: string;
  /** Display (block) equation rather than inline. */
  display?: boolean;
}

/** Languages of executable code cells (CODE-001). */
/** `julia`: cells of KaimonSlate notebooks (DOC-038), kept and edited, run by KaimonSlate itself. */
/** CODE-020: run in the browser, or shown and edited only (see code-langs.ts). */
export type CodeLang = import('./code-langs').RunLang | import('./code-langs').ShowLang;

/** Diagram languages understood by the editor (DIAG-001). */
export type DiagramLang = 'mermaid';

/** A diagram, stored as source text and rendered on demand (DIAG-001). */
export interface DiagramRun {
  diagram: string;
  lang: DiagramLang;
}

/** The last result of running a code cell, kept in the document (CODE-005). */
export interface CellOutput {
  text: string;
  error?: boolean;
  /** Figures, as keys into `RichDocument.resources`. */
  images?: string[];
  /** CODE-016: widgets the cell shows. */
  widgets?: CellWidget[];
}

/** A widget shown by a cell (CODE-016). */
export interface CellWidget {
  /** Model id of the running widget. */
  id: string;
  /** Picture of the widget (PNG, key into `RichDocument.resources`), for print, export and reopening. */
  snapshot?: string;
}

/** An executable code cell, run on request in a sandbox (CODE-001). */
export interface CodeCellRun {
  cell: string;
  lang: CodeLang;
  output?: CellOutput;
  /** CODE-013: the code is hidden, only its output is shown (and printed, and exported). */
  hidden?: boolean;
  /** DOC-038: the KaimonSlate cell header after `#%% ` (kind, id and tags), kept as written. */
  header?: string;
}

/** A footnote, numbered automatically where it is referenced (DOC-022). */
export interface FootnoteRun {
  /** The note's content (text and equations; several paragraphs separated by `\n\n`). */
  footnote: Run[];
}

/** Kinds of numbered items (DOC-026). */
export type SeqKind = 'figure' | 'table' | 'equation';
export const SEQ_KINDS: SeqKind[] = ['figure', 'table', 'equation'];

/**
 * The number of a figure, table or equation, counted in document order
 * (DOC-026). Its paragraph's `id` is the target of cross-references; an
 * equation number shows as `(n)`.
 */
export interface SeqRun {
  seq: SeqKind;
}

/** A cross-reference to the paragraph with this `id` (DOC-026). */
export interface RefRun {
  ref: string;
}

/** A citation of bibliography entries (DOC-027). */
export interface CiteRun {
  /** Keys of the cited entries. */
  cite: string[];
  /** Page or section: "p. 12". */
  locator?: string;
}

/**
 * DOC-041: a field, whose value is computed when the document is shown,
 * printed or opened: the date of the day, the page number, the title…
 */
export const FIELD_KINDS = ['date', 'time', 'page', 'pages', 'title', 'author', 'filename'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/** DOC-050: how a date or a time is written. */
export const FIELD_FORMATS = ['short', 'medium', 'long', 'full', 'iso'] as const;
export type FieldFormat = (typeof FIELD_FORMATS)[number];

export interface FieldRun {
  field: FieldKind;
  /** DOC-050: how a date or a time is written (default: long date, short time). */
  format?: FieldFormat;
  /** DOC-050: a fixed date (`YYYY-MM-DD`) or time (`HH:mm`) instead of the current one. */
  fixed?: string;
}

/** The date or time a field shows. */
function fieldMoment(kind: FieldKind, fixed: string | undefined, now: Date): Date {
  const d = fixed ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(fixed) : null;
  if (kind === 'date' && d) return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]));
  const tm = fixed ? /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(fixed) : null;
  if (kind === 'time' && tm) return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(tm[1]), Number(tm[2]), Number(tm[3] ?? 0));
  return now;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** DOC-050: the Markdown of a field: `{date}`, `{date:full}`, `{date=2025-12-24}`, `{time:medium=08:30}`. */
export function fieldMarkdown(run: FieldRun): string {
  return `{${run.field}${run.format ? `:${run.format}` : ''}${run.fixed ? `=${run.fixed}` : ''}}`;
}

/** DOC-050: `date:full=2025-12-24` → the field, when it is one. */
export function parseFieldMarkdown(inner: string): FieldRun | undefined {
  const m = /^([a-z]+)(?::([a-z]+))?(?:=(\d{4}-\d{2}-\d{2}|\d{2}:\d{2}(?::\d{2})?))?$/.exec(inner);
  if (!m || !isFieldKind(m[1]!)) return undefined;
  const format = m[2];
  if (format !== undefined && !(FIELD_FORMATS as readonly string[]).includes(format)) return undefined;
  if ((format || m[3]) && m[1] !== 'date' && m[1] !== 'time') return undefined;
  return { field: m[1], ...(format ? { format: format as FieldFormat } : {}), ...(m[3] ? { fixed: m[3] } : {}) };
}

/** What a field shows, given the document and where it is. */
export interface FieldContext {
  meta?: DocumentMeta;
  fileName?: string;
  /** Language of the dates (BCP 47); the document's, else the interface's. */
  lang?: string;
  now?: Date;
  page?: number;
  pages?: number;
}

/** The value of a field, as shown. */
export function fieldValue(kind: FieldKind, ctx: FieldContext = {}, opts: { format?: FieldFormat; fixed?: string } = {}): string {
  const now = fieldMoment(kind, opts.fixed, ctx.now ?? new Date());
  const lang = ctx.lang || ctx.meta?.language || undefined;
  switch (kind) {
    case 'date':
      switch (opts.format) {
        case 'iso':
          return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        case 'short':
        case 'medium':
        case 'full':
          return now.toLocaleDateString(lang, { dateStyle: opts.format });
        default:
          return now.toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
      }
    case 'time':
      if (opts.format === 'iso') return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      return now.toLocaleTimeString(lang, opts.format === 'medium' || opts.format === 'long' || opts.format === 'full' ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
    case 'page':
      return String(ctx.page ?? 1);
    case 'pages':
      return String(ctx.pages ?? 1);
    case 'title':
      return ctx.meta?.title ?? '';
    case 'author':
      return ctx.meta?.author ?? '';
    case 'filename':
      return ctx.fileName ?? '';
  }
}

export const isFieldKind = (s: string): s is FieldKind => (FIELD_KINDS as readonly string[]).includes(s);

/** `{date}`… in Markdown text, but not inside the `{{name}}` of a mail merge. */
export const FIELD_SYNTAX = new RegExp(`(?<!\\{)\\{(?:${FIELD_KINDS.join('|')})(?::[a-z]+)?(?:=[\\d:-]+)?\\}(?!\\})`, 'g');

/**
 * DOC-042: a horizontal spring (LaTeX's `\hfill`): the free width of its line
 * is shared by the springs of the line, in proportion to their `hfill`.
 */
export interface FillRun {
  hfill: number;
  /** Where the text after it starts, in points from the start of the line, as last shown (for formats without springs). */
  at?: number;
}

/**
 * FORM-003: a form field of a text document, filled in where it stands —
 * a text zone, a check box, a drop-down list. Its name is the column of its
 * answers when filled forms are compiled (FORM-002).
 */
export const INPUT_KINDS = ['text', 'checkbox', 'dropdown'] as const;
export type InputKind = (typeof INPUT_KINDS)[number];

export interface InputRun {
  input: InputKind;
  name: string;
  /** The text typed, or the choice made; a check box: `checked`. */
  value?: string;
  checked?: boolean;
  /** The choices of a drop-down list. */
  options?: string[];
  required?: boolean;
}

export const isInputKind = (s: string): s is InputKind => (INPUT_KINDS as readonly string[]).includes(s);

/** The answer of a form field: its text, its choice, or whether it is ticked. */
export const inputAnswer = (run: InputRun): string | boolean => (run.input === 'checkbox' ? !!run.checked : (run.value ?? ''));

/** A form field as plain text: `☒`/`☐`, or its value (`____` when empty). */
export const inputText = (run: InputRun): string => (run.input === 'checkbox' ? (run.checked ? '☒' : '☐') : run.value || '_____');

export type Run = TextRun | ImageRun | MathRun | DiagramRun | CodeCellRun | FootnoteRun | SeqRun | RefRun | CiteRun | FieldRun | FillRun | InputRun;

export interface ListInfo {
  ordered: boolean;
  /** Nesting level, 0-based. */
  level: number;
}

/** Direct paragraph spacing (DOC-020); lengths in points. */
export interface ParagraphLayout {
  /** Left indent. */
  indent?: number;
  /** First-line indent (negative for a hanging indent). */
  firstLine?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  /** Line spacing as a multiple of single spacing (1.15, 1.5, 2…). */
  lineHeight?: number;
}

/** DOC-049: text set in columns, as in a newspaper. */
export interface ColumnLayout {
  /** Two to six columns. */
  count: number;
  /** Space between the columns, in points (12 pt when left out). */
  gap?: number;
  /** A line between the columns. */
  rule?: boolean;
}

export const DEFAULT_COLUMN_GAP = 12;

/** Blocks that may be set in columns (DOC-049): consecutive blocks with the same layout share them. */
interface InColumns {
  columns?: ColumnLayout;
}

export interface Paragraph extends ParagraphLayout, InColumns {
  type: 'paragraph';
  style: ParagraphStyle;
  /** Part of the answer key, left out of the exercise sheet (TEACH-001). */
  solution?: boolean;
  /** Anchor of cross-references to this paragraph (DOC-026). */
  id?: string;
  /** DOC-038: first block of a KaimonSlate text cell: its header after `#%% `, and its Markdown as written. */
  cellHeader?: string;
  cellSource?: string;
  /** DOC-053: the named style of the paragraph (an id of `RichDocument.styles`). */
  named?: string;
  align?: Align;
  list?: ListInfo;
  /** MD-020: a task of a list: its state as written between the brackets (` `, `x`, `/`, `-`…). */
  task?: string;
  /** MD-021: the info string of a code block (its language first, e.g. `js` or `python title="a.py"`). */
  codeInfo?: string;
  /** MD-025: the identifier of the block (`^id`), for links and embeds. */
  blockId?: string;
  /** MD-023, MD-024: a block kept as written — raw HTML, or a comment block between `%%` lines; its only run holds the source. */
  raw?: 'html' | 'comment';
  /** MD-026: a callout's title line, its body following it without a blank line (`> [!tip] Title` then `> body`). */
  joined?: boolean;
  runs: Run[];
}

/** MD-020: done, for a task state. */
export const taskDone = (state: string | undefined): boolean => state === 'x' || state === 'X';

/** Monospaced font names: text in them is inline code. */
export const MONO_FONT = /mono|courier|consolas|menlo|monaco|source code|fira code/i;

export const LAYOUT_KEYS: (keyof ParagraphLayout)[] = ['indent', 'firstLine', 'spaceBefore', 'spaceAfter', 'lineHeight'];

export interface TableCell {
  blocks: Paragraph[];
  /** Merged cells (DOC-025): covered cells are left out of the rows, as in HTML. */
  colSpan?: number;
  rowSpan?: number;
}

export interface Table extends InColumns {
  type: 'table';
  rows: TableCell[][];
  /** The first row is a header row, repeated on each page (DOC-025). */
  header?: boolean;
}

/** A position of a table's grid: the cell starting there, or the cell covering it. */
export interface GridSlot {
  cell: TableCell;
  /** Where the cell starts. */
  row: number;
  col: number;
}

/**
 * Place the cells of a table on its grid, like an HTML table: each row's cells
 * fill the columns not covered by row spans from above (DOC-025).
 */
export function tableGrid(rows: TableCell[][]): { cols: number; slots: (GridSlot | undefined)[][] } {
  const slots: (GridSlot | undefined)[][] = rows.map(() => []);
  let cols = 0;
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row) {
      while (slots[r]![c]) c++;
      const cs = Math.max(1, cell.colSpan ?? 1);
      const rs = Math.max(1, Math.min(cell.rowSpan ?? 1, rows.length - r));
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) slots[r + dr]![c + dc] = { cell, row: r, col: c };
      c += cs;
      cols = Math.max(cols, c);
    }
  });
  return { cols: Math.max(1, cols), slots };
}

export interface Rule extends InColumns {
  type: 'rule';
  /** A page break rather than a horizontal line (DOC-021). */
  page?: boolean;
  /** DOC-049: a column break: what follows starts the next column. */
  column?: boolean;
}

export const PAGE_BREAK: Rule = { type: 'rule', page: true };

/** A valid column layout, or nothing for a single column (DOC-049). */
export function cleanColumns(c: ColumnLayout | undefined): ColumnLayout | undefined {
  const count = Math.round(Number(c?.count) || 1);
  if (!c || count < 2) return undefined;
  const out: ColumnLayout = { count: Math.min(6, count) };
  if (c.gap !== undefined && Number.isFinite(c.gap) && c.gap >= 0 && c.gap !== DEFAULT_COLUMN_GAP) out.gap = c.gap;
  if (c.rule) out.rule = true;
  return out;
}

export const sameColumns = (a: ColumnLayout | undefined, b: ColumnLayout | undefined): boolean => {
  const x = cleanColumns(a);
  const y = cleanColumns(b);
  return x?.count === y?.count && x?.gap === y?.gap && x?.rule === y?.rule;
};

/** Runs of consecutive blocks sharing a column layout (DOC-049), in order. */
export function columnSegments(blocks: Block[]): { columns?: ColumnLayout; blocks: Block[] }[] {
  const out: { columns?: ColumnLayout; blocks: Block[] }[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && sameColumns(last.columns, b.columns)) last.blocks.push(b);
    else {
      const columns = cleanColumns(b.columns);
      out.push(columns ? { columns, blocks: [b] } : { blocks: [b] });
    }
  }
  return out;
}

/** The blocks set in these columns, or in a single column. */
export function inColumns<T extends Block>(blocks: T[], columns: ColumnLayout | undefined): T[] {
  const c = cleanColumns(columns);
  return blocks.map((b) => {
    const { columns: _, ...rest } = b;
    return (c ? { ...rest, columns: c } : rest) as T;
  });
}

/** A table of contents, generated from the headings (DOC-023). */
export interface Toc extends InColumns {
  type: 'toc';
  /** Deepest heading level listed (default 3). */
  levels?: number;
}

/** The list of cited references (DOC-027). */
export interface Bibliography extends InColumns {
  type: 'bibliography';
}

/**
 * A sub-document of a master document (DOC-028): its path, relative to the
 * master document; its content is assembled on export.
 */
export interface Include extends InColumns {
  type: 'include';
  src: string;
}

/**
 * DOC-042: vertical space: fixed (`size`, in points), or a spring (LaTeX's
 * `\vfill`) sharing the free height of its page with the other springs of
 * the page, in proportion to their `stretch`; its `size` is then its height
 * as last shown (for formats without springs).
 */
export interface Space extends InColumns {
  type: 'space';
  stretch?: number;
  /** Height in points: of a fixed space, or as last shown (springs, fractions). */
  size?: number;
  /** DOC-042: a fixed share of the page's text height (0.3 = 30 %, LaTeX's `0.3\textheight`). */
  fraction?: number;
}

export type Block = Paragraph | Table | Rule | Toc | Bibliography | Include | Space;

/** The bibliography of a document (DOC-027). */
export interface References {
  entries: BibEntry[];
  /** Citations as `[1]` (default) or `(Author, year)`. */
  style?: 'numeric' | 'author-year';
}

export interface Resource {
  data: Uint8Array;
  mediaType: string;
  /** Original file name, when known. */
  name?: string;
}

/** Document properties (DOC-017), mapped to each format's metadata. */
export interface DocumentMeta {
  title?: string;
  author?: string;
  /** Creation or publication date, ISO 8601 (`YYYY-MM-DD` or a full timestamp). */
  date?: string;
  subject?: string;
  description?: string;
  keywords?: string[];
  /** BCP 47 language tag, e.g. `fr` or `en-GB`. */
  language?: string;
  /** Licence, preferably an SPDX identifier such as `CC-BY-4.0`. */
  license?: string;
  /** Stable identifier (a UUID) of a document synchronised offline (COLLAB-008); not shown in the properties dialog. */
  identifier?: string;
  /** FILE-029: where the document comes from — the address of its repository file or WebDAV file. */
  source?: string;
}

/** Fields of DocumentMeta in display order. */
export const META_FIELDS = ['title', 'author', 'date', 'subject', 'description', 'keywords', 'language', 'license', 'identifier', 'source'] as const;

/** Drop empty values (empty strings, empty keyword lists). */
export function cleanMeta(meta: DocumentMeta): DocumentMeta {
  const out: DocumentMeta = {};
  for (const key of META_FIELDS) {
    const value = meta[key];
    if (key === 'keywords') {
      const list = (value as string[] | undefined)?.map((k) => k.trim()).filter(Boolean) ?? [];
      if (list.length) out.keywords = list;
    } else if (typeof value === 'string' && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

/** `2026-09-30T00:00:00Z` → `2026-09-30` (dates without a time of day). */
export function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0+)?(?:Z)?$/, '$1');
}

/** ISO timestamp for formats that need one (OOXML, ODF); undefined when the date is not ISO. */
export function isoTimestamp(date: string | undefined, zulu: boolean): string | undefined {
  if (!date) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T00:00:00${zulu ? 'Z' : ''}`;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const iso = parsed.toISOString().replace(/\.\d+Z$/, 'Z');
  return zulu ? iso : iso.replace(/Z$/, '');
}

/** Text of a header or footer zone; `{page}`, `{pages}`, `{title}` and `{date}` are fields (DOC-024). */
export interface PageZones {
  left?: string;
  center?: string;
  right?: string;
}

/** How page numbers are written (DOC-029). */
export const PAGE_NUMBER_FORMATS = ['decimal', 'lower-roman', 'upper-roman', 'lower-alpha', 'upper-alpha'] as const;
export type PageNumberFormat = (typeof PAGE_NUMBER_FORMATS)[number];

/**
 * DOC-046: the paper of the document and its margins, in millimetres
 * (width and height as the page is turned).
 */
export interface PageGeometry {
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Usual papers, portrait, in millimetres. */
export const PAPERS: Record<string, [number, number]> = { A4: [210, 297], Letter: [215.9, 279.4], A5: [148, 210], A3: [297, 420], Legal: [215.9, 355.6] };

/** The page of a document without one: A4 (Letter in North America), 2 cm margins. */
export function defaultGeometry(lang = typeof navigator !== 'undefined' ? navigator.language : 'en'): PageGeometry {
  const [width, height] = /^en-(US|CA)$|^es-(MX|US)$/.test(lang) ? PAPERS.Letter! : PAPERS.A4!;
  return { width, height, top: 20, right: 20, bottom: 20, left: 20 };
}

/** The name of a paper size ("A4", "Letter"), whichever way it is turned; undefined for another size. */
export function paperName(g: Pick<PageGeometry, 'width' | 'height'>): string | undefined {
  const [a, b] = [Math.min(g.width, g.height), Math.max(g.width, g.height)];
  return Object.entries(PAPERS).find(([, [w, h]]) => Math.abs(w - a) < 1 && Math.abs(h - b) < 1)?.[0];
}

export const isLandscape = (g: Pick<PageGeometry, 'width' | 'height'>): boolean => g.width > g.height;

/** The height of the text of a page (between the top and bottom margins), in millimetres. */
export const textHeight = (g: PageGeometry): number => g.height - g.top - g.bottom;
export const textWidth = (g: PageGeometry): number => g.width - g.left - g.right;

export interface PageSetup {
  /** DOC-046: paper and margins; the default page when absent. */
  geometry?: PageGeometry;
  header?: PageZones;
  footer?: PageZones;
  /** Page number style (DOC-029); decimal when absent. */
  numberFormat?: PageNumberFormat;
  /** Number of the first page; 1 when absent. */
  startAt?: number;
  /** No header and footer on the first page (a title page). */
  hideOnFirstPage?: boolean;
}

/** `n` written in a page number format: 4 → "iv", "D"… */
export function formatPageNumber(n: number, format: PageNumberFormat = 'decimal'): string {
  if (format === 'decimal' || n < 1) return String(n);
  if (format.endsWith('alpha')) {
    let s = '';
    for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s;
    return format === 'upper-alpha' ? s.toUpperCase() : s;
  }
  const romans: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  let k = Math.min(n, 3999);
  for (const [v, r] of romans) for (; k >= v; k -= v) s += r;
  return format === 'upper-roman' ? s.toUpperCase() : s;
}

export const PAGE_FIELDS = ['page', 'pages', 'title', 'date'] as const;
export type PageField = (typeof PAGE_FIELDS)[number];

/** A zone's text split into literal text and fields. */
export function zoneParts(text: string): (string | { field: PageField })[] {
  const out: (string | { field: PageField })[] = [];
  for (const part of text.split(/(\{(?:page|pages|title|date)\})/)) {
    if (!part) continue;
    const m = /^\{(page|pages|title|date)\}$/.exec(part);
    out.push(m ? { field: m[1] as PageField } : part);
  }
  return out;
}

/** Drop empty zones and empty header/footer; undefined when nothing is left. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

export function cleanPageSetup(page: PageSetup | undefined): PageSetup | undefined {
  const zones = (z: PageZones | undefined): PageZones | undefined => {
    if (!z) return undefined;
    const out: PageZones = {};
    for (const k of ['left', 'center', 'right'] as const) if (z[k]?.trim()) out[k] = z[k]!.trim();
    return Object.keys(out).length ? out : undefined;
  };
  const header = zones(page?.header);
  const footer = zones(page?.footer);
  // DOC-046: a sensible page (at least 5 cm of paper, margins leaving 2 cm of text).
  const g = page?.geometry;
  const geometry =
    g && [g.width, g.height, g.top, g.right, g.bottom, g.left].every((n) => Number.isFinite(n) && n >= 0) && g.width >= 50 && g.height >= 50 && textWidth(g) >= 20 && textHeight(g) >= 20
      ? { width: r2(g.width), height: r2(g.height), top: r2(g.top), right: r2(g.right), bottom: r2(g.bottom), left: r2(g.left) }
      : undefined;
  if (!header && !footer && !geometry) return undefined;
  // DOC-029: numbering settings only matter with a header or footer; defaults are left out.
  const format = page?.numberFormat && page.numberFormat !== 'decimal' && (PAGE_NUMBER_FORMATS as readonly string[]).includes(page.numberFormat) ? page.numberFormat : undefined;
  const start = page?.startAt !== undefined && Number.isInteger(page.startAt) && page.startAt !== 1 && page.startAt >= 0 ? page.startAt : undefined;
  return {
    ...(geometry ? { geometry } : {}),
    ...(header ? { header } : {}),
    ...(footer ? { footer } : {}),
    ...(format ? { numberFormat: format } : {}),
    ...(start !== undefined ? { startAt: start } : {}),
    ...(page?.hideOnFirstPage ? { hideOnFirstPage: true } : {}),
  };
}

export interface RichDocument {
  blocks: Block[];
  /** Header and footer (DOC-024). */
  page?: PageSetup;
  /** Bibliography entries and citation style (DOC-027). */
  references?: References;
  /** Embedded binary resources (images), content-addressed. */
  resources: Map<string, Resource>;
  meta: DocumentMeta;
  /** Format-specific data preserved for round-trips (e.g. MDZ extras). */
  extras?: Record<string, unknown>;
  /** Comments and replies, in creation order (REV-001). */
  comments?: DocComment[];
  /** DOC-053: the named paragraph styles of the document. */
  styles?: import('./styles').NamedStyle[];
}

export const isImageRun = (run: Run): run is ImageRun => 'image' in run;
export const isMathRun = (run: Run): run is MathRun => 'math' in run;
export const isCodeCellRun = (run: Run): run is CodeCellRun => 'cell' in run;
export const isDiagramRun = (run: Run): run is DiagramRun => 'diagram' in run;
export const isTextRun = (run: Run): run is TextRun => 'text' in run;
export const isFootnoteRun = (run: Run): run is FootnoteRun => 'footnote' in run;
export const isSeqRun = (run: Run): run is SeqRun => 'seq' in run;
export const isRefRun = (run: Run): run is RefRun => 'ref' in run;
export const isCiteRun = (run: Run): run is CiteRun => 'cite' in run;
export const isFieldRun = (run: Run): run is FieldRun => 'field' in run;
export const isFillRun = (run: Run): run is FillRun => 'hfill' in run;
export const isInputRun = (run: Run): run is InputRun => 'input' in run;

/** What a cross-reference can point to (DOC-026). */
export interface CrossTarget {
  id: string;
  kind: SeqKind | 'heading';
  /** Number of a figure, table or equation. */
  number?: number;
  /** What a reference shows: `Figure 3`, `(2)` or the heading text. */
  label: string;
  /** The whole caption or heading, to choose a target. */
  description: string;
}

/** Paragraphs in document order, table cells included. */
export function allParagraphs(blocks: Block[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const b of blocks) {
    if (b.type === 'paragraph') out.push(b);
    else if (b.type === 'table') for (const row of b.rows) for (const cell of row) out.push(...cell.blocks);
  }
  return out;
}

/** The text shown for a numbered item: `(n)` for equations. */
export const seqText = (kind: SeqKind, n: number): string => (kind === 'equation' ? `(${n})` : String(n));

/** The label of a numbered paragraph: the text just before its number (`Figure `) and the number. */
export function seqLabel(runs: Run[], kind: SeqKind, n: number): string {
  const i = runs.findIndex(isSeqRun);
  let prefix = '';
  for (let j = i - 1; j >= 0 && isTextRun(runs[j]!); j--) prefix = (runs[j] as TextRun).text + prefix;
  prefix = prefix.split('\n').pop()!.trim();
  return kind === 'equation' || !prefix ? seqText(kind, n) : `${prefix}\u00a0${n}`;
}

/**
 * Runs covered by a paragraph's anchor, as [start, end): the label and the
 * number of a numbered paragraph (`Figure 3`, `(2)`), or the whole paragraph.
 */
export function anchorSpan(runs: Run[]): [number, number] {
  const i = runs.findIndex(isSeqRun);
  if (i < 0) return [0, runs.length];
  let start = i;
  if ((runs[i] as SeqRun).seq !== 'equation') while (start > 0 && isTextRun(runs[start - 1]!) && !(runs[start - 1] as TextRun).text.includes('\n')) start--;
  return [start, i + 1];
}

/** Names of the numbered sequences in Word and OpenDocument files. */
export const SEQ_NAMES: Record<SeqKind, string> = { figure: 'Figure', table: 'Table', equation: 'Equation' };

/** A sequence name from a file (`Figure`, `Illustration`, `Tableau`…) as a kind. */
export function seqKindOf(name: string): SeqKind {
  const n = name.toLowerCase();
  if (/^(tab|tbl)/.test(n)) return 'table';
  if (/^(eq|éq|formul|gleichung)/.test(n)) return 'equation';
  return 'figure';
}

/** Numbers of the figures, tables and equations, and the targets of cross-references (DOC-026). */
export function crossTargets(blocks: Block[]): { targets: Map<string, CrossTarget>; numbers: Map<SeqRun, number> } {
  const counters: Record<SeqKind, number> = { figure: 0, table: 0, equation: 0 };
  const targets = new Map<string, CrossTarget>();
  const numbers = new Map<SeqRun, number>();
  for (const p of allParagraphs(blocks)) {
    let first: { kind: SeqKind; n: number } | undefined;
    for (const run of p.runs) {
      if (!isSeqRun(run)) continue;
      const n = ++counters[run.seq];
      numbers.set(run, n);
      first ??= { kind: run.seq, n };
    }
    if (!p.id || targets.has(p.id)) continue;
    const text = describeRuns(p.runs, first?.n ?? 0);
    if (first) {
      targets.set(p.id, { id: p.id, kind: first.kind, number: first.n, label: seqLabel(p.runs, first.kind, first.n), description: first.kind === 'equation' ? `${seqText('equation', first.n)} ${p.runs.filter(isMathRun).map((r) => r.math).join(' ')}`.trim() : text });
    } else if (/^h[1-6]$/.test(p.style)) {
      targets.set(p.id, { id: p.id, kind: 'heading', label: text, description: text });
    }
  }
  return { targets, numbers };
}

/** A paragraph's text with its number shown, to choose it as a target. */
export function describeRuns(runs: Run[], n: number): string {
  return runs
    .map((r) => (isTextRun(r) ? r.text : isSeqRun(r) ? seqText(r.seq, n) : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What a cross-reference shows; `??` when its target is missing, as in LaTeX. */
export const refLabel = (targets: Map<string, CrossTarget>, id: string): string => targets.get(id)?.label ?? '??';

/** A new anchor for a cross-reference target, e.g. `fig_k3x9a2`. */
export function newAnchor(kind: SeqKind | 'heading'): string {
  const prefix = { figure: 'fig', table: 'tbl', equation: 'eq', heading: 'sec' }[kind];
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The kind of a target from its anchor prefix (`fig_`, `tbl_`, `eq_`, `sec_`; also `fig:` and `fig-`). */
export function anchorKind(id: string): SeqKind | 'heading' | undefined {
  const m = /^(fig|tbl|tab|eq|sec)[_:-]/i.exec(id);
  if (!m) return undefined;
  return ({ fig: 'figure', tbl: 'table', tab: 'table', eq: 'equation', sec: 'heading' } as const)[m[1]!.toLowerCase() as 'fig'];
}

export /** `(` SEQ Equation `)`: the parentheses belong to the number. */
function unwrapEquationNumbers(runs: Run[]): Run[] {
  runs = runs.filter((r) => !isTextRun(r) || r.text);
  runs.forEach((r, i) => {
    if (!isSeqRun(r) || r.seq !== 'equation') return;
    const before = runs[i - 1];
    const after = runs[i + 1];
    if (before && isTextRun(before) && after && isTextRun(after) && before.text.endsWith('(') && after.text.startsWith(')')) {
      runs[i - 1] = { ...before, text: before.text.slice(0, -1) };
      runs[i + 1] = { ...after, text: after.text.slice(1) };
    }
  });
  return runs;
}

/** References made through a paragraph's other anchors point to its anchor; unused anchors are dropped. */
export function resolveAnchors(blocks: Block[], alias: Map<string, string>): void {
  const remap = (runs: Run[]): void => {
    for (const r of runs) {
      if (isRefRun(r)) r.ref = alias.get(r.ref) ?? r.ref;
      else if (isFootnoteRun(r)) remap(r.footnote);
    }
  };
  for (const p of allParagraphs(blocks)) remap(p.runs);
  pruneAnchors(blocks);
}

/** Drop anchors that no cross-reference uses (imported bookmarks are often noise). */
export function pruneAnchors(blocks: Block[]): void {
  const used = new Set<string>();
  const visit = (runs: Run[]): void => {
    for (const r of runs) {
      if (isRefRun(r)) used.add(r.ref);
      else if (isFootnoteRun(r)) visit(r.footnote);
    }
  };
  for (const p of allParagraphs(blocks)) visit(p.runs);
  for (const p of allParagraphs(blocks)) if (p.id && !used.has(p.id) && !p.runs.some(isSeqRun)) delete p.id;
}

/** Runs split at blank lines (`\n\n`) into paragraphs (footnotes hold several). */
export function splitParagraphs(runs: Run[]): Run[][] {
  const out: Run[][] = [[]];
  for (const run of runs) {
    if (!('text' in run) || !run.text.includes('\n\n')) {
      out[out.length - 1]!.push(run);
      continue;
    }
    run.text.split(/\n\n+/).forEach((part, i) => {
      if (i > 0) out.push([]);
      if (part) out[out.length - 1]!.push({ ...run, text: part });
    });
  }
  return out;
}

/** Plain text of runs (footnotes and atoms left out). */
export const runsText = (runs: Run[]): string => runs.map((r) => ('text' in r ? r.text : '')).join('');

export function emptyDocument(): RichDocument {
  return { blocks: [paragraph('')], resources: new Map(), meta: {} };
}

export function paragraph(text: string, opts: Partial<Omit<Paragraph, 'type' | 'runs'>> = {}): Paragraph {
  return { type: 'paragraph', style: opts.style ?? 'normal', ...opts, runs: text ? [{ text }] : [] };
}

const FORMAT_KEYS: (keyof TextFormat)[] = ['bold', 'italic', 'underline', 'strike', 'smallCaps', 'code', 'link', 'size', 'color', 'font', 'highlight', 'mdComment', 'rawHtml'];

const commentKey = (f: TextFormat): string => (f.comments?.length ? [...f.comments].sort().join(' ') : '');
const revisionKey = (r: Revision | undefined): string => (r ? `${r.author ?? ''}\u0000${r.date ?? ''}` : '');

export function sameFormat(a: TextFormat, b: TextFormat): boolean {
  return (
    FORMAT_KEYS.every((k) => (a[k] || undefined) === (b[k] || undefined)) &&
    commentKey(a) === commentKey(b) &&
    revisionKey(a.inserted) === revisionKey(b.inserted) &&
    revisionKey(a.deleted) === revisionKey(b.deleted)
  );
}

/** Copy only the truthy formatting flags (keeps objects minimal). */
export function cleanFormat(f: TextFormat): TextFormat {
  const out: TextFormat = {};
  for (const k of FORMAT_KEYS) {
    const v = f[k];
    if (v) (out as Record<string, unknown>)[k] = v;
  }
  if (f.comments?.length) out.comments = [...f.comments];
  if (f.inserted) out.inserted = { ...f.inserted };
  if (f.deleted) out.deleted = { ...f.deleted };
  return out;
}

/** Merge adjacent text runs with identical formatting; drop empty runs. */
export function normalizeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (!isTextRun(run)) {
      out.push(run);
      continue;
    }
    if (!run.text) continue;
    const prev = out[out.length - 1];
    if (prev && isTextRun(prev) && sameFormat(prev, run)) {
      prev.text += run.text;
    } else {
      out.push({ text: run.text, ...cleanFormat(run) });
    }
  }
  return out;
}

export function paragraphText(p: Paragraph): string {
  return p.runs.map((r) => (isTextRun(r) ? r.text : '')).join('');
}

function blockText(b: Block): string[] {
  if (b.type === 'paragraph') return [paragraphText(b)];
  if (b.type === 'table') return b.rows.flatMap((row) => row.flatMap((c) => c.blocks.map(paragraphText)));
  return [];
}

export function plainText(doc: RichDocument): string {
  return doc.blocks.flatMap(blockText).join('\n');
}

export function wordCount(doc: RichDocument): { words: number; characters: number } {
  const text = plainText(doc);
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return { words, characters: text.replace(/\n/g, '').length };
}

/** Options shared by writers that need equations converted to MathML. */
export interface WriteOptions {
  /** LaTeX -> MathML conversions prepared asynchronously (see `prepareMath`). */
  mathml?: Map<string, string>;
  /** Diagram source -> rendered picture, prepared asynchronously (DIAG-005). */
  diagrams?: Map<string, RenderedDiagram>;
  /** PNG versions of the SVG pictures, by resource key (DRAW-007). */
  svgPng?: Map<string, Uint8Array>;
}

/** A diagram rasterised for formats that cannot render its source. */
export interface RenderedDiagram {
  png: Uint8Array;
  /** Display size in CSS pixels. */
  width: number;
  height: number;
}

/** Every distinct diagram source used in the blocks. */
export function collectDiagrams(blocks: Block[]): string[] {
  const out = new Set<string>();
  const visit = (bs: Block[]): void => {
    for (const b of bs) {
      if (b.type === 'paragraph') for (const r of b.runs) {
        if ('diagram' in r) out.add(r.diagram);
        // Footnotes hold equations too (DOC-022).
        if ('footnote' in r) for (const n of r.footnote) if ('diagram' in n) out.add(n.diagram);
      }
      if (b.type === 'table') for (const row of b.rows) for (const c of row) visit(c.blocks);
    }
  };
  visit(blocks);
  return [...out];
}

/** Every distinct LaTeX source used in the blocks. */
export function collectMath(blocks: Block[]): string[] {
  const out = new Set<string>();
  const visit = (bs: Block[]): void => {
    for (const b of bs) {
      if (b.type === 'paragraph') for (const r of b.runs) {
        if ('math' in r) out.add(r.math);
        // Footnotes hold equations too (DOC-022).
        if ('footnote' in r) for (const n of r.footnote) if ('math' in n) out.add(n.math);
      }
      if (b.type === 'table') for (const row of b.rows) for (const c of row) visit(c.blocks);
    }
  };
  visit(blocks);
  return [...out];
}

// --- lists -------------------------------------------------------------------

export interface ListItemNode {
  paragraph?: Paragraph;
  children: ListNode[];
}

export interface ListNode {
  ordered: boolean;
  items: ListItemNode[];
}

/**
 * Turn a sequence of list paragraphs (flat, with levels) into nested lists.
 * A change of list type at the same level starts a new sibling list.
 */
export function nestLists(paragraphs: Paragraph[]): ListNode[] {
  const roots: ListNode[] = [];
  const stack: { level: number; list: ListNode; last?: ListItemNode }[] = [];

  const openList = (level: number, ordered: boolean): void => {
    const list: ListNode = { ordered, items: [] };
    const top = stack[stack.length - 1];
    if (!top) {
      roots.push(list);
    } else {
      let parent = top.last;
      if (!parent) {
        parent = { children: [] };
        top.list.items.push(parent);
        top.last = parent;
      }
      parent.children.push(list);
    }
    stack.push({ level, list });
  };

  for (const p of paragraphs) {
    const level = p.list?.level ?? 0;
    const ordered = p.list?.ordered ?? false;
    while (stack.length && stack[stack.length - 1]!.level > level) stack.pop();
    let top = stack[stack.length - 1];
    if (top && top.level === level && top.list.ordered !== ordered) {
      stack.pop();
      top = undefined;
      openList(level, ordered);
    } else if (!top || top.level < level) {
      openList(level, ordered);
    }
    top = stack[stack.length - 1]!;
    const item: ListItemNode = { paragraph: p, children: [] };
    top.list.items.push(item);
    top.last = item;
  }
  return roots;
}

/**
 * Split consecutive list paragraphs into independent lists: a new list starts
 * when a top-level item changes type (bullet <-> numbered).
 */
export function splitListSegments(items: Paragraph[]): Paragraph[][] {
  const segments: Paragraph[][] = [];
  let topOrdered: boolean | undefined;
  for (const p of items) {
    const level = p.list?.level ?? 0;
    const ordered = !!p.list?.ordered;
    const current = segments[segments.length - 1];
    if (!current || (level === 0 && topOrdered !== undefined && topOrdered !== ordered)) {
      segments.push([p]);
      topOrdered = level === 0 ? ordered : undefined;
    } else {
      current.push(p);
      if (level === 0 && topOrdered === undefined) topOrdered = ordered;
    }
  }
  return segments;
}

/** Split blocks into runs of consecutive list paragraphs and other blocks. */
export function groupBlocks(blocks: Block[]): (Block | { type: 'list'; items: Paragraph[] })[] {
  const out: (Block | { type: 'list'; items: Paragraph[] })[] = [];
  for (const b of blocks) {
    if (b.type === 'paragraph' && b.list) {
      const last = out[out.length - 1];
      if (last && last.type === 'list') last.items.push(b);
      else out.push({ type: 'list', items: [b] });
    } else {
      out.push(b);
    }
  }
  return out;
}

// --- resources -----------------------------------------------------------------

/** Fast non-cryptographic 64-bit hash (cyrb53 x2), hex encoded. */
export function hashBytes(data: Uint8Array): string {
  let h1 = 0xdeadbeef ^ data.length;
  let h2 = 0x41c6ce57 ^ data.length;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i]!;
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/** Add a resource (deduplicated by content) and return its key. */
export function addResource(doc: { resources: Map<string, Resource> }, data: Uint8Array, mediaType: string, name?: string): string {
  const key = hashBytes(data);
  if (!doc.resources.has(key)) doc.resources.set(key, { data, mediaType, ...(name ? { name } : {}) });
  return key;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
};

export function extensionForType(mediaType: string): string {
  return EXT_BY_TYPE[mediaType] ?? 'bin';
}

export function mediaTypeForName(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const found = Object.entries(EXT_BY_TYPE).find(([, e]) => e === ext);
  if (found) return found[0];
  if (ext === 'jpeg') return 'image/jpeg';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'md' || ext === 'markdown') return 'text/markdown';
  return 'application/octet-stream';
}

// --- table of contents (DOC-023) ------------------------------------------------

export interface TocEntry {
  /** 1 for Heading 1… */
  level: number;
  text: string;
  /** Index of the heading in the blocks. */
  index: number;
}

/** The headings listed by a table of contents, in document order. */
export function tocEntries(blocks: Block[], levels = 3): TocEntry[] {
  const out: TocEntry[] = [];
  blocks.forEach((b, index) => {
    const m = b.type === 'paragraph' ? /^h(\d)$/.exec(b.style) : null;
    if (!m || b.type !== 'paragraph') return;
    const level = Number(m[1]);
    const text = runsText(b.runs).replace(/\s+/g, ' ').trim();
    if (level <= levels && text) out.push({ level, text, index });
  });
  return out;
}
