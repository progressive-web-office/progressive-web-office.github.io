/**
 * PSEUDO-023: a PDF file becomes a pseudonymised text file: the text of its
 * pages (lines rebuilt from the positions of the items, a wide gap becoming a
 * tab), its annotations and their authors, its form field values, its outline
 * and the names of its attachments. A page with a picture and almost no text
 * is marked as a scanned page, not processed (no OCR). Nothing is ever drawn
 * over a text that stays in a file: the output holds only text.
 */
import { LIMITS, Refusal } from '../limits';
import type { TextUnit } from '../engine';
import type { OpenedDocument, VisualCheck } from './types';

/** The parts of pdf.js used here (the real API, or a test double). */
export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  hasEOL?: boolean;
}

export interface PdfLike {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: unknown[] }>;
    getAnnotations(): Promise<{ subtype?: string; contentsObj?: { str?: string }; titleObj?: { str?: string }; fieldName?: string; fieldValue?: unknown; alternativeText?: string }[]>;
    getOperatorList(): Promise<{ fnArray: number[] }>;
  }>;
  getOutline(): Promise<{ title: string; items: unknown[] }[] | null>;
  getAttachments(): Promise<Map<string, { filename?: string; description?: string }> | Record<string, { filename?: string; description?: string }> | null>;
}

export type PdfLoader = (bytes: Uint8Array) => Promise<{ doc: PdfLike; imageOps: number[]; close?: () => Promise<void> }>;

/** The pdf.js loader of the application (assets from its own origin, no scripting). */
export const appPdfLoader: PdfLoader = async (bytes) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const asset = (dir: string): string => new URL(`pdfjs/${dir}/`, document.baseURI).href;
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    enableXfa: false,
    cMapUrl: asset('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: asset('standard_fonts'),
    wasmUrl: asset('wasm'),
    iccUrl: asset('iccs'),
  });
  const doc = await task.promise;
  return { doc: doc as unknown as PdfLike, imageOps: [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject], close: () => task.destroy() };
};

const isItem = (x: unknown): x is PdfTextItem => typeof (x as PdfTextItem).str === 'string' && Array.isArray((x as PdfTextItem).transform);

/** Lines of a page: items on one baseline joined, a gap wider than two font sizes becomes a tab. */
export function pageLines(items: readonly unknown[]): string[] {
  const words = items.filter(isItem).filter((i) => i.str.length);
  const lines: { y: number; parts: PdfTextItem[] }[] = [];
  for (const w of words) {
    const y = w.transform[5] ?? 0;
    const size = Math.hypot(w.transform[2] ?? 0, w.transform[3] ?? 0) || 10;
    let line = lines.find((l) => Math.abs(l.y - y) < size * 0.4);
    if (!line) lines.push((line = { y, parts: [] }));
    line.parts.push(w);
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map((l) => {
    const parts = l.parts.sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0));
    let out = '';
    let end: number | undefined;
    for (const p of parts) {
      const x = p.transform[4] ?? 0;
      const size = Math.hypot(p.transform[2] ?? 0, p.transform[3] ?? 0) || 10;
      if (!p.str.trim()) continue;
      if (end !== undefined) {
        const gap = x - end;
        out += gap > 2 * size ? '\t' : gap > size * 0.15 && !out.endsWith(' ') ? ' ' : '';
      }
      out += p.str;
      end = x + p.width;
    }
    return out.trimEnd();
  });
}

export async function openPdfText(bytes: Uint8Array, _name: string, load: PdfLoader = appPdfLoader): Promise<OpenedDocument> {
  const { doc, imageOps, close } = await load(bytes);
  try {
    if (doc.numPages > LIMITS.pdfPages) throw new Refusal('too-many-pages', String(doc.numPages));
    const lines: { text: string; where: string; role: TextUnit['role'] }[] = [];
    const toCheck: VisualCheck[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = pageLines(content.items);
      lines.push({ text: `--- ${n} ---`, where: `page ${n}`, role: 'other' });
      const chars = text.join('').replace(/\s/g, '').length;
      if (chars < 20) {
        const ops = await page.getOperatorList();
        if (ops.fnArray.some((f) => imageOps.includes(f))) {
          toCheck.push({ kind: 'scanned-page', where: `page ${n}` });
          lines.push({ text: `[${n}: scan]`, where: `page ${n}`, role: 'other' });
        }
      }
      for (const t of text) lines.push({ text: t, where: `page ${n}`, role: 'body' });
      for (const a of await page.getAnnotations()) {
        if (a.subtype === 'Widget') {
          const v = a.fieldValue;
          const value = typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : '';
          if (value.trim()) lines.push({ text: `${a.fieldName ?? ''} : ${value}`, where: `page ${n}, field ${a.fieldName ?? ''}`, role: 'field' });
          continue;
        }
        const author = a.titleObj?.str ?? '';
        const contents = a.contentsObj?.str ?? '';
        if (author.trim()) lines.push({ text: author, where: `page ${n}, annotation`, role: 'author' });
        if (contents.trim()) lines.push({ text: contents, where: `page ${n}, annotation`, role: 'comment' });
      }
    }
    const outline = await doc.getOutline();
    const walk = (items: { title: string; items: unknown[] }[]): void => {
      for (const i of items) {
        lines.push({ text: i.title, where: 'outline', role: 'meta' });
        walk(i.items as { title: string; items: unknown[] }[]);
      }
    };
    if (outline) walk(outline);
    const attachments = await doc.getAttachments();
    const list = attachments instanceof Map ? [...attachments.values()] : Object.values(attachments ?? {});
    for (const a of list) {
      if (a.filename) lines.push({ text: a.filename, where: 'attachment', role: 'meta' });
      if (a.description) lines.push({ text: a.description, where: 'attachment', role: 'meta' });
      toCheck.push({ kind: 'attachment', where: 'attachment' });
    }
    const units: TextUnit[] = lines.map((l) => ({ text: l.text, where: l.where, role: l.role }));
    return {
      units,
      toCheck,
      // The metadata (Info, XMP), the attachments and the scripts are not carried over.
      removed: ['PDF metadata', ...(list.length ? ['PDF attachments'] : [])],
      outputExtension: '.txt',
      async write(edits) {
        const out = units.map((u, i) => {
          const mine = edits.filter((e) => e.unit === i).sort((a, b) => a.start - b.start);
          let s = '';
          let at = 0;
          for (const e of mine) {
            if (e.start < at) continue;
            s += u.text.slice(at, e.start) + e.replacement;
            at = e.end;
          }
          return s + u.text.slice(at);
        });
        return new TextEncoder().encode(`${out.join('\n')}\n`);
      },
    };
  } finally {
    void close?.();
  }
}
