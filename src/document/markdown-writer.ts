/** Markdown writer (MD-002): CommonMark + GFM tables/strikethrough. */
import { isRunLang } from './code-langs';
import { geometryOptions } from './geometry';
import { inputMarkdown } from './inputs';
import { fillText, spaceText } from './springs';
import { CALLOUT, isRelativeImage } from './markdown-reader';

const safeDecode = (s: string): string => {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
};
import { solutionSegments } from './solutions';
import { columnsFence } from './columns';
import { CriticComments } from './critic';
import { writeFrontMatter } from './frontmatter';
import {
  cleanMeta,
  groupBlocks,
  columnSegments,
  paragraphText,
  isImageRun,
  isCodeCellRun,
  isDiagramRun,
  isMathRun,
  isFootnoteRun,
  splitParagraphs,
  cleanPageSetup,
  isTextRun,
  nestLists,
  splitListSegments,

  type ListNode,
  type Block,
  type Paragraph,
  type RichDocument,
  type Run,
  type Table,
  type TableCell,
  type TextRun,
  type CodeCellRun,
  tableGrid,
  crossTargets,
  isSeqRun,
  isFieldRun,
  fieldMarkdown,
  isInputRun,
  isFillRun,
  FIELD_SYNTAX,
  isRefRun,
  isCiteRun,
  seqText,
  type MathRun,
} from './model';
import { toCsl } from './bibliography';
import { EMBED, WIKI, wikiLink } from './wiki-links';

export interface MarkdownWriteOptions {
  /**
   * URL to use for an embedded image resource. Defaults to a `data:` URI so
   * that a standalone `.md` file stays self-contained.
   */
  imageUrl?: (key: string) => string;
  /** Write document properties as YAML front matter (default true; MDZ keeps them in its manifest). */
  frontMatter?: boolean;
}

export function bytesToBase64(data: Uint8Array): string {
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
}

type Mark = 'link' | 'smallCaps' | 'highlight' | 'bold' | 'italic' | 'strike' | 'underline';
const MARK_ORDER: Mark[] = ['link', 'smallCaps', 'highlight', 'bold', 'italic', 'strike', 'underline'];
// MD-019: highlighted text (any colour) as `==text==`.
// DOC-048: small capitals as Pandoc's bracketed span.
const OPEN: Record<Exclude<Mark, 'link'>, string> = { smallCaps: '[', highlight: '==', bold: '**', italic: '*', strike: '~~', underline: '<u>' };
const CLOSE: Record<Exclude<Mark, 'link'>, string> = { smallCaps: ']{.smallcaps}', highlight: '==', bold: '**', italic: '*', strike: '~~', underline: '</u>' };

