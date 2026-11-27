/**
 * Bridge between the document model and the editor DOM (DOC-003), also used
 * to sanitise pasted HTML (DOC-008): anything outside the supported subset is
 * reduced to text, and unsafe URLs/elements are dropped.
 */
import { ALL_LANGS } from './code-langs';
import { columnsCss } from './columns';
import {
  cleanFormat,
  groupBlocks,
  columnSegments,
  inColumns,
  isImageRun,
  isCodeCellRun,
  isDiagramRun,
  isMathRun,
  isFootnoteRun,
  isTextRun,
  nestLists,
  normalizeRuns,
  tocEntries,
  MONO_FONT,
  type Align,
  type Block,
  type CodeCellRun,
  type DiagramLang,
  type ListInfo,
  type ListNode,
  type Paragraph,
  type ParagraphLayout,
  type ParagraphStyle,
  type Run,
  type Table,
  type TableCell,
  type TextFormat,
  crossTargets,
  isSeqRun,
  isFieldRun,
  FIELD_FORMATS,
  type FieldFormat,
  isInputRun,
  isInputKind,
  type InputRun,
  isFillRun,
  type FillRun,
  type Space,
  isFieldKind,
  fieldValue,
  type FieldContext,
  type FieldKind,
  isRefRun,
  refLabel,
  seqKindOf,
  seqText,
  isCiteRun,
  type CiteRun,
  type References,
  type SeqKind,
} from './model';
import { citations, formatEntry, type Citations } from './bibliography';
import { diagramLangOf } from './diagram';
import { t } from '../i18n';

/** Accept http(s), mailto, tel, fragment and relative URLs only. */
export function isSafeUrl(url: string): boolean {
  // eslint-disable-next-line no-control-regex
  const u = url.replace(/[\u0000- ]/g, '').toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(u);
  if (!scheme) return true;
  return ['http', 'https', 'mailto', 'tel'].includes(scheme[1]!);
}

export interface ImageInfo {
  url: string;
}

// --- model -> DOM -----------------------------------------------------------

/** Numbers and targets of the document being rendered (DOC-026). */
let xref: ReturnType<typeof crossTargets> | undefined;

/** Citations of the document being rendered (DOC-027). */
let cites: Citations | undefined;

/** What the fields of the document being rendered show (DOC-041). */
let fieldCtx: FieldContext | undefined;

export function blocksToDom(
  blocks: Block[],
  doc: Document,
  resolveImage: (key: string) => ImageInfo | undefined,
  references?: References,
  fields?: FieldContext,
): DocumentFragment {
  const outer = [xref, cites, fieldCtx] as const;
  xref = crossTargets(blocks);
  cites = citations(blocks, references);
  fieldCtx = fields;
  try {
    // DOC-049: text in columns in a div with CSS columns.
    const frag = doc.createDocumentFragment();
    for (const set of columnSegments(blocks)) {
      const inner = blocksToDomInner(set.blocks, doc, resolveImage, blocks);
      if (!set.columns) {
        frag.append(inner);
        continue;
      }
      const div = doc.createElement('div');
      div.className = 'columns';
      div.dataset.count = String(set.columns.count);
      if (set.columns.gap !== undefined) div.dataset.gap = String(set.columns.gap);
      if (set.columns.rule) div.dataset.rule = '';
      div.setAttribute('style', columnsCss(set.columns.count, set.columns.gap, !!set.columns.rule));
      div.append(inner);
      frag.append(div);
    }
    return frag;
  } finally {
    [xref, cites, fieldCtx] = outer;
  }
}

/** A field as shown: its current value (DOC-041). */
export function fieldElement(kind: FieldKind, value: string, doc: Document = document, run?: { format?: FieldFormat; fixed?: string }): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'field';
  span.dataset.field = kind;
  if (run?.format) span.dataset.format = run.format;
  if (run?.fixed) span.dataset.fixed = run.fixed;
  span.textContent = value;
  return span;
}

/**
 * FORM-003: a form field as a real control in its span, which keeps its name
 * and kind: an HTML page of the document is a web form.
 */
export function inputElement(run: InputRun, doc: Document = document): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'form-input';
  span.dataset.input = run.input;
  span.dataset.name = run.name;
  if (run.required) span.dataset.required = '';
  let control: HTMLInputElement | HTMLSelectElement;
  if (run.input === 'dropdown') {
    const select = doc.createElement('select');
    const blank = doc.createElement('option');
    blank.value = '';
    select.append(blank);
    for (const o of run.options ?? []) {
      const opt = doc.createElement('option');
      opt.value = opt.textContent = o;
      if (o === run.value) opt.setAttribute('selected', '');
      select.append(opt);
    }
    control = select;
  } else {
    const input = doc.createElement('input');
    input.type = run.input === 'checkbox' ? 'checkbox' : 'text';
    if (run.input === 'checkbox') {
      if (run.checked) input.setAttribute('checked', '');
    } else input.setAttribute('value', run.value ?? '');
    control = input;
  }
  control.name = run.name;
  control.setAttribute('aria-label', run.name);
  if (run.required) control.required = true;
  span.append(control);
  return span;
}

