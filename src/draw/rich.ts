/**
 * DRAW-020, PDF-021: a text box whose parts have their own size, weight,
 * slant, underline and colour — runs of text, lines broken by "\n".
 */
import type { TextRun, TextShape } from './model';

const LINE = 1.2;

const same = (a: TextRun, b: TextRun): boolean =>
  a.size === b.size && !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline && a.fill === b.fill;

/** The runs of a text, one plain run when it has none (or they no longer match its text). */
export function runsOf(s: Pick<TextShape, 'text' | 'runs'>): TextRun[] {
  return s.runs && s.runs.map((r) => r.text).join('') === s.text ? s.runs : [{ text: s.text }];
}

/** Neighbours of the same look merged, empty ones dropped; undefined when nothing has a look of its own. */
export function normalizeRuns(runs: TextRun[]): TextRun[] | undefined {
  const out: TextRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const clean: TextRun = { text: r.text };
    if (r.size !== undefined) clean.size = r.size;
    if (r.bold) clean.bold = true;
    if (r.italic) clean.italic = true;
    if (r.underline) clean.underline = true;
    if (r.fill) clean.fill = r.fill;
    const last = out[out.length - 1];
    if (last && same(last, clean)) last.text += clean.text;
    else out.push(clean);
  }
  return out.some((r) => Object.keys(r).length > 1) ? out : undefined;
}

/** The runs cut into lines. */
export function runLines(runs: TextRun[]): TextRun[][] {
  const lines: TextRun[][] = [[]];
  for (const r of runs) {
    r.text.split('\n').forEach((part, i) => {
      if (i) lines.push([]);
      if (part) lines[lines.length - 1]!.push({ ...r, text: part });
    });
  }
  return lines;
}

/** The height of each line, from its largest text. */
export function lineSizes(s: Pick<TextShape, 'text' | 'runs' | 'size'>): number[] {
  const base = s.size ?? 16;
  return runLines(runsOf(s)).map((line) => Math.max(base * (line.length ? 0 : 1), ...line.map((r) => r.size ?? base)));
}

/**
 * The distance from a line's baseline to the next one's: the first's part
 * below its baseline and the second's above, as a browser lays out lines
 * 1.2 × their size high; 1.2 × the size between lines of one size.
 */
export const lineGap = (above: number, below: number): number => (LINE - 0.95) * above + 0.95 * below;

/** The look of some runs set or toggled (a size, bold…) on all of them. */
export function styleRuns(runs: TextRun[], look: Partial<Omit<TextRun, 'text'>>): TextRun[] {
  return runs.map((r) => {
    const out: TextRun = { ...r };
    for (const [k, v] of Object.entries(look) as [keyof Omit<TextRun, 'text'>, unknown][]) {
      if (v === undefined || v === false) delete out[k];
      else (out as unknown as Record<string, unknown>)[k] = v;
    }
    return out;
  });
}

// --- the editor's markup ---------------------------------------------------------------------

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The runs as HTML for an editable element, sizes in drawing units × `scale`. */
export function runsToHtml(runs: TextRun[], scale: number): string {
  return runs
    .map((r) => {
      const css: string[] = [];
      if (r.size !== undefined) css.push(`font-size:${r.size * scale}px`);
      if (r.bold) css.push('font-weight:bold');
      if (r.italic) css.push('font-style:italic');
      if (r.underline) css.push('text-decoration:underline');
      if (r.fill) css.push(`color:${r.fill}`);
      const body = r.text.split('\n').map(esc).join('<br>');
      return css.length ? `<span style="${esc(css.join(';'))}"${r.size !== undefined ? ` data-size="${r.size}"` : ''}>${body}</span>` : body;
    })
    .join('');
}

const BLOCKS = new Set(['DIV', 'P', 'LI']);

/**
 * The runs of an edited element: its text with the look given by the tags and
 * inline styles around each part (bold from Ctrl+B, sizes set by the editor…).
 * Sizes are read back in drawing units, through `scale`.
 */
export function runsFromHtml(root: HTMLElement, scale: number, base: { size: number; fill: string }): TextRun[] {
  const out: TextRun[] = [];
  const push = (text: string, look: Omit<TextRun, 'text'>): void => {
    out.push({ text, ...look });
  };
  const walk = (node: Node, look: Omit<TextRun, 'text'>): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/ /g, ' ');
      if (text) push(text, look);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') {
      push('\n', {});
      return;
    }
    const next: Omit<TextRun, 'text'> = { ...look };
    const tag = node.tagName;
    if (tag === 'B' || tag === 'STRONG') next.bold = true;
    if (tag === 'I' || tag === 'EM') next.italic = true;
    if (tag === 'U') next.underline = true;
    const st = node.style;
    if (st.fontWeight) next.bold = st.fontWeight === 'bold' || st.fontWeight === 'bolder' || Number(st.fontWeight) >= 600;
    if (st.fontStyle) next.italic = st.fontStyle === 'italic' || st.fontStyle === 'oblique';
    const deco = st.textDecorationLine || st.textDecoration;
    if (deco) next.underline = deco.includes('underline');
    const dataSize = Number(node.dataset.size);
    if (dataSize > 0) next.size = dataSize;
    else if (st.fontSize.endsWith('px')) next.size = Math.round((parseFloat(st.fontSize) / scale) * 10) / 10;
    const color = st.color || (tag === 'FONT' ? node.getAttribute('color') : '');
    if (color) next.fill = cssColorToHex(color);
    // A new line before a block (what Enter makes in some browsers), not before the first.
    if (BLOCKS.has(tag) && out.length && !out[out.length - 1]!.text.endsWith('\n')) push('\n', {});
    for (const child of Array.from(node.childNodes)) walk(child, next);
  };
  for (const child of Array.from(root.childNodes)) walk(child, {});
  // The defaults of the box are no look of their own.
  return out.map((r) => {
    const c = { ...r };
    if (c.size === base.size) delete c.size;
    if (c.fill && c.fill.toLowerCase() === base.fill.toLowerCase()) delete c.fill;
    if (c.text === '\n') return { text: '\n' };
    return c;
  });
}

function cssColorToHex(color: string): string {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (!m) return color;
  return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
}
