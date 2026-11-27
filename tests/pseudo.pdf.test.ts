// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { masksOf, openPdfText, pageLayout, pageLines, type Mask, type PdfLike, type PdfLoader, type PdfRaster } from '../src/pseudo/formats/pdf-text';
import { DEFAULT_OPTIONS, pseudonymiseFiles } from '../src/pseudo/pipeline';
import { PDFDocument, PDFName } from '@pdfme/pdf-lib';
import { createDetector } from '../src/pseudo/engine';
import { createResidualChecker } from '../src/pseudo/residual';
import { PEOPLE_WITH_PSEUDONYMS as people, PNG_1PX, pdfFixture } from './pseudo-fixtures';

const nodeLoader: PdfLoader = async (bytes) => {
  const task = pdfjs.getDocument({ data: bytes.slice(), enableXfa: false, verbosity: 0 });
  const doc = await task.promise;
  return { doc: doc as unknown as PdfLike, imageOps: [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject], close: () => task.destroy() };
};

describe('PSEUDO-023 PDF as pseudonymised text', () => {
  it('rebuilds lines: items of one baseline joined, a wide gap becomes a tab', () => {
    const item = (str: string, x: number, y: number, width: number) => ({ str, transform: [12, 0, 0, 12, x, y], width, hasEOL: false });
    expect(pageLines([item('Mesures de Jean-Pierre', 50, 720, 130), item("D'Alembert.", 182, 720, 60), item('Nom :', 50, 740, 30), item('masse', 300, 740, 30)])).toEqual([
      'Nom :\tmasse',
      "Mesures de Jean-Pierre D'Alembert.",
    ]);
  });

  it('extracts pages, fields, annotations, outline and attachments, marks the scanned page, and replaces the names', async () => {
    const f = await pdfFixture();
    const doc = await openPdfText(f.bytes, f.name, nodeLoader);
    expect(doc.outputExtension).toBe('.txt');
    expect(doc.toCheck.map((c) => c.kind)).toEqual(expect.arrayContaining(['scanned-page', 'attachment']));
    expect(doc.toCheck.find((c) => c.kind === 'scanned-page')?.where).toBe('page 3');
    const detector = createDetector({ people });
    const detection = detector.scan(doc.units, { fileName: f.name });
    const out = new TextDecoder().decode(await doc.write(detection.matches));
    for (const p of f.planted.filter((x) => !['Info', 'XMP'].includes(x.part))) expect(out, `${p.part}: ${p.text}`).not.toContain(p.text);
    for (const d of f.decoys) expect(out, d.text).toContain(d.text);
    expect(out).toContain('Nom :\tmasse volumique 7850 kg/m3');
    expect(out).toContain('[3: scan]');
    expect(detection.attribution.people[0]?.key).toBe('lea');
    // Nothing of the metadata is carried over.
    expect(out).not.toContain('Compte rendu de');
    expect(createResidualChecker(people).check(new TextEncoder().encode(out), 'ETU-101.txt', true).filter((x) => x.kind === 'residue')).toEqual([]);
  }, 30_000);
});

describe('PSEUDO-024 PDF kept as PDF, the matches masked', () => {
  it('places a mask over the characters of a match, across the items of a line, the replacement on the first', () => {
    const item = (str: string, x: number, width: number) => ({ str, transform: [10, 0, 0, 10, x, 700], width, hasEOL: false });
    const [line] = pageLayout([item('Nom : Léa', 50, 45), item('Martin', 100, 30)]);
    expect(line!.text).toBe('Nom : Léa Martin');
    const at = line!.text.indexOf('Léa');
    const masks = masksOf(line!.spans, at, line!.text.length, 'ETU-101');
    expect(masks).toHaveLength(2);
    expect(masks.map((m) => m.text)).toEqual(['ETU-101', '']);
    const xs = (m: Mask) => m.points.map((p) => p[0]);
    const ys = (m: Mask) => m.points.map((p) => p[1]);
    // "Léa" is the last 3 of 9 characters of the first item (45 wide): from x = 50 + 30, a little wider.
    expect(Math.min(...xs(masks[0]!))).toBeCloseTo(80 - 0.8, 5);
    expect(Math.max(...xs(masks[0]!))).toBeCloseTo(95 + 0.8, 5);
    expect(Math.min(...xs(masks[1]!))).toBeCloseTo(100 - 0.8, 5);
    // Below the baseline (descenders) and above the capitals.
    expect(Math.min(...ys(masks[0]!))).toBeLessThan(700);
    expect(Math.max(...ys(masks[0]!))).toBeGreaterThan(709);
  });

  it('draws the pages with matches as pictures, copies the others, and leaves out annotations, form, outline, attachments and metadata', async () => {
    const f = await pdfFixture();
    const drawn: { page: number; masks: readonly Mask[] }[] = [];
    const raster: PdfRaster = async () => ({
      async render(page, masks) {
        drawn.push({ page, masks });
        return { data: PNG_1PX, type: 'png', width: 595, height: 842 };
      },
    });
    const report = await pseudonymiseFiles([{ name: f.name, read: async () => f.bytes }], { people, options: DEFAULT_OPTIONS, pdfLoader: nodeLoader, pdfRaster: raster });
    const r = report.files[0]!;
    expect(r.refusal).toBeUndefined();
    expect(r.output).toMatch(/\.pdf$/);
    // Only the first page has names.
    expect(drawn.map((d) => d.page)).toEqual([1]);
    expect(drawn[0]!.masks.map((m) => m.text).filter(Boolean).length).toBeGreaterThanOrEqual(4);
    expect(r.toCheck.find((c) => c.kind === 'picture')?.where).toBe('page 1');
    expect(r.removed.join(' ')).toContain('pages 1');
    const out = await openPdfText(r.outputBytes!, r.output!, nodeLoader);
    const text = out.units.map((u) => u.text).join('\n');
    for (const p of f.planted) expect(text, `${p.part}: ${p.text}`).not.toContain(p.text);
    for (const d of f.decoys.filter((x) => x.part === 'page 2')) expect(text, d.text).toContain(d.text);
    const pdf = await PDFDocument.load(r.outputBytes!, { updateMetadata: false });
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getTitle()).toBeUndefined();
    expect(pdf.getAuthor()).toBeUndefined();
    expect(pdf.catalog.get(PDFName.of('Outlines'))).toBeUndefined();
    expect(pdf.catalog.get(PDFName.of('Names'))).toBeUndefined();
    expect(pdf.catalog.get(PDFName.of('AcroForm'))).toBeUndefined();
    expect(pdf.catalog.get(PDFName.of('Metadata'))).toBeUndefined();
    // pdf-lib gives every page an array of annotations: it stays empty.
    for (const page of pdf.getPages()) expect(page.node.Annots()?.size() ?? 0).toBe(0);
    expect(r.findings.filter((x) => x.kind === 'residue')).toEqual([]);
  }, 30_000);

  it('still gives text where the user asks for it', async () => {
    const f = await pdfFixture();
    const report = await pseudonymiseFiles([{ name: f.name, read: async () => f.bytes }], { people, options: { ...DEFAULT_OPTIONS, outputs: { pdf: 'text' } }, pdfLoader: nodeLoader });
    expect(report.files[0]!.output).toMatch(/\.txt$/);
  }, 30_000);
});