/** The form field of a span made by `inputElement`, with the answer its control holds. */
export function inputOfElement(el: HTMLElement): InputRun | undefined {
  const kind = el.dataset.input ?? '';
  const name = el.dataset.name;
  if (!isInputKind(kind) || !name) return undefined;
  const control = el.querySelector('input, select') as HTMLInputElement | HTMLSelectElement | null;
  const run: InputRun = { input: kind, name };
  if (kind === 'checkbox') run.checked = !!(control as HTMLInputElement | null)?.checked;
  else if (control?.value) run.value = control.value;
  if (kind === 'dropdown') run.options = control ? Array.from((control as HTMLSelectElement).options, (o) => o.value).filter(Boolean) : [];
  if (el.dataset.required !== undefined) run.required = true;
  return run;
}

/** A citation as shown: `[1]` or `(Knuth, 1984)` (DOC-027). */
export function citeElement(cite: CiteRun, text: string, doc: Document = document): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'cite';
  span.dataset.cite = cite.cite.join(' ');
  if (cite.locator) span.dataset.locator = cite.locator;
  span.textContent = text;
  return span;
}

/** The list of cited references (DOC-027). */
export function bibliographyElement(c: Citations, numeric: boolean, doc: Document = document): HTMLElement {
  const section = doc.createElement('section');
  section.className = 'bibliography';
  section.dataset.bibliography = '';
  const title = doc.createElement('p');
  title.className = 'bibliography-title';
  title.textContent = t('bib.title');
  const list = doc.createElement(numeric ? 'ol' : 'ul');
  for (const e of c.cited) {
    const li = doc.createElement('li');
    li.id = `ref-${e.key}`;
    if (numeric) li.dataset.label = `[${c.numbers.get(e.key)}]`;
    appendRuns(li, formatEntry(e), doc, () => undefined);
    if (li.lastChild?.nodeName === 'BR') li.lastChild.remove();
    list.append(li);
  }
  section.append(title, list);
  if (!c.cited.length) {
    const hint = doc.createElement('p');
    hint.className = 'bibliography-empty';
    hint.textContent = t('bib.empty');
    section.append(hint);
  }
  return section;
}

function blocksToDomInner(
  blocks: Block[],
  doc: Document,
  resolveImage: (key: string) => ImageInfo | undefined,
  all: Block[] = blocks,
): DocumentFragment {
  const frag = doc.createDocumentFragment();
  let quote: HTMLElement | null = null;

  for (const group of groupBlocks(blocks)) {
    const isQuote = group.type === 'paragraph' && group.style === 'quote';
    if (!isQuote) quote = null;
    if (group.type === 'list') {
      for (const list of nestLists(group.items)) frag.append(listToDom(list, doc, resolveImage));
    } else if (group.type === 'table') {
      frag.append(tableToDom(group, doc, resolveImage));
    } else if (group.type === 'toc') {
      frag.append(tocElement(all, group.levels ?? 3, doc));
    } else if (group.type === 'space') {
      frag.append(spaceElement(group, doc));
    } else if (group.type === 'include') {
      frag.append(includeElement(group.src, doc));
    } else if (group.type === 'bibliography') {
      frag.append(bibliographyElement(cites ?? citations([], undefined), cites?.numeric ?? true, doc));
    } else if (group.type === 'rule') {
      const hr = doc.createElement('hr');
      if (group.page) {
        hr.className = 'page-break';
        hr.style.breakAfter = 'page';
      } else if (group.column) {
        hr.className = 'column-break';
        hr.style.breakAfter = 'column';
      }
      frag.append(hr);
    } else if (isQuote) {
      if (!quote) {
        quote = doc.createElement('blockquote');
        frag.append(quote);
      }
      quote.append(paragraphToDom(group, 'p', doc, resolveImage));
    } else {
      frag.append(paragraphToDom(group, tagFor(group.style), doc, resolveImage));
    }
  }
  return frag;
}

function tagFor(style: ParagraphStyle): string {
  if (style === 'normal' || style === 'quote' || style === 'caption') return 'p';
  if (style === 'code') return 'pre';
  return style;
}

/** A table of contents as a navigation list of the headings (DOC-023). */
export function tocElement(blocks: Block[], levels: number, doc: Document): HTMLElement {
  const nav = doc.createElement('nav');
  nav.className = 'toc';
  nav.dataset.levels = String(levels);
  const title = doc.createElement('p');
  title.className = 'toc-title';
  title.textContent = t('toc.title');
  const list = doc.createElement('ol');
  for (const e of tocEntries(blocks, levels)) {
    const li = doc.createElement('li');
    li.className = `toc-${e.level}`;
    li.dataset.index = String(e.index);
    li.textContent = e.text;
    list.append(li);
  }
  nav.append(title, list);
  return nav;
}

