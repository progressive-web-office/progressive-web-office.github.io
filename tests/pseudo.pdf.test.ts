// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { openPdfText, pageLines, type PdfLike, type PdfLoader } from '../src/pseudo/formats/pdf-text';
import { createDetector } from '../src/pseudo/engine';
import { createResidualChecker } from '../src/pseudo/residual';
import { PEOPLE_WITH_PSEUDONYMS as people, pdfFixture } from './pseudo-fixtures';

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
