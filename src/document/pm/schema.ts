/**
 * ProseMirror schema for text documents (DOC-018). It mirrors the format-neutral
 * model (`../model.ts`) one to one so that conversions are lossless:
 *
 * - paragraphs are flat, like in the model and in DOCX/ODT: a list item is a
 *   paragraph with `listOrdered`/`listLevel` attributes, a quote or code block
 *   a paragraph with that style;
 * - text formatting is marks; `\n` line breaks are `hard_break` nodes;
 * - images, equations, diagrams and code cells are inline atoms;
 * - tables come from prosemirror-tables (cells hold paragraphs).
 */
import { Schema, type DOMOutputSpec, type Mark, type Node as PmNode } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';
import { LAYOUT_KEYS, inputText, type Align, type CellOutput, type InputKind, type ParagraphStyle } from '../model';
import { cssFontFamily, footnoteFromDom, inputOfElement } from '../html';
import { t } from '../../i18n';
import { columnsCss } from '../columns';
import { proofColor } from '../../color/convert';

const STYLES: ParagraphStyle[] = ['normal', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'quote', 'code', 'caption'];
const ALIGNS: Align[] = ['left', 'center', 'right', 'justify'];

function paragraphAttrs(dom: HTMLElement, style: ParagraphStyle): Record<string, unknown> {
  const align = ALIGNS.find((a) => a === (dom.style.textAlign || dom.dataset.align)) ?? null;
  const list = dom.dataset.list;
  const attrs: Record<string, unknown> = {
    style,
    align,
    listOrdered: list === 'ol' ? true : list === 'ul' ? false : null,
    listLevel: Number(dom.dataset.level ?? 0) || 0,
    anchor: dom.dataset.anchor || null,
    solution: dom.dataset.solution === 'true',
    named: dom.dataset.named || null,
    task: dom.dataset.task ?? null,
    codeInfo: dom.dataset.codeInfo ?? null,
    blockId: dom.dataset.blockId ?? null,
    raw: dom.dataset.raw === 'html' || dom.dataset.raw === 'comment' ? dom.dataset.raw : null,
    joined: dom.dataset.joined === 'true',
  };
  // Spacing is read back from the editor's own data attributes only (DOC-020).
  for (const k of LAYOUT_KEYS) {
    const v = dom.dataset[k];
    if (v !== undefined && Number.isFinite(Number(v))) attrs[k] = Number(v);
  }
  return attrs;
}

/** CSS of the paragraph spacing attributes (lengths in points). */
function layoutCss(a: Record<string, unknown>): string {
  const css: string[] = [];
  if (a.indent) css.push(`margin-left: ${a.indent as number}pt`);
  if (a.firstLine) css.push(`text-indent: ${a.firstLine as number}pt`);
  if (a.spaceBefore !== null) css.push(`margin-top: ${a.spaceBefore as number}pt`);
  if (a.spaceAfter !== null) css.push(`margin-bottom: ${a.spaceAfter as number}pt`);
  if (a.lineHeight) css.push(`line-height: ${(a.lineHeight as number) * 1.2}`);
  return css.join('; ');
}