/** A CSS font-family value for a font name, with a generic fallback. */
export function cssFontFamily(font: string): string {
  const generic = /mono|courier|consol/i.test(font) ? 'monospace' : /serif|times|georgia|garamond|cambria|book/i.test(font) && !/sans/i.test(font) ? 'serif' : 'sans-serif';
  return `"${font.replace(/["\\]/g, '')}", ${generic}`;
}

/** Paragraph spacing as CSS (DOC-020). */
export function layoutStyle(p: ParagraphLayout): Partial<CSSStyleDeclaration> {
  const css: Partial<CSSStyleDeclaration> = {};
  if (p.indent) css.marginLeft = `${p.indent}pt`;
  if (p.firstLine) css.textIndent = `${p.firstLine}pt`;
  if (p.spaceBefore !== undefined) css.marginTop = `${p.spaceBefore}pt`;
  if (p.spaceAfter !== undefined) css.marginBottom = `${p.spaceAfter}pt`;
  if (p.lineHeight) css.lineHeight = String(p.lineHeight * 1.2);
  return css;
}

function paragraphToDom(p: Paragraph, tag: string, doc: Document, resolveImage: (key: string) => ImageInfo | undefined): HTMLElement {
  const el = doc.createElement(tag);
  if (p.align && p.align !== 'left') el.style.textAlign = p.align;
  Object.assign(el.style, layoutStyle(p));
  if (p.style === 'caption') el.className = 'caption';
  if (p.id) {
    el.id = p.id;
    el.dataset.anchor = p.id;
  }
  appendRuns(el, p.runs, doc, resolveImage);
  return el;
}

/** Runs as DOM nodes (text formatting, links, equations), e.g. to list footnotes. */
export function markdownInline(runs: Run[], doc: Document = document): Node[] {
  const holder = doc.createElement('span');
  appendRuns(holder, runs, doc, () => undefined);
  if (holder.lastChild?.nodeName === 'BR') holder.lastChild.remove();
  return Array.from(holder.childNodes);
}

/** A footnote reference: its content travels as JSON (DOC-022). */
export function footnoteElement(runs: Run[], doc: Document): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'footnote';
  span.dataset.footnote = JSON.stringify(runs);
  span.contentEditable = 'false';
  span.title = runs.map((r) => ('text' in r ? r.text : 'math' in r ? `$${r.math}$` : '')).join('');
  return span;
}

/** Footnote runs read back from an element made by {@link footnoteElement}. */
export function footnoteFromDom(el: HTMLElement): Run[] | undefined {
  try {
    const runs = JSON.parse(el.dataset.footnote ?? '') as unknown;
    if (!Array.isArray(runs)) return undefined;
    // Only text and equations: nothing that could smuggle markup or resources in.
    return normalizeRuns(
      runs.flatMap((r: Record<string, unknown>): Run[] => {
        if (typeof r?.text === 'string') return [{ text: r.text, ...cleanFormat(r as TextFormat) }];
        if (typeof r?.math === 'string') return [{ math: r.math, ...(r.display === true ? { display: true } : {}) }];
        return [];
      }),
    ).map((r) => ('text' in r && r.link && !isSafeUrl(r.link) ? { ...r, link: undefined } : r));
  } catch {
    return undefined;
  }
}

function appendRuns(el: HTMLElement, runs: Run[], doc: Document, resolveImage: (key: string) => ImageInfo | undefined): void {
  for (const run of runs) {
    if (isFootnoteRun(run)) {
      el.append(footnoteElement(run.footnote, doc));
      continue;
    }
    if (isSeqRun(run)) {
      el.append(seqElement(run.seq, xref?.numbers.get(run) ?? 1, doc));
      continue;
    }
    if (isFieldRun(run)) {
      el.append(fieldElement(run.field, fieldValue(run.field, fieldCtx, run), doc, run));
      continue;
    }
    if (isInputRun(run)) {
      el.append(inputElement(run, doc));
      continue;
    }
    if (isFillRun(run)) {
      el.append(fillElement(run, doc));
      el.classList.add('has-hfill');
      continue;
    }
    if (isCiteRun(run)) {
      el.append(citeElement(run, cites ? cites.text(run) : `[${run.cite.join(', ')}]`, doc));
      continue;
    }
    if (isRefRun(run)) {
      el.append(refElement(run.ref, xref ? refLabel(xref.targets, run.ref) : '??', doc));
      continue;
    }
    if (isMathRun(run)) {
      el.append(mathElement(run.math, !!run.display, doc));
      continue;
    }
    if (isDiagramRun(run)) {
      el.append(diagramElement(run.diagram, run.lang, doc));
      continue;
    }
    if (isCodeCellRun(run)) {
      el.append(codeCellElement(run, doc, resolveImage));
      continue;
    }
    if (isImageRun(run)) {
      const info = resolveImage(run.image);
      if (!info) continue;
      const img = doc.createElement('img');
      img.src = info.url;
      img.alt = run.alt ?? '';
      img.dataset.resource = run.image;
      if (run.width) img.width = Math.round(run.width);
      if (run.height) img.height = Math.round(run.height);
      el.append(img);
      continue;
    }
    let node: Node = textWithBreaks(run.text, doc);
    const wrap = (tag: string): void => {
      const w = doc.createElement(tag);
      w.append(node);
      node = w;
    };
    if (run.size || run.color || run.font || run.highlight) {
      const span = doc.createElement('span');
      if (run.size) span.style.fontSize = `${run.size}pt`;
      if (run.color) span.style.color = run.color;
      if (run.font) span.style.fontFamily = cssFontFamily(run.font);
      if (run.highlight) span.style.backgroundColor = run.highlight;
      span.append(node);
      node = span;
    }
    if (run.code) wrap('code');
    if (run.strike) wrap('s');
    if (run.smallCaps) {
      const span = doc.createElement('span');
      span.className = 'smallcaps';
      span.append(node);
      node = span;
    }
    if (run.underline) wrap('u');
    if (run.italic) wrap('em');
    if (run.bold) wrap('strong');
    if (run.link && isSafeUrl(run.link)) {
      const a = doc.createElement('a');
      a.href = run.link;
      a.append(node);
      node = a;
    }
    el.append(node);
  }
  if (!el.hasChildNodes() || el.lastChild?.nodeName === 'BR') el.append(doc.createElement('br'));
}