/** Escape characters with Markdown meaning in inline text (`==` too, which highlights). */
export function escapeInline(text: string): string {
  return (
    text
      .replace(/[\\`*_[\]<>~|!$]/g, '\\$&')
      .replace(/=(?==)/g, '\\=')
      // DOC-041: a literal `{date}` is not a field.
      .replace(FIELD_SYNTAX, '\\$&')
  );
}

/** Escape constructs that are only special at the start of a line. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#>+=-])/, '$1\\$2')
    .replace(/^(\s*\d+)([.)])/, '$1\\$2');
}

/** A fenced code block, with a fence longer than any backtick run starting a line. */
/** MD-025: ` ^id` after the text of a block that has an identifier. */
const blockIdSuffix = (p: Paragraph): string => (p.blockId ? ` ^${p.blockId}` : '');

/** MD-026: a paragraph that is only a callout's marker line (`[!tip]- Title`). */
const isCalloutTitle = (p: Paragraph): boolean => {
  const first = p.runs[0];
  return !!first && isTextRun(first) && CALLOUT.test(first.text);
};

function fenced(body: string, info = ''): string {
  const longest = Math.max(2, ...(body.match(/^\s*`+/gm) ?? []).map((m) => m.trim().length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${info}\n${body}\n${fence}`;
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || /^ .* $/.test(text) ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

const escapeAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

class MarkdownWriter {
  /** Footnote definitions, written after the text (DOC-022). */
  private readonly notes: string[] = [];

  constructor(
    private readonly doc: RichDocument,
    private readonly opts: MarkdownWriteOptions,
  ) {
    this.xref = crossTargets(doc.blocks);
  }

  /** Cross-reference targets and numbers (DOC-026). */
  private readonly xref: ReturnType<typeof crossTargets>;

  write(): string {
    const parts: string[] = [];
    // TEACH-001: solutions in fenced divs, as in Pandoc and Quarto.
    // DOC-049: text in columns in fenced divs too.
    for (const set of columnSegments(this.doc.blocks)) {
      const inSet: string[] = [];
      for (const segment of solutionSegments(set.blocks)) {
        const inner = this.parts(segment.blocks);
        if (segment.solution) inSet.push('::: solution', ...inner, ':::');
        else inSet.push(...inner);
      }
      if (set.columns) parts.push(columnsFence(set.columns), ...inSet, ':::');
      else parts.push(...inSet);
    }
    // Notes may hold notes' text only, so their definitions are complete now.
    parts.push(...this.notes);
    return parts.filter((p) => p !== '').join('\n\n') + '\n';
  }

  private parts(blocks: Block[]): string[] {
    const parts: string[] = [];
    /** Paragraphs of a quote; MD-026: a callout's title line is followed by its body without a blank line. */
    let quote: { text: string; head: boolean }[] = [];
    let code: string[] = [];
    /** MD-021: the info string of the code block (its language). */
    let codeInfo = '';
    const flushQuote = (): void => {
      const lines = (q: string): string => q.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');
      if (quote.length) parts.push(quote.map((q, i) => (i === 0 ? '' : quote[i - 1]!.head ? '\n' : '\n>\n') + lines(q.text)).join(''));
      quote = [];
    };
    const flushCode = (): void => {
      if (code.length) {
        parts.push(fenced(code.join('\n'), codeInfo));
      }
      code = [];
      codeInfo = '';
    };
    for (const group of groupBlocks(blocks)) {
      const raw = group.type === 'paragraph' && group.raw ? group : undefined;
      const isQuote = !raw && group.type === 'paragraph' && group.style === 'quote';
      const isCode = !raw && group.type === 'paragraph' && group.style === 'code';
      if (!isQuote) flushQuote();
      if (!isCode || (group.type === 'paragraph' && (group.codeInfo ?? '') !== codeInfo && code.length)) flushCode();
      if (raw) {
        // MD-023, MD-024: raw HTML and comment blocks, as written.
        parts.push(raw.runs.map((r) => (isTextRun(r) ? r.text : '')).join(''));
      } else if (group.type === 'list') {
        for (const segment of splitListSegments(group.items)) {
          for (const list of nestLists(segment)) parts.push(this.list(list, ''));
        }
      } else if (group.type === 'table') {
        parts.push(this.table(group));
      } else if (group.type === 'space') {
        // DOC-042: written as in LaTeX (pandoc keeps it in LaTeX and PDF output).
        parts.push(spaceText(group));
      } else if (group.type === 'include') {
        // DOC-028: mdBook's include syntax.
        parts.push(`{{#include ${group.src}}}`);
      } else if (group.type === 'bibliography') {
        // pandoc puts the list of references here.
        parts.push('<div id="refs"></div>');
      } else if (group.type === 'toc') {
        // GitLab, Typora, MkDocs and others render a table of contents here (DOC-023).
        parts.push('[[_TOC_]]');
      } else if (group.type === 'rule') {
        // \newpage is understood by Pandoc and most Markdown-to-PDF tools (DOC-021).
        parts.push(group.page ? '\\newpage' : group.column ? '\\columnbreak' : '---');
      } else if (isQuote) {
        // MD-019: a callout starts a quote of its own; its marker is written as is.
        const first = group.runs[0];
        const callout = first && isTextRun(first) && !first.link && CALLOUT.test(first.text) ? CALLOUT.exec(first.text)![0] : undefined;
        if (callout) flushQuote();
        const text = this.commented(group.runs, true) + blockIdSuffix(group);
        quote.push({ text: callout ? text.replace(escapeInline(callout), callout) : text, head: !!callout && quote.length === 0 && !!group.joined && isCalloutTitle(group) });
      } else if (isCode) {
        if (!code.length) codeInfo = group.codeInfo ?? '';
        code.push(group.runs.map((r) => (isTextRun(r) ? r.text : '')).join(''));
      } else {
        parts.push(this.paragraph(group));
      }
    }
    flushQuote();
    flushCode();
    return parts;
  }

  private paragraph(p: Paragraph): string {
    const anchored = !!p.id && this.xref.targets.has(p.id);
    // DOC-026: a numbered equation carries its number and anchor as \tag and \label.
    const maths = p.runs.filter((r) => isMathRun(r) && r.display);
    const seq = p.runs.find(isSeqRun);
    if (seq?.seq === 'equation' && maths.length === 1 && p.runs.every((r) => r === seq || r === maths[0] || (isTextRun(r) && !r.text.trim()))) {
      const n = this.xref.numbers.get(seq) ?? 1;
      return `$$\n${(maths[0] as MathRun).math} \\tag{${n}}${anchored ? `\\label{${p.id}}` : ''}\n$$`;
    }
    const anchor = anchored ? `<a id="${escapeAttr(p.id!)}"></a>` : '';
    const only = p.runs.length === 1 ? p.runs[0] : undefined;
    if (only && isMathRun(only) && only.display) return `$$\n${only.math}\n$$`;
    if (only && isDiagramRun(only)) return fenced(only.diagram, only.lang);
    if (only && isCodeCellRun(only)) return this.cell(only);
    const heading = /^h(\d)$/.exec(p.style);
    const inline = this.commented(p.runs, true);
    if (heading) return `${'#'.repeat(Number(heading[1]))} ${anchor}${inline.replace(/\n/g, ' ')}${blockIdSuffix(p)}`;
    return (anchor + inline || '<br>') + blockIdSuffix(p);
  }

  /**
   * CODE-006: the cell as a `{run}` fence — `{cell}` for code shown only
   * (CODE-020; Julia stays `{run}`, run by its notebooks) — then its last
   * output and figures.
   */
  private cell(run: CodeCellRun): string {
    const kind = isRunLang(run.lang) || run.lang === 'julia' ? 'run' : 'cell';
    // CAS-005: a math cell names its engine; its result is LaTeX, shown as math where `math` fences are.
    const math = run.lang === 'math';
    const parts = [fenced(run.cell, `${run.lang} {${kind}${math ? ` ${run.engine ?? 'sympy'}` : ''}${run.hidden ? ' hide' : ''}}`)];
    const text = run.output?.text.replace(/\n$/, '');
    if (text) parts.push(fenced(text, `${math && !run.output?.error ? 'math' : 'text'} {output${run.output?.error ? ' error' : ''}}`));
    const images = (run.output?.images ?? []).filter((key) => this.doc.resources.has(key));
    if (images.length) parts.push(images.map((key) => `![Output](${this.imageUrl(key).replace(/[()\s]/g, encodeURIComponent)} "output")`).join(' '));
    // CODE-016: widgets are kept as their picture.
    const widgets = (run.output?.widgets ?? []).map((w) => w.snapshot).filter((key): key is string => !!key && this.doc.resources.has(key));
    if (widgets.length) parts.push(widgets.map((key) => `![Widget](${this.imageUrl(key).replace(/[()\s]/g, encodeURIComponent)} "widget")`).join(' '));
    return parts.join('\n\n');
  }

  private imageUrl(key: string): string {
    return this.opts.imageUrl ? this.opts.imageUrl(key) : this.dataUri(key);
  }

  private list(list: ListNode, indent: string): string {
    const lines: string[] = [];
    let n = 1;
    for (const item of list.items) {
      const marker = list.ordered ? `${n++}. ` : '- ';
      const pad = indent + ' '.repeat(marker.length);
      // MD-020: a task keeps its state; MD-025: a block identifier ends the item.
      const task = item.paragraph?.task !== undefined ? `[${item.paragraph.task}] ` : '';
      const text = item.paragraph ? task + this.commented(item.paragraph.runs, false) + blockIdSuffix(item.paragraph) : '';
      const [first = '', ...rest] = text.split('\n');
      lines.push(`${indent}${marker}${first}`.trimEnd(), ...rest.map((l) => `${pad}${l}`));
      for (const child of item.children) lines.push(this.list(child, pad));
    }
    return lines.join('\n');
  }

  /** GFM tables have no merged cells: a merged cell keeps its text in its first slot (DOC-025). */
  private table(t: Table): string {
    const { cols, slots } = tableGrid(t.rows);
    const cell = (c: TableCell | undefined): string =>
      (c?.blocks ?? [])
        .map((p) => this.commented(p.runs, false).replace(/\n/g, '<br>'))
        .join('<br>')
        .replace(/\|/g, '\\|') || ' ';
    const line = (r: number): string =>
      `| ${Array.from({ length: cols }, (_, c) => {
        const slot = slots[r]![c];
        return cell(slot && slot.row === r && slot.col === c ? slot.cell : undefined);
      }).join(' | ')} |`;
    const lines = slots.map((_, r) => line(r));
    const [head = line(0), ...body] = lines;
    return [head, `|${' --- |'.repeat(cols)}`, ...body].join('\n');
  }


  /** Comments as CriticMarkup (REV-004). */
  private critic: CriticComments | undefined;

  private commented(runs: Run[], escapeStarts: boolean): string {
    this.critic ??= new CriticComments(this.doc);
    return this.critic.write(runs, (part, first) => this.inline(part, escapeStarts && first));
  }

  /** Render runs with a minimal, always-valid nesting of emphasis markers. */
  private inline(runs: Run[], escapeStarts: boolean): string {
    let out = '';
    const open: Mark[] = [];
    let link: string | undefined;
    let pendingSpace = '';

    const closeTo = (keep: number): void => {
      while (open.length > keep) {
        const m = open.pop()!;
        if (m === 'link') {
          out += `](${link ?? ''})`;
          link = undefined;
        } else {
          out += CLOSE[m];
        }
      }
    };

    for (const run of runs) {
      // FOLDER-005: wiki links are written as [[note#heading|alias]], not as Markdown links.
      const wiki = isTextRun(run) && run.link?.startsWith(WIKI) ? run : undefined;
      const wanted: Mark[] = !isTextRun(run) ? [] : MARK_ORDER.filter((m) => (m === 'link' ? !!run.link && !wiki : !!run[m]));
      // Keep the longest common prefix of open marks (same link target).
      let keep = 0;
      while (
        keep < open.length &&
        keep < wanted.length &&
        open[keep] === wanted[keep] &&
        (open[keep] !== 'link' || link === (run as TextRun).link)
      ) {
        keep++;
      }
      if (keep < open.length) closeTo(keep);
      out += pendingSpace;
      pendingSpace = '';

      if (isDiagramRun(run) || isCodeCellRun(run)) {
        // Only a diagram or cell alone in its paragraph can be a fence; keep the source visible.
        out += codeSpan((isDiagramRun(run) ? run.diagram : run.cell).replace(/\n/g, ' '));
        continue;
      }
      if (isMathRun(run)) {
        out += run.display ? `$$${run.math}$$` : `$${run.math}$`;
        continue;
      }
      if (isSeqRun(run)) {
        out += seqText(run.seq, this.xref.numbers.get(run) ?? 1);
        continue;
      }
      if (isFieldRun(run)) {
        out += fieldMarkdown(run);
        continue;
      }
      if (isInputRun(run)) {
        out += inputMarkdown(run);
        continue;
      }
      if (isFillRun(run)) {
        out += fillText(run);
        continue;
      }
      if (isCiteRun(run)) {
        out += `[${run.cite.map((k) => `@${k}`).join('; ')}${run.locator ? `, ${run.locator}` : ''}]`;
        continue;
      }
      if (isRefRun(run)) {
        const target = this.xref.targets.get(run.ref);
        out += target ? `[${escapeInline(target.label)}](#${run.ref})` : '??';
        continue;
      }
      if (isFootnoteRun(run)) {
        const n = this.notes.length + 1;
        this.notes.push('');
        const body = splitParagraphs(run.footnote.filter((r) => !isFootnoteRun(r)))
          .map((part, i) => {
            const para = this.inline(part, false);
            return i === 0 ? para : para.split('\n').map((l) => `    ${l}`).join('\n');
          })
          .join('\n\n');
        this.notes[n - 1] = `[^${n}]: ${body}`;
        out += `[^${n}]`;
        continue;
      }
      if (isImageRun(run) && run.title === EMBED && run.src) {
        // MD-022: the size (or the text) written in the embed.
        const extra = run.width ? `|${run.width}${run.height ? `x${run.height}` : ''}` : run.alt ? `|${run.alt}` : '';
        out += `![[${run.src}${extra}]]`;
        continue;
      }
      if (isImageRun(run)) {
        // MD-018: a picture read from next to the note is written back as its link; others are embedded.
        const url = run.image
          ? this.opts.imageUrl
            ? this.opts.imageUrl(run.image)
            : run.src && isRelativeImage(run.src)
              ? safeDecode(run.src)
              : this.dataUri(run.image)
          : (run.src ?? '');
        const size = run.linkSize && run.width ? `|${run.width}${run.height ? `x${run.height}` : ''}` : '';
        out += `![${escapeInline(run.alt ?? '')}${size}](${url.replace(/[()\s]/g, encodeURIComponent)})`;
        continue;
      }
      if (isTextRun(run) && (run.rawHtml || run.mdComment)) {
        // MD-023, MD-024: inline HTML and comments, as written.
        out += run.mdComment ? `%%${run.text}%%` : run.text;
        continue;
      }
      let text = run.text;
      const lead = /^[ \t]*/.exec(text)![0];
      const trail = /[ \t]*$/.exec(text.slice(lead.length))![0];
      text = text.slice(lead.length, text.length - trail.length);
      if (!text) {
        out += run.code ? codeSpan(run.text) : lead + trail;
        continue;
      }
      out += lead;
      for (const m of wanted.slice(keep)) {
        if (m === 'link') {
          out += '[';
          link = run.link;
        } else {
          out += OPEN[m];
        }
        open.push(m);
      }
      out += wiki
        ? wikiLink(wiki.link!.slice(WIKI.length), text)
        : run.code
        ? text.split('\n').map(codeSpan).join('\\\n')
        : escapeInline(text).replace(/\n/g, '\\\n');
      pendingSpace = trail;
    }
    closeTo(0);
    out += pendingSpace;
    if (!escapeStarts) return out;
    return out
      .split('\n')
      .map((l) => escapeLineStart(l))
      .join('\n');
  }

  private dataUri(key: string): string {
    const res = this.doc.resources.get(key);
    return res ? `data:${res.mediaType};base64,${bytesToBase64(res.data)}` : '';
  }
}

export function writeMarkdown(doc: RichDocument, opts: MarkdownWriteOptions = {}): string {
  const body = new MarkdownWriter(doc, opts).write();
  return opts.frontMatter === false ? body : markdownFrontMatter(doc) + body;
}

/**
 * Front matter for the document properties (DOC-017). A title that merely
 * repeats the first heading (as read from a plain Markdown file) is not
 * worth a front matter block on its own.
 */
function markdownFrontMatter(doc: RichDocument): string {
  const meta = cleanMeta(doc.meta);
  // FILE-029: where the file comes from is no reason on its own to add a front matter to it (a README of a repository).
  const { source, ...others } = meta;
  const onlySource = source !== undefined && Object.keys(others).length === 0;
  const kept = typeof doc.extras?.frontMatter === 'string' ? doc.extras.frontMatter : '';
  // DOC-024: header and footer zones as flat keys (header-left: …).
  const page = cleanPageSetup(doc.page);
  const furniture = (['header', 'footer'] as const).flatMap((kind) =>
    (['left', 'center', 'right'] as const).flatMap((k) => (page?.[kind]?.[k] ? [`${kind}-${k}: ${JSON.stringify(page[kind]![k])}`] : [])),
  );
  // DOC-046: the paper and margins, as Pandoc reads them.
  const g = page?.geometry;
  if (g) {
    const opts = geometryOptions(g).split(',');
    const paper = /^(\w+)paper$/.exec(opts[0]!)?.[1];
    if (paper) furniture.push(`papersize: ${paper}`);
    furniture.push(`geometry: "${(paper ? opts.slice(1) : opts).join(',')}"`);
  }
  // DOC-029: page numbering, when it differs from the defaults.
  if (page?.numberFormat) furniture.push(`page-numbering: ${page.numberFormat}`);
  if (page?.startAt !== undefined) furniture.push(`page-start: ${page.startAt}`);
  if (page?.hideOnFirstPage) furniture.push('first-page-hidden: true');
  // DOC-027: the sources as pandoc's references (one CSL JSON item per line).
  const refs = doc.references;
  const bibliography = refs?.entries.length ? ['references:', ...refs.entries.map((e) => `- ${JSON.stringify(toCsl(e))}`)] : [];
  if (refs?.style === 'author-year') bibliography.push('citation-style: author-year');
  const extra = [kept, ...furniture, ...bibliography].filter(Boolean).join('\n');
  const firstHeading = doc.blocks.find((b): b is Paragraph => b.type === 'paragraph' && b.style === 'h1');
  const onlyHeadingTitle = Object.keys(meta).length === 1 && meta.title !== undefined && firstHeading !== undefined && paragraphText(firstHeading) === meta.title;
  const onlyHeadingAndSource = source !== undefined && Object.keys(others).length === 1 && others.title !== undefined && firstHeading !== undefined && paragraphText(firstHeading) === others.title;
  if (!extra && (Object.keys(meta).length === 0 || onlyHeadingTitle || onlySource || onlyHeadingAndSource)) return '';
  return writeFrontMatter(meta, extra);
}

