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
import { editedTexts, type OpenedDocument, type VisualCheck } from './types';

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

/** Where the text of a line comes from: the characters [start, end) are those of `item`. */
export interface LineSpan {
  start: number;
  end: number;
  item: PdfTextItem;
}

/** Lines of a page with the items they come from: items on one baseline joined, a gap wider than two font sizes becomes a tab. */
export function pageLayout(items: readonly unknown[]): { text: string; spans: LineSpan[] }[] {
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
    const spans: LineSpan[] = [];
    for (const p of parts) {
      const x = p.transform[4] ?? 0;
      const size = Math.hypot(p.transform[2] ?? 0, p.transform[3] ?? 0) || 10;
      if (!p.str.trim()) continue;
      if (end !== undefined) {
        const gap = x - end;
        out += gap > 2 * size ? '\t' : gap > size * 0.15 && !out.endsWith(' ') ? ' ' : '';
      }
      spans.push({ start: out.length, end: out.length + p.str.length, item: p });
      out += p.str;
      end = x + p.width;
    }
    return { text: out.trimEnd(), spans };
  });
}

/** Lines of a page (PSEUDO-023). */
export const pageLines = (items: readonly unknown[]): string[] => pageLayout(items).map((l) => l.text);

/** PSEUDO-024: a part of a page to mask, as a quadrilateral in the page's own coordinates, and the text written on it. */
export interface Mask {
  points: [number, number][];
  text: string;
}

/** The masks over the characters [start, end) of a line: one per item they cross, the replacement written on the first. */
export function masksOf(spans: readonly LineSpan[], start: number, end: number, replacement: string): Mask[] {
  const out: Mask[] = [];
  for (const s of spans) {
    const from = Math.max(start, s.start);
    const to = Math.min(end, s.end);
    if (from >= to) continue;
    const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = s.item.transform;
    const size = Math.hypot(c, d) || 10;
    const along = Math.hypot(a, b) || 1;
    const u: [number, number] = [a / along, b / along];
    const v: [number, number] = Math.hypot(c, d) ? [c / size, d / size] : [-u[1], u[0]];
    const len = s.item.str.length || 1;
    // A little wider and taller than the letters: accents, descenders, rounding of the widths.
    const pad = size * 0.08;
    const t0 = (s.item.width * (from - s.start)) / len - pad;
    const t1 = (s.item.width * (to - s.start)) / len + pad;
    const at = (t: number, k: number): [number, number] => [e + u[0] * t + v[0] * size * k, f + u[1] * t + v[1] * size * k];
    out.push({ points: [at(t0, -0.3), at(t1, -0.3), at(t1, 1.05), at(t0, 1.05)], text: out.length ? '' : replacement });
  }
  return out;
}

/** A page drawn as a picture, with its masks (`width` and `height` in points, the size of the page). */
export interface PagePicture {
  data: Uint8Array;
  type: 'jpeg' | 'png';
  width: number;
  height: number;
}

export type PdfRaster = (bytes: Uint8Array) => Promise<{ render(page: number, masks: readonly Mask[]): Promise<PagePicture>; close?(): Promise<void> }>;

/** Pages drawn by pdf.js at `dpi`, without their annotations, the masks painted over (in the browser). */
export const browserRaster =
  (dpi = 150): PdfRaster =>
  async (bytes) => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const asset = (dir: string): string => new URL(`pdfjs/${dir}/`, document.baseURI).href;
    const task = pdfjs.getDocument({ data: bytes.slice(), enableXfa: false, cMapUrl: asset('cmaps'), cMapPacked: true, standardFontDataUrl: asset('standard_fonts'), wasmUrl: asset('wasm'), iccUrl: asset('iccs') });
    const doc = await task.promise;
    return {
      async render(n, masks) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: dpi / 72 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: ctx, viewport, annotationMode: pdfjs.AnnotationMode.DISABLE }).promise;
        for (const m of masks) {
          const pts = m.points.map(([x, y]) => viewport.convertToViewportPoint(x, y) as [number, number]);
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          const x = Math.min(...xs);
          const y = Math.min(...ys);
          const w = Math.max(...xs) - x;
          const hgt = Math.max(...ys) - y;
          ctx.fillStyle = '#fff';
          ctx.fillRect(x, y, w, hgt);
          ctx.strokeStyle = '#999';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hgt - 1);
          if (m.text) {
            let size = Math.max(6, hgt * 0.7);
            ctx.font = `${size}px sans-serif`;
            const width = ctx.measureText(m.text).width;
            if (width > w - 2) size = Math.max(4, (size * (w - 2)) / width);
            ctx.font = `${size}px sans-serif`;
            ctx.fillStyle = '#000';
            ctx.textBaseline = 'middle';
            ctx.fillText(m.text, x + 1, y + hgt / 2);
          }
        }
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) throw new Error('no picture');
        return { data: new Uint8Array(await blob.arrayBuffer()), type: 'jpeg', width: base.width, height: base.height };
      },
      close: () => task.destroy(),
    };
  };