/**
 * A code cell: its source and its last output (CODE-001, CODE-005). The
 * editor adds the Run / Edit controls; the document content is read back from
 * the source, output and figure elements.
 */
export function codeCellElement(run: CodeCellRun, doc: Document, resolveImage: (key: string) => ImageInfo | undefined): HTMLElement {
  const cell = doc.createElement('span');
  cell.className = 'code-cell';
  cell.dataset.lang = run.lang;
  if (run.header !== undefined) cell.dataset.header = run.header;
  cell.contentEditable = 'false';
  // CODE-013: only the output of a cell whose code is hidden is shown (and printed).
  if (run.hidden) {
    cell.classList.add('code-hidden');
    cell.dataset.hidden = 'true';
  }
  const source = doc.createElement('span');
  source.className = 'code-cell-source';
  // CAS-001: a math cell is an equation, its result too (one per line).
  const math = run.lang === 'math';
  if (math) {
    if (run.engine) cell.dataset.engine = run.engine;
    source.append(mathElement(run.cell, true, doc));
  } else source.textContent = run.cell;
  cell.append(source);
  if (run.output) {
    const output = doc.createElement('span');
    output.className = run.output.error ? 'code-cell-output error' : 'code-cell-output';
    if (math && !run.output.error) {
      output.classList.add('math-result');
      for (const line of run.output.text.split('\n').filter((l) => l.trim())) output.append(mathElement(line, true, doc));
    } else output.textContent = run.output.text;
    cell.append(output);
    const figures = doc.createElement('span');
    figures.className = 'code-cell-figures';
    for (const key of run.output.images ?? []) {
      const info = resolveImage(key);
      if (!info) continue;
      const img = doc.createElement('img');
      img.src = info.url;
      img.alt = 'Output';
      img.dataset.resource = key;
      figures.append(img);
    }
    if (figures.childElementCount) cell.append(figures);
    // CODE-016: widgets are drawn live by the editor; their picture stands for them elsewhere.
    if (run.output.widgets?.length) {
      const widgets = doc.createElement('span');
      widgets.className = 'code-cell-widgets';
      for (const w of run.output.widgets) {
        const slot = doc.createElement('span');
        slot.className = 'code-cell-widget';
        slot.dataset.model = w.id;
        const info = w.snapshot ? resolveImage(w.snapshot) : undefined;
        if (info) {
          const img = doc.createElement('img');
          img.src = info.url;
          img.alt = 'Widget';
          img.dataset.resource = w.snapshot;
          slot.append(img);
        }
        widgets.append(slot);
      }
      cell.append(widgets);
    }
  }
  return cell;
}


function codeCellFromDom(el: HTMLElement, lookupImage: (img: HTMLImageElement) => string | undefined): CodeCellRun | undefined {
  const lang = ALL_LANGS.find((l) => l === el.dataset.lang);
  if (!lang) return undefined;
  const run: CodeCellRun = { cell: el.querySelector('.code-cell-source')?.textContent ?? '', lang, ...(el.dataset.header !== undefined ? { header: el.dataset.header } : {}) };
  // A run in progress shows its status there: not part of the document.
  const output = el.querySelector<HTMLElement>('.code-cell-output:not(.pending)');
  if (output) {
    run.output = { text: output.textContent ?? '' };
    if (output.classList.contains('error')) run.output.error = true;
    const images = Array.from(el.querySelectorAll<HTMLImageElement>('.code-cell-figures img'))
      .map(lookupImage)
      .filter((k): k is string => !!k);
    if (images.length) run.output.images = images;
    const widgets = Array.from(el.querySelectorAll<HTMLElement>('.code-cell-widget[data-model]')).map((w) => {
      const img = w.querySelector('img');
      const snapshot = img ? lookupImage(img) : undefined;
      return { id: w.dataset.model!, ...(snapshot ? { snapshot } : {}) };
    });
    if (widgets.length) run.output.widgets = widgets;
  }
  return run;
}