function paragraphDom(node: PmNode): DOMOutputSpec {
  const { style, align, listOrdered, listLevel } = node.attrs as { style: ParagraphStyle; align: Align | null; listOrdered: boolean | null; listLevel: number };
  const tag = style === 'normal' || style === 'caption' ? 'p' : style === 'quote' ? 'blockquote' : style === 'code' ? 'pre' : style;
  const attrs: Record<string, string> = {};
  const anchor = node.attrs.anchor as string | null;
  if (anchor) {
    attrs.id = anchor;
    attrs['data-anchor'] = anchor;
  }
  const css = [align ? `text-align: ${align}` : '', layoutCss(node.attrs)].filter(Boolean).join('; ');
  if (css) attrs.style = css;
  if (align) attrs['data-align'] = align;
  for (const k of LAYOUT_KEYS) if (node.attrs[k] !== null) attrs[`data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = String(node.attrs[k]);
  if (style === 'caption') attrs.class = 'caption';
  if (node.attrs.solution) attrs['data-solution'] = 'true';
  if (node.attrs.named) attrs['data-named'] = node.attrs.named as string;
  if (node.attrs.cellHeader !== null) attrs['data-cell-header'] = node.attrs.cellHeader as string;
  if (node.attrs.task !== null) {
    attrs['data-task'] = node.attrs.task as string;
    attrs.class = `${attrs.class ?? ''} task${node.attrs.task === 'x' || node.attrs.task === 'X' ? ' task-done' : node.attrs.task === ' ' ? '' : ' task-other'}`.trim();
  }
  if (node.attrs.codeInfo !== null) attrs['data-code-info'] = node.attrs.codeInfo as string;
  if (node.attrs.blockId !== null) attrs['data-block-id'] = node.attrs.blockId as string;
  if (node.attrs.joined) attrs['data-joined'] = 'true';
  if (node.attrs.raw !== null) {
    attrs['data-raw'] = node.attrs.raw as string;
    attrs.class = `${attrs.class ?? ''} raw-${node.attrs.raw as string}`.trim();
  }
  if (listOrdered !== null) {
    attrs.class = `${attrs.class ?? ''} list-item`.trim();
    attrs['data-list'] = listOrdered ? 'ol' : 'ul';
    attrs['data-level'] = String(listLevel);
  }
  return [tag, attrs, 0];
}

const json = (value: unknown): string => JSON.stringify(value);

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: {
        style: { default: 'normal' },
        align: { default: null },
        listOrdered: { default: null },
        listLevel: { default: 0 },
        indent: { default: null },
        firstLine: { default: null },
        spaceBefore: { default: null },
        spaceAfter: { default: null },
        lineHeight: { default: null },
        /** Cross-reference anchor (DOC-026). */
        anchor: { default: null },
        /** Part of the answer key (TEACH-001). */
        solution: { default: false },
        /** DOC-038: first block of a KaimonSlate text cell (its header and Markdown as written). */
        cellHeader: { default: null },
        cellSource: { default: null },
        /** DOC-053: a named style of the document. */
        named: { default: null },
        /** MD-020: the state of a task of a list. */
        task: { default: null },
        /** MD-021: the info string of a code block. */
        codeInfo: { default: null },
        /** MD-025: the identifier of the block. */
        blockId: { default: null },
        /** MD-023, MD-024: a block kept as written (raw HTML, comment block). */
        raw: { default: null },
        /** MD-026: a callout's title followed by its body without a blank line. */
        joined: { default: false },
      },
      parseDOM: [
        ...STYLES.filter((s) => /^h\d$/.test(s)).map((s) => ({ tag: s, getAttrs: (d: HTMLElement) => paragraphAttrs(d, s) })),
        { tag: 'blockquote', getAttrs: (d: HTMLElement) => paragraphAttrs(d, 'quote') },
        { tag: 'pre', preserveWhitespace: 'full' as const, getAttrs: (d: HTMLElement) => paragraphAttrs(d, 'code') },
        { tag: 'p.caption', getAttrs: (d: HTMLElement) => paragraphAttrs(d, 'caption') },
        { tag: 'p', getAttrs: (d: HTMLElement) => paragraphAttrs(d, 'normal') },
      ],
      toDOM: paragraphDom,
    },
    horizontal_rule: {
      group: 'block',
      attrs: { page: { default: false }, column: { default: false } },
      parseDOM: [{ tag: 'hr', getAttrs: (d: HTMLElement) => ({ page: d.classList.contains('page-break'), column: d.classList.contains('column-break') }) }],
      toDOM: (n) => (n.attrs.page ? ['hr', { class: 'page-break', 'data-label': t('doc.pageBreak') }] : n.attrs.column ? ['hr', { class: 'column-break', 'data-label': t('doc.columnBreak') }] : ['hr']),
    },
    /** DOC-049: blocks set in columns, as in a newspaper. */
    columns: {
      group: 'block',
      content: '(paragraph | table | horizontal_rule | space | toc | include | bibliography)+',
      defining: true,
      isolating: true,
      attrs: { count: { default: 2 }, gap: { default: null }, rule: { default: false } },
      parseDOM: [
        {
          tag: 'div.columns',
          getAttrs: (d: HTMLElement) => ({ count: Number(d.dataset.count) || 2, gap: d.dataset.gap !== undefined ? Number(d.dataset.gap) : null, rule: d.dataset.rule !== undefined }),
        },
      ],
      toDOM: (n) => [
        'div',
        {
          class: 'columns',
          'data-count': String(n.attrs.count),
          ...(n.attrs.gap !== null ? { 'data-gap': String(n.attrs.gap) } : {}),
          ...(n.attrs.rule ? { 'data-rule': '' } : {}),
          style: columnsCss(n.attrs.count as number, n.attrs.gap as number | null, !!n.attrs.rule),
        },
        0,
      ],
    },
    toc: {
      group: 'block',
      atom: true,
      selectable: true,
      draggable: true,
      attrs: { levels: { default: 3 } },
      parseDOM: [{ tag: 'nav.toc', getAttrs: (d: HTMLElement) => ({ levels: Number(d.dataset.levels) || 3 }) }],
      toDOM: (n) => ['nav', { class: 'toc', 'data-levels': String(n.attrs.levels) }],
    },
    /** A sub-document of a master document (DOC-028). */
    include: {
      group: 'block',
      atom: true,
      selectable: true,
      draggable: true,
      attrs: { src: { default: '' } },
      parseDOM: [{ tag: 'div.include[data-include]', getAttrs: (d: HTMLElement) => ({ src: d.dataset.include }) }],
      toDOM: (n) => ['div', { class: 'include', 'data-include': n.attrs.src as string }, `📄 ${n.attrs.src as string}`],
    },
    /** DOC-042: a vertical spring (`stretch`) or a fixed space (`size`, points; or `fraction` of the page height). */
    space: {
      group: 'block',
      atom: true,
      selectable: true,
      draggable: true,
      attrs: { stretch: { default: null }, size: { default: null }, fraction: { default: null } },
      parseDOM: [
        {
          tag: 'div.space',
          getAttrs: (d: HTMLElement) => ({ stretch: Number(d.dataset.stretch) || null, size: d.dataset.size !== undefined ? Number(d.dataset.size) : null, fraction: Number(d.dataset.fraction) || null }),
        },
      ],
      toDOM: (n) => [
        'div',
        {
          class: n.attrs.stretch ? 'space spring' : 'space',
          ...(n.attrs.stretch ? { 'data-stretch': String(n.attrs.stretch) } : {}),
          ...(n.attrs.size !== null ? { 'data-size': String(n.attrs.size) } : {}),
          ...(n.attrs.fraction ? { 'data-fraction': String(n.attrs.fraction) } : {}),
        },
      ],
    },
    /** The list of cited references (DOC-027). */
    bibliography: {
      group: 'block',
      atom: true,
      selectable: true,
      draggable: true,
      parseDOM: [{ tag: 'section.bibliography' }],
      toDOM: () => ['section', { class: 'bibliography', 'data-bibliography': '' }],
    },
    ...tableNodes({ tableGroup: 'block', cellContent: 'paragraph+', cellAttributes: {} }),
    text: { group: 'inline' },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
    image: {
      inline: true,
      group: 'inline',
      draggable: true,
      attrs: { image: { default: '' }, src: { default: null }, alt: { default: null }, title: { default: null }, width: { default: null }, height: { default: null }, linkSize: { default: false } },
      parseDOM: [
        {
          tag: 'img[data-resource]',
          getAttrs: (d: HTMLElement) => {
            const img = d as HTMLImageElement;
            return { image: img.dataset.resource ?? '', alt: img.getAttribute('alt'), title: img.getAttribute('title'), width: Number(img.getAttribute('width')) || null, height: Number(img.getAttribute('height')) || null };
          },
        },
      ],
      toDOM: (n) => ['img', { 'data-resource': n.attrs.image, alt: n.attrs.alt ?? '', ...(n.attrs.title ? { title: n.attrs.title } : {}), ...(n.attrs.width ? { width: String(n.attrs.width) } : {}), ...(n.attrs.height ? { height: String(n.attrs.height) } : {}) }],
    },
    math: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { math: { default: '' }, display: { default: false } },
      parseDOM: [{ tag: 'span.math', getAttrs: (d: HTMLElement) => ({ math: d.dataset.latex ?? '', display: d.dataset.display === 'true' }) }],
      toDOM: (n) => ['span', { class: n.attrs.display ? 'math display' : 'math', 'data-latex': n.attrs.math, ...(n.attrs.display ? { 'data-display': 'true' } : {}) }, n.attrs.display ? `$$${n.attrs.math}$$` : `$${n.attrs.math}$`],
    },
    diagram: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { diagram: { default: '' }, lang: { default: 'mermaid' } },
      parseDOM: [{ tag: 'span.diagram', getAttrs: (d: HTMLElement) => ({ diagram: d.dataset.source ?? '', lang: d.dataset.diagram ?? 'mermaid' }) }],
      toDOM: (n) => ['span', { class: 'diagram', 'data-diagram': n.attrs.lang, 'data-source': n.attrs.diagram }, n.attrs.diagram],
    },
    /** A figure, table or equation number, counted by the editor (DOC-026). */
    seq: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { kind: { default: 'figure' } },
      parseDOM: [{ tag: 'span.seq[data-seq]', priority: 60, getAttrs: (d: HTMLElement) => ({ kind: d.dataset.seq }) }],
      toDOM: (n) => ['span', { class: 'seq', 'data-seq': n.attrs.kind }, '#'],
    },
    /** DOC-042: a horizontal spring, sharing the free width of its line. */
    hfill: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { weight: { default: 1 } },
      parseDOM: [{ tag: 'span.hfill', priority: 60, getAttrs: (d: HTMLElement) => ({ weight: Number(d.dataset.hfill) || 1 }) }],
      toDOM: (n) => ['span', { class: 'hfill', 'data-hfill': String(n.attrs.weight), style: `flex-grow: ${n.attrs.weight as number}` }],
    },
    /** A field, showing its current value (DOC-041). */
    field: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { kind: { default: 'date' }, format: { default: null }, fixed: { default: null } },
      parseDOM: [{ tag: 'span.field[data-field]', priority: 60, getAttrs: (d: HTMLElement) => ({ kind: d.dataset.field, format: d.dataset.format ?? null, fixed: d.dataset.fixed ?? null }) }],
      toDOM: (n) => ['span', { class: 'field', 'data-field': n.attrs.kind, ...(n.attrs.format ? { 'data-format': n.attrs.format } : {}), ...(n.attrs.fixed ? { 'data-fixed': n.attrs.fixed } : {}) }, `{${n.attrs.kind as string}}`],
    },
    /** FORM-003: a form field, filled in where it stands. */
    form_input: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { input: { default: 'text' }, name: { default: '' }, value: { default: null }, checked: { default: false }, options: { default: null }, required: { default: false } },
      parseDOM: [
        {
          tag: 'span.form-input[data-input]',
          priority: 60,
          getAttrs: (d: HTMLElement) => {
            const run = inputOfElement(d);
            return run ? { input: run.input, name: run.name, value: run.value ?? null, checked: !!run.checked, options: run.options ?? null, required: !!run.required } : false;
          },
        },
      ],
      toDOM: (n) => {
        const a = n.attrs as { input: InputKind; name: string; value: string | null; checked: boolean; options: string[] | null; required: boolean };
        const shown = inputText({ input: a.input, name: a.name, ...(a.value ? { value: a.value } : {}), checked: a.checked });
        return ['span', { class: 'form-input', 'data-input': a.input, 'data-name': a.name, ...(a.required ? { 'data-required': '' } : {}) }, shown];
      },
    },
    /** A cross-reference, showing its target's label (DOC-026). */
    xref: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { ref: { default: '' } },
      parseDOM: [{ tag: 'a.xref[data-ref]', priority: 60, getAttrs: (d: HTMLElement) => ({ ref: d.dataset.ref }) }],
      toDOM: (n) => ['a', { class: 'xref', 'data-ref': n.attrs.ref, href: `#${n.attrs.ref as string}` }, '??'],
    },
    /** A citation of bibliography entries (DOC-027). */
    cite: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { keys: { default: [] }, locator: { default: null } },
      parseDOM: [{ tag: 'span.cite[data-cite]', priority: 60, getAttrs: (d: HTMLElement) => ({ keys: (d.dataset.cite ?? '').split(/\s+/).filter(Boolean), locator: d.dataset.locator ?? null }) }],
      toDOM: (n) => ['span', { class: 'cite', 'data-cite': (n.attrs.keys as string[]).join(' '), ...(n.attrs.locator ? { 'data-locator': n.attrs.locator as string } : {}) }, `[${(n.attrs.keys as string[]).join(', ')}]`],
    },
    footnote: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { runs: { default: [] } },
      parseDOM: [{ tag: 'span.footnote[data-footnote]', getAttrs: (d: HTMLElement) => ({ runs: footnoteFromDom(d) ?? [] }) }],
      toDOM: (n) => ['span', { class: 'footnote', 'data-footnote': JSON.stringify(n.attrs.runs) }],
    },
    code_cell: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { cell: { default: '' }, lang: { default: 'python' }, output: { default: null }, hidden: { default: false }, header: { default: null }, engine: { default: null } },
      parseDOM: [
        {
          tag: 'span.code-cell[data-cell]',
          getAttrs: (d: HTMLElement) => ({ cell: d.dataset.cell ?? '', lang: d.dataset.lang ?? 'python', output: d.dataset.output ? (JSON.parse(d.dataset.output) as CellOutput) : null, hidden: d.dataset.hidden === 'true', engine: d.dataset.engine ?? null }),
        },
      ],
      toDOM: (n) => ['span', { class: 'code-cell', 'data-lang': n.attrs.lang, 'data-cell': n.attrs.cell, ...(n.attrs.header !== null ? { 'data-header': n.attrs.header } : {}), ...(n.attrs.output ? { 'data-output': json(n.attrs.output) } : {}), ...(n.attrs.hidden ? { 'data-hidden': 'true' } : {}), ...(n.attrs.engine ? { 'data-engine': n.attrs.engine } : {}) }, n.attrs.cell],
    },
  },
  // The order is the nesting order: links outermost.
  marks: {
    link: {
      attrs: { href: {} },
      inclusive: false,
      parseDOM: [{ tag: 'a[href]', getAttrs: (d: HTMLElement) => ({ href: d.getAttribute('href') }) }],
      toDOM: (m: Mark) => ['a', { href: m.attrs.href, rel: 'noopener noreferrer' }, 0],
    },
    bold: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight=bold' }, { style: 'font-weight=700' }], toDOM: () => ['strong', 0] },
    italic: { parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }], toDOM: () => ['em', 0] },
    underline: { parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }], toDOM: () => ['u', 0] },
    /** DOC-048: small capitals. */
    smallCaps: { parseDOM: [{ tag: 'span.smallcaps' }, { style: 'font-variant=small-caps' }, { style: 'font-variant-caps=small-caps' }], toDOM: () => ['span', { class: 'smallcaps' }, 0] },
    strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }], toDOM: () => ['s', 0] },
    code: { parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
    /** MD-024: a comment of the note, faint in editing mode, hidden in reading mode. */
    mdComment: { parseDOM: [{ tag: 'span.md-comment' }], toDOM: () => ['span', { class: 'md-comment' }, 0] },
    /** MD-023: raw inline HTML, shown as written. */
    rawHtml: { parseDOM: [{ tag: 'span.raw-html' }], toDOM: () => ['span', { class: 'raw-html' }, 0] },
    size: {
      attrs: { pt: {} },
      parseDOM: [{ tag: 'span[data-size]', getAttrs: (d: HTMLElement) => ({ pt: Number(d.dataset.size) }) }],
      toDOM: (m: Mark) => ['span', { style: `font-size: ${m.attrs.pt}pt`, 'data-size': String(m.attrs.pt) }, 0],
    },
    color: {
      attrs: { hex: {} },
      parseDOM: [{ tag: 'span[data-color]', getAttrs: (d: HTMLElement) => ({ hex: d.dataset.color }) }],
      toDOM: (m: Mark) => ['span', { style: `color: ${m.attrs.hex}; --proof: ${proofColor(m.attrs.hex as string)}`, 'data-color': m.attrs.hex }, 0],
    },
    font: {
      attrs: { family: {} },
      parseDOM: [{ tag: 'span[data-font]', getAttrs: (d: HTMLElement) => ({ family: d.dataset.font }) }],
      toDOM: (m: Mark) => ['span', { style: `font-family: ${cssFontFamily(m.attrs.family as string)}`, 'data-font': m.attrs.family }, 0],
    },
    highlight: {
      attrs: { hex: {} },
      parseDOM: [{ tag: 'mark[data-highlight]', getAttrs: (d: HTMLElement) => ({ hex: d.dataset.highlight }) }],
      toDOM: (m: Mark) => ['mark', { style: `background-color: ${m.attrs.hex}; --proof: ${proofColor(m.attrs.hex as string)}`, 'data-highlight': m.attrs.hex }, 0],
    },
    /** The text of a comment (REV-001); several comments can cover the same text. */
    comment: {
      attrs: { id: {} },
      inclusive: false,
      excludes: '',
      parseDOM: [{ tag: 'span[data-comment]', getAttrs: (d: HTMLElement) => ({ id: d.dataset.comment }) }],
      toDOM: (m: Mark) => ['span', { class: 'comment-anchor', 'data-comment': m.attrs.id }, 0],
    },
    /** Tracked changes (REV-005): text inserted, or deleted but kept until accepted. */
    insertion: {
      attrs: { author: { default: null }, date: { default: null } },
      inclusive: false,
      excludes: 'insertion deletion',
      parseDOM: [{ tag: 'ins.tracked', priority: 60, getAttrs: (d: HTMLElement) => ({ author: d.dataset.author ?? null, date: d.dataset.date ?? null }) }],
      toDOM: (m: Mark) => ['ins', { class: 'tracked', ...(m.attrs.author ? { 'data-author': m.attrs.author, title: m.attrs.author } : {}), ...(m.attrs.date ? { 'data-date': m.attrs.date } : {}) }, 0],
    },
    deletion: {
      attrs: { author: { default: null }, date: { default: null } },
      inclusive: false,
      excludes: 'insertion deletion',
      parseDOM: [{ tag: 'del.tracked', priority: 60, getAttrs: (d: HTMLElement) => ({ author: d.dataset.author ?? null, date: d.dataset.date ?? null }) }],
      toDOM: (m: Mark) => ['del', { class: 'tracked', ...(m.attrs.author ? { 'data-author': m.attrs.author, title: m.attrs.author } : {}), ...(m.attrs.date ? { 'data-date': m.attrs.date } : {}) }, 0],
    },
  },
});