/** Entries of a copied page that may carry text or links to other files: annotations, metadata, private data, actions. */
const PAGE_KEYS = ['Annots', 'Metadata', 'PieceInfo', 'AA', 'B', 'Thumb'];

/**
 * PSEUDO-024: a new PDF, the pages with matches drawn as pictures with the
 * matches masked, the other pages copied without their annotations; nothing
 * of the document's metadata, XMP, outline, attachments, scripts or form.
 * A file pdf-lib cannot copy from (encrypted) has every page drawn.
 */
async function maskedPdf(bytes: Uint8Array, pages: number, masks: Map<number, Mask[]>, raster: PdfRaster, toCheck: VisualCheck[], removed: string[]): Promise<Uint8Array> {
  const { PDFDocument, PDFName } = await import('@pdfme/pdf-lib');
  let src: Awaited<ReturnType<typeof PDFDocument.load>> | null = null;
  try {
    src = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    src = null;
  }
  const out = await PDFDocument.create({ updateMetadata: false });
  const drawn: number[] = [];
  const r = await raster(bytes);
  try {
    for (let n = 1; n <= pages; n++) {
      const m = masks.get(n);
      if (m || !src) {
        const pic = await r.render(n, m ?? []);
        const img = pic.type === 'jpeg' ? await out.embedJpg(pic.data) : await out.embedPng(pic.data);
        out.addPage([pic.width, pic.height]).drawImage(img, { x: 0, y: 0, width: pic.width, height: pic.height });
        drawn.push(n);
        if (m) toCheck.push({ kind: 'picture', where: `page ${n}`, label: `${m.filter((x) => x.text).length}`, bytes: pic.data, mime: `image/${pic.type}` });
      } else {
        const [page] = await out.copyPages(src, [n - 1]);
        for (const k of PAGE_KEYS) page!.node.delete(PDFName.of(k));
        out.addPage(page!);
      }
    }
  } finally {
    await r.close?.();
  }
  if (drawn.length) removed.push(`PDF text of pages ${drawn.join(', ')} (drawn as pictures)`);
  removed.push('PDF annotations and form');
  return out.save({ useObjectStreams: false });
}

export interface PdfOpenOptions {
  /** PSEUDO-024: a PDF out, rather than text. */
  keep?: boolean;
  raster?: PdfRaster;
}

export async function openPdfText(bytes: Uint8Array, _name: string, load: PdfLoader = appPdfLoader, opts: PdfOpenOptions = {}): Promise<OpenedDocument> {
  const { doc, imageOps, close } = await load(bytes);
  try {
    if (doc.numPages > LIMITS.pdfPages) throw new Refusal('too-many-pages', String(doc.numPages));
    const lines: { text: string; where: string; role: TextUnit['role'] }[] = [];
    /** The page and the items of each line of a page, by unit. */
    const geometry = new Map<number, { page: number; spans: LineSpan[] }>();
    const toCheck: VisualCheck[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const layout = pageLayout(content.items);
      const text = layout.map((l) => l.text);
      lines.push({ text: `--- ${n} ---`, where: `page ${n}`, role: 'other' });
      const chars = text.join('').replace(/\s/g, '').length;
      if (chars < 20) {
        const ops = await page.getOperatorList();
        if (ops.fnArray.some((f) => imageOps.includes(f))) {
          toCheck.push({ kind: 'scanned-page', where: `page ${n}` });
          lines.push({ text: `[${n}: scan]`, where: `page ${n}`, role: 'other' });
        }
      }
      for (const l of layout) {
        geometry.set(lines.length, { page: n, spans: l.spans });
        lines.push({ text: l.text, where: `page ${n}`, role: 'body' });
      }
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
    const pages = doc.numPages;
    // The metadata (Info, XMP), the outline, the attachments and the scripts are not carried over.
    const removed = ['PDF metadata', ...(opts.keep ? ['PDF outline'] : []), ...(list.length ? ['PDF attachments'] : [])];
    if (opts.keep) {
      const raster = opts.raster ?? browserRaster();
      return {
        units,
        toCheck,
        removed,
        outputExtension: '.pdf',
        async write(edits) {
          const masks = new Map<number, Mask[]>();
          for (const e of edits) {
            const g = geometry.get(e.unit);
            if (!g) continue;
            const m = masksOf(g.spans, e.start, e.end, e.replacement);
            if (m.length) masks.set(g.page, [...(masks.get(g.page) ?? []), ...m]);
          }
          return maskedPdf(bytes, pages, masks, raster, toCheck, removed);
        },
      };
    }
    return {
      units,
      toCheck,
      removed,
      outputExtension: '.txt',
      async write(edits) {
        return new TextEncoder().encode(`${editedTexts(units, edits).join('\n')}\n`);
      },
    };
  } finally {
    void close?.();
  }
}