/** Placeholder element for a diagram; editors upgrade it to a rendered picture (DIAG-001). */
export function diagramElement(source: string, lang: DiagramLang, doc: Document): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'diagram';
  span.dataset.diagram = lang;
  span.dataset.source = source;
  span.contentEditable = 'false';
  span.textContent = source;
  return span;
}

/** Placeholder element for an equation; editors upgrade it to rendered math. */
export function mathElement(latex: string, display: boolean, doc: Document): HTMLElement {
  const span = doc.createElement('span');
  span.className = display ? 'math display' : 'math';
  span.dataset.latex = latex;
  if (display) span.dataset.display = 'true';
  span.contentEditable = 'false';
  span.textContent = display ? `$$${latex}$$` : `$${latex}$`;
  return span;
}

function textWithBreaks(text: string, doc: Document): Node {
  const parts = text.split('\n');
  if (parts.length === 1) return doc.createTextNode(text);
  const frag = doc.createDocumentFragment();
  parts.forEach((part, i) => {
    if (i > 0) frag.append(doc.createElement('br'));
    if (part) frag.append(doc.createTextNode(part));
  });
  return frag;
}

function listToDom(list: ListNode, doc: Document, resolveImage: (key: string) => ImageInfo | undefined): HTMLElement {
  const el = doc.createElement(list.ordered ? 'ol' : 'ul');
  for (const item of list.items) {
    const li = doc.createElement('li');
    if (item.paragraph) {
      if (item.paragraph.align && item.paragraph.align !== 'left') li.style.textAlign = item.paragraph.align;
      appendRuns(li, item.paragraph.runs, doc, resolveImage);
      if (item.children.length && li.lastChild?.nodeName === 'BR' && item.paragraph.runs.length) li.lastChild.remove();
    }
    for (const child of item.children) li.append(listToDom(child, doc, resolveImage));
    el.append(li);
  }
  return el;
}

function tableToDom(t: Table, doc: Document, resolveImage: (key: string) => ImageInfo | undefined): HTMLElement {
  const table = doc.createElement('table');
  const body = doc.createElement('tbody');
  t.rows.forEach((row, r) => {
    const tr = doc.createElement('tr');
    for (const cell of row) {
      const td = doc.createElement(r === 0 && t.header ? 'th' : 'td');
      if ((cell.colSpan ?? 1) > 1) td.colSpan = cell.colSpan!;
      if ((cell.rowSpan ?? 1) > 1) td.rowSpan = cell.rowSpan!;
      td.append(blocksToDom(cell.blocks.length ? cell.blocks : [{ type: 'paragraph', style: 'normal', runs: [] }], doc, resolveImage));
      tr.append(td);
    }
    // The header row repeats on each printed page.
    if (r === 0 && t.header) {
      const head = doc.createElement('thead');
      head.append(tr);
      table.append(head);
    } else body.append(tr);
  });
  table.append(body);
  return table;
}

// --- DOM -> model -----------------------------------------------------------

const SKIP = new Set([
  'script', 'style', 'template', 'head', 'meta', 'title', 'link', 'noscript',
  'iframe', 'object', 'embed', 'svg', 'math', 'canvas', 'video', 'audio',
  'input', 'button', 'select', 'textarea', 'form', 'colgroup', 'col',
]);
const BLOCK = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol',
  'li', 'table', 'hr', 'section', 'article', 'header', 'footer', 'main', 'nav',
  'aside', 'figure', 'figcaption', 'address', 'dl', 'dt', 'dd', 'body', 'html',
  'center', 'details', 'summary', 'caption',
]);

interface BlockCtx {
  style: ParagraphStyle;
  align?: Align;
  list?: ListInfo;
  listDepth: number;
  ordered: boolean;
  pre: boolean;
  /** Cross-reference anchor of the block (DOC-026). */
  anchor?: string;
}

export interface DomToBlocksOptions {
  /** Keep whitespace as typed (editor uses `white-space: pre-wrap`). */
  preserveWhitespace?: boolean;
}

