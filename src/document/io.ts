/** Read/write a rich document in any supported text format. */
import { forExport } from './note-export';
import { acceptAll } from './changes';
import type { DocumentFormat } from '../core/format';
import { readDocx } from './docx-reader';
import { writeDocx } from './docx-writer';
import { readLatexZip, writeLatexZip } from './latex-project';
import { readLatex } from './latex-reader';
import { writeLatex } from './latex-writer';
import { readMarkdown } from './markdown-reader';
import { readKaimonSlate, writeKaimonSlate } from './kslate';
import { readMarimo, writeMarimo } from './marimo';
import { writeMarkdown } from './markdown-writer';
import { readMdz, type MdzReadOptions } from './mdz-reader';
import type { MarkdownReadOptions } from './markdown-reader';
import { writeMdz } from './mdz-writer';
import { collectDiagrams, collectMath, type RenderedDiagram, type RichDocument, type WriteOptions } from './model';
import { readOdt } from './odt-reader';
import { writeOdt } from './odt-writer';

export type TextFormat = Extract<DocumentFormat, 'docx' | 'odt' | 'md' | 'mdz' | 'tex' | 'texzip' | 'jl' | 'marimo'>;

export async function readDocument(format: TextFormat, bytes: Uint8Array, opts: MdzReadOptions & MarkdownReadOptions = {}): Promise<RichDocument> {
  switch (format) {
    case 'docx':
      return readDocx(bytes);
    case 'odt':
      return readOdt(bytes);
    case 'md':
      return readMarkdown(new TextDecoder().decode(bytes), opts);
    case 'mdz':
      return readMdz(bytes, opts);
    case 'tex':
      return readLatex(new TextDecoder().decode(bytes));
    case 'texzip':
      return readLatexZip(bytes);
    case 'jl':
      return readKaimonSlate(new TextDecoder().decode(bytes));
    case 'marimo':
      return readMarimo(new TextDecoder().decode(bytes));
  }
}

export function writeDocument(doc: RichDocument, format: TextFormat, opts: WriteOptions = {}): Uint8Array {
  // MD-020, MD-024: notes written to other formats lose their comments, their tasks are drawn as characters.
  if (format !== 'md' && format !== 'mdz') doc = forExport(doc);
  switch (format) {
    case 'docx':
      return writeDocx(doc, opts);
    case 'odt':
      return writeOdt(doc, opts);
    case 'md':
      return new TextEncoder().encode(writeMarkdown(doc));
    case 'mdz':
      return writeMdz(doc);
    // REV-005: LaTeX has no tracked changes: they are accepted.
    case 'tex':
      return new TextEncoder().encode(writeLatex(acceptAll(doc)).tex);
    case 'texzip':
      return writeLatexZip(acceptAll(doc), opts);
    // DOC-038: a KaimonSlate notebook, its cells and headers kept.
    case 'jl':
      return new TextEncoder().encode(writeKaimonSlate(acceptAll(doc)));
    // DOC-039: a marimo notebook, its cells kept as written where unchanged.
    case 'marimo':
      return new TextEncoder().encode(writeMarimo(acceptAll(doc)));
  }
}

/** Like `writeDocument`, converting equations to MathML first (loads MathLive only when needed). */
export async function writeDocumentAsync(doc: RichDocument, format: TextFormat): Promise<Uint8Array> {
  const sources = format === 'docx' || format === 'odt' ? collectMath(doc.blocks) : [];
  const mathml = new Map<string, string>();
  if (sources.length) {
    const { latexToMathml } = await import('../math/mathlive');
    for (const latex of sources) {
      try {
        mathml.set(latex, await latexToMathml(latex));
      } catch {
        /* invalid LaTeX: written as text */
      }
    }
  }
  return writeDocument(doc, format, { mathml, diagrams: await renderDiagrams(doc, format), svgPng: await rasterSvgs(doc, format) });
}

/** PNG versions of the SVG pictures, for Word and LaTeX (DRAW-007). */
async function rasterSvgs(doc: RichDocument, format: TextFormat): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  if (format !== 'docx' && format !== 'texzip') return out;
  const used = JSON.stringify(doc.blocks);
  const svgs = [...doc.resources].filter(([key, r]) => r.mediaType === 'image/svg+xml' && used.includes(`"image":${JSON.stringify(key)}`));
  if (!svgs.length) return out;
  const [{ svgToPng }, { svgSize }] = await Promise.all([import('../draw/raster'), import('./docx-writer')]);
  for (const [key, res] of svgs) {
    try {
      const size = svgSize(res.data) ?? { width: 300, height: 200 };
      const blob = await svgToPng(new TextDecoder().decode(res.data), size.width, size.height, 2);
      out.set(key, new Uint8Array(await blob.arrayBuffer()));
    } catch {
      /* not drawable here: the SVG alone */
    }
  }
  return out;
}

/** Rasterise diagrams for formats that embed them as pictures (DIAG-005, DIAG-006); `pdf`: the typeset PDF (PDF-020). */
export async function renderDiagrams(doc: RichDocument, format: TextFormat | 'pdf'): Promise<Map<string, RenderedDiagram>> {
  const out = new Map<string, RenderedDiagram>();
  const sources = format === 'docx' || format === 'odt' || format === 'texzip' || format === 'pdf' ? collectDiagrams(doc.blocks) : [];
  if (!sources.length) return out;
  try {
    const { renderDiagramPng } = await import('../diagram/mermaid');
    for (const source of sources) {
      try {
        out.set(source, await renderDiagramPng(source));
      } catch {
        /* invalid diagram: written as text (DIAG-007) */
      }
    }
  } catch {
    /* engine unavailable: diagrams written as text (DIAG-007) */
  }
  return out;
}