export function domToBlocks(
  root: Node,
  lookupImage: (img: HTMLImageElement) => string | undefined,
  opts: DomToBlocksOptions = {},
): Block[] {
  const blocks: Block[] = [];
  let current: Paragraph | null = null;

  const flush = (): void => {
    if (!current) return;
    const runs = current.runs;
    const last = runs[runs.length - 1];
    // A trailing <br> is the browser's placeholder for an empty line end.
    if (last && isTextRun(last) && last.text.endsWith('\n') && !current.list) last.text = last.text.slice(0, -1);
    if (last && isTextRun(last) && current.list) last.text = last.text.replace(/\n$/, '');
    current.runs = normalizeRuns(runs);
    if (current.style !== 'code') trimParagraph(current, !!opts.preserveWhitespace);
    blocks.push(current);
    current = null;
  };

  const open = (ctx: BlockCtx): Paragraph => {
    if (!current) {
      current = { type: 'paragraph', style: ctx.style, runs: [] };
      if (ctx.anchor) current.id = ctx.anchor;
      if (ctx.align) current.align = ctx.align;
      if (ctx.list) current.list = { ...ctx.list };
    }
    return current;
  };

  const walk = (node: Node, fmt: TextFormat, ctx: BlockCtx): void => {
    if (node.nodeType === 3) {
      let text = node.nodeValue ?? '';
      if (!ctx.pre && !opts.preserveWhitespace) text = text.replace(/[ \t\r\n\f]+/g, ' ');
      text = text.replace(/ /g, ' ');
      if (!current && !ctx.pre && !text.trim()) return;
      if (!text) return;
      open(ctx).runs.push({ text, ...cleanFormat(fmt) });
      return;
    }
    if (node.nodeType !== 1) {
      if (node.nodeType === 11) for (const c of Array.from(node.childNodes)) walk(c, fmt, ctx);
      return;
    }
    const el = node as HTMLElement;
    const tag = el.localName.toLowerCase();
    if (SKIP.has(tag)) return;

    if (tag === 'br') {
      open(ctx).runs.push({ text: '\n', ...cleanFormat(fmt) });
      return;
    }
    if (tag === 'nav' && el.classList.contains('toc')) {
      flush();
      const levels = Number(el.dataset.levels) || 3;
      blocks.push(levels === 3 ? { type: 'toc' } : { type: 'toc', levels });
      return;
    }
    if (el.dataset?.footnote !== undefined && el.classList.contains('footnote')) {
      const note = footnoteFromDom(el);
      if (note) open(ctx).runs.push({ footnote: note });
      return;
    }
    if (el.dataset?.hfill !== undefined && el.classList.contains('hfill')) {
      open(ctx).runs.push({ hfill: Number(el.dataset.hfill) || 1 });
      return;
    }
    if (el.classList?.contains('space') && el.tagName === 'DIV') {
      flush();
      const stretch = Number(el.dataset.stretch) || undefined;
      const size = el.dataset.size !== undefined ? Number(el.dataset.size) : undefined;
      const fraction = Number(el.dataset.fraction) || undefined;
      blocks.push({ type: 'space', ...(stretch ? { stretch } : {}), ...(!stretch && fraction ? { fraction } : {}), ...(size !== undefined ? { size } : {}) });
      return;
    }
    if (el.dataset?.input !== undefined && el.classList.contains('form-input')) {
      const input = inputOfElement(el);
      if (input) open(ctx).runs.push(input);
      return;
    }
    if (el.dataset?.field !== undefined && el.classList.contains('field') && isFieldKind(el.dataset.field)) {
      const format = el.dataset.format && (FIELD_FORMATS as readonly string[]).includes(el.dataset.format) ? (el.dataset.format as FieldFormat) : undefined;
      open(ctx).runs.push({ field: el.dataset.field, ...(format ? { format } : {}), ...(el.dataset.fixed ? { fixed: el.dataset.fixed } : {}) });
      return;
    }
    if (el.dataset?.seq !== undefined && el.classList.contains('seq')) {
      open(ctx).runs.push({ seq: seqKindOf(el.dataset.seq) });
      return;
    }
    if (el.dataset?.cite !== undefined && el.classList.contains('cite')) {
      const keys = el.dataset.cite.split(/\s+/).filter(Boolean);
      if (keys.length) open(ctx).runs.push(el.dataset.locator ? { cite: keys, locator: el.dataset.locator } : { cite: keys });
      return;
    }
    if (el.dataset?.include !== undefined && el.classList.contains('include')) {
      flush();
      if (el.dataset.include) blocks.push({ type: 'include', src: el.dataset.include });
      return;
    }
    if (el.dataset?.bibliography !== undefined && el.classList.contains('bibliography')) {
      flush();
      blocks.push({ type: 'bibliography' });
      return;
    }
    if (el.dataset?.ref !== undefined && el.classList.contains('xref')) {
      open(ctx).runs.push({ ref: el.dataset.ref });
      return;
    }
    if (el.dataset?.latex !== undefined && el.classList.contains('math')) {
      const run: Run = { math: el.dataset.latex };
      if (el.dataset.display === 'true') run.display = true;
      open(ctx).runs.push(run);
      return;
    }
    if (el.classList.contains('code-cell')) {
      const run = codeCellFromDom(el, lookupImage);
      if (run) open(ctx).runs.push(run);
      return;
    }
    if (el.dataset?.source !== undefined && el.classList.contains('diagram')) {
      const lang = diagramLangOf(el.dataset.diagram);
      if (lang) open(ctx).runs.push({ diagram: el.dataset.source, lang });
      return;
    }
    if (tag === 'img') {
      const key = lookupImage(el as HTMLImageElement);
      if (key) {
        const img = el as HTMLImageElement;
        const run: Run = { image: key };
        if (img.alt) run.alt = img.alt;
        const w = Number(img.getAttribute('width'));
        const hgt = Number(img.getAttribute('height'));
        if (w > 0) run.width = w;
        if (hgt > 0) run.height = hgt;
        open(ctx).runs.push(run);
      }
      return;
    }
    if (!BLOCK.has(tag) && tag !== 'tr' && tag !== 'td' && tag !== 'th' && tag !== 'tbody' && tag !== 'thead' && tag !== 'tfoot') {
      const f = inlineFormat(el, fmt);
      for (const c of Array.from(el.childNodes)) walk(c, f, ctx);
      return;
    }

    // Block-level element.
    if (tag === 'hr') {
      flush();
      const page = el.classList.contains('page-break') || /page/.test(`${el.style.breakAfter} ${el.style.pageBreakAfter}`);
      const column = !page && (el.classList.contains('column-break') || /column/.test(el.style.breakAfter));
      blocks.push(page ? { type: 'rule', page: true } : column ? { type: 'rule', column: true } : { type: 'rule' });
      return;
    }
    if (tag === 'div' && el.classList.contains('columns')) {
      // DOC-049: text in columns.
      flush();
      const from = blocks.length;
      for (const c of Array.from(el.childNodes)) walk(c, fmt, ctx);
      flush();
      const count = Number(el.dataset.count) || Number(el.style.columnCount) || 2;
      const gap = el.dataset.gap !== undefined ? Number(el.dataset.gap) : undefined;
      blocks.splice(from, Infinity, ...inColumns(blocks.slice(from), { count, ...(gap !== undefined ? { gap } : {}), ...(el.dataset.rule !== undefined ? { rule: true } : {}) }));
      return;
    }
    if (tag === 'table') {
      flush();
      blocks.push(tableFromDom(el, lookupImage, opts));
      return;
    }
    flush();
    const align = alignOf(el) ?? ctx.align;
    const next: BlockCtx = { ...ctx, ...(align ? { align } : {}), anchor: el.dataset?.anchor || undefined };
    if (/^h[1-6]$/.test(tag)) next.style = tag as ParagraphStyle;
    else if (tag === 'p' && el.classList.contains('caption')) next.style = 'caption';
    else if (tag === 'blockquote') next.style = 'quote';
    else if (tag === 'pre') {
      next.style = 'code';
      next.pre = true;
    }
    if (tag === 'ul' || tag === 'ol') {
      next.listDepth = ctx.listDepth + 1;
      next.ordered = tag === 'ol';
    }
    if (tag === 'li') {
      next.list = { ordered: ctx.ordered, level: Math.max(0, ctx.listDepth - 1) };
      next.style = 'normal';
    }
    const f = tag === 'pre' ? fmt : inlineFormat(el, fmt);
    for (const c of Array.from(el.childNodes)) {
      // Nested lists inside <li> start a new paragraph.
      walk(c, f, next);
    }
    flush();
  };

  walk(root, {}, { style: 'normal', listDepth: 0, ordered: false, pre: false });
  flush();
  return blocks;
}

function trimParagraph(p: Paragraph, preserve: boolean): void {
  if (preserve) return;
  const first = p.runs[0];
  if (first && isTextRun(first)) {
    first.text = first.text.replace(/^ +/, '');
    if (!first.text) p.runs.shift();
  }
  const last = p.runs[p.runs.length - 1];
  if (last && isTextRun(last)) {
    last.text = last.text.replace(/ +$/, '');
    if (!last.text) p.runs.pop();
  }
}

function tableFromDom(
  table: HTMLElement,
  lookupImage: (img: HTMLImageElement) => string | undefined,
  opts: DomToBlocksOptions,
): Block {
  const rows: TableCell[][] = [];
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    if (tr.closest('table') !== table) continue;
    const row: TableCell[] = [];
    for (const cell of Array.from(tr.children)) {
      if (cell.localName !== 'td' && cell.localName !== 'th') continue;
      const inner = domToBlocks(cell, lookupImage, opts).flatMap((b): Paragraph[] =>
        b.type === 'paragraph' ? [b] : b.type === 'table' ? b.rows.flat().flatMap((c) => c.blocks) : [],
      );
      const out: TableCell = { blocks: inner.length ? inner : [{ type: 'paragraph', style: 'normal', runs: [] }] };
      const colSpan = Number(cell.getAttribute('colspan') ?? 1);
      const rowSpan = Number(cell.getAttribute('rowspan') ?? 1);
      if (colSpan > 1) out.colSpan = Math.min(colSpan, 64);
      if (rowSpan > 1) out.rowSpan = Math.min(rowSpan, 1000);
      row.push(out);
    }
    if (row.length) rows.push(row);
  }
  // A first row made only of <th> cells is the header row (DOC-025).
  const first = Array.from(table.querySelectorAll('tr')).find((tr) => tr.closest('table') === table);
  const cells = first ? Array.from(first.children).filter((c) => c.localName === 'td' || c.localName === 'th') : [];
  const header = cells.length > 0 && cells.every((c) => c.localName === 'th');
  return header ? { type: 'table', rows, header } : { type: 'table', rows };
}

function alignOf(el: HTMLElement): Align | undefined {
  const raw = (el.style?.textAlign || el.getAttribute('align') || '').toLowerCase();
  if (raw === 'center' || raw === 'right' || raw === 'justify') return raw;
  if (raw === 'left' || raw === 'start') return 'left';
  if (raw === 'end') return 'right';
  return undefined;
}

function inlineFormat(el: HTMLElement, parent: TextFormat): TextFormat {
  const f: TextFormat = { ...parent };
  const tag = el.localName.toLowerCase();
  if (tag === 'b' || tag === 'strong') f.bold = true;
  if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'var') f.italic = true;
  if (tag === 'u' || tag === 'ins') f.underline = true;
  if (tag === 's' || tag === 'strike' || tag === 'del') f.strike = true;
  if (el.classList?.contains('smallcaps')) f.smallCaps = true;
  if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') f.code = true;
  if (tag === 'a') {
    const href = el.getAttribute('href');
    if (href && isSafeUrl(href)) f.link = href;
  }
  const style = el.style;
  if (style) {
    const weight = style.fontWeight;
    if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) f.bold = true;
    else if (weight === 'normal' || (Number(weight) > 0 && Number(weight) < 600)) delete f.bold;
    if (style.fontStyle === 'italic' || style.fontStyle === 'oblique') f.italic = true;
    else if (style.fontStyle === 'normal') delete f.italic;
    const deco = `${style.textDecoration} ${style.textDecorationLine}`;
    if (deco.includes('underline')) f.underline = true;
    if (deco.includes('line-through')) f.strike = true;
    if (style.fontVariant === 'small-caps' || style.fontVariantCaps === 'small-caps') f.smallCaps = true;
    const size = /^([\d.]+)(pt|px)$/.exec(style.fontSize ?? '');
    if (size) f.size = Math.round((size[2] === 'px' ? (Number(size[1]) * 72) / 96 : Number(size[1])) * 10) / 10;
    const color = cssColorToHex(style.color ?? '');
    if (color) f.color = color;
    const highlight = cssColorToHex(style.backgroundColor ?? '');
    if (highlight && highlight !== '#ffffff') f.highlight = highlight;
    const family = (style.fontFamily ?? '').split(',')[0]?.trim().replace(/^["']|["']$/g, '');
    if (family && !/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit|initial|-apple-system|ui-\w+)$/i.test(family)) {
      if (MONO_FONT.test(family)) f.code = true;
      else f.font = family;
    }
  }
  return f;
}

/** `rgb(1, 2, 3)` / `#abc` / `#aabbcc` -> `#aabbcc` (other forms ignored). */
export function cssColorToHex(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`;
  return undefined;
}

/** Sanitise arbitrary HTML into the supported subset (DOC-008). */
export function sanitizeHtml(html: string, lookupImage: (img: HTMLImageElement) => string | undefined = () => undefined): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const blocks = domToBlocks(parsed.body, lookupImage);
  const div = document.createElement('div');
  div.append(
    blocksToDom(blocks, document, (key) => {
      const img = Array.from(parsed.images).find((i) => lookupImage(i) === key);
      return img ? { url: img.src } : undefined;
    }),
  );
  return div.innerHTML;
}

/** The number of a figure, table or equation (DOC-026). */
export function seqElement(kind: SeqKind, n: number, doc: Document = document): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'seq';
  span.dataset.seq = kind;
  span.textContent = seqText(kind, n);
  return span;
}

/** A cross-reference: a link to its target showing the target's label (DOC-026). */
export function refElement(id: string, label: string, doc: Document = document): HTMLElement {
  const a = doc.createElement('a');
  a.className = 'xref';
  a.dataset.ref = id;
  a.href = `#${id}`;
  a.textContent = label;
  if (label === '??') a.classList.add('broken');
  return a;
}

/** A sub-document of a master document, by its path (DOC-028). */
/** A spring or a space (DOC-042): its height as last shown, or its size. */
export function spaceElement(space: Space, doc: Document = document): HTMLElement {
  const div = doc.createElement('div');
  div.className = space.stretch ? 'space spring' : 'space';
  if (space.stretch) div.dataset.stretch = String(space.stretch);
  if (space.size !== undefined) div.dataset.size = String(space.size);
  if (space.fraction) div.dataset.fraction = String(space.fraction);
  div.style.height = `${space.size ?? 0}pt`;
  return div;
}

/** A horizontal spring (DOC-042). */
export function fillElement(run: FillRun, doc: Document = document): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'hfill';
  span.dataset.hfill = String(run.hfill);
  return span;
}

export function includeElement(src: string, doc: Document = document): HTMLElement {
  const div = doc.createElement('div');
  div.className = 'include';
  div.dataset.include = src;
  div.textContent = `📄 ${src}`;
  return div;
}
