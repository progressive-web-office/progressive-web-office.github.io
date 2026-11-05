import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, decodePDFRawStream } from '@pdfme/pdf-lib';
import { applyEdits, drawingPdf, inspectPdf } from '../src/pdf/forms';
import { drawingOps, invert, parseColor, parseTransform, pathOps, WIN_ANSI, type VectorFont } from '../src/pdf/vector';
import { placeSymbol, type Drawing } from '../src/draw/model';
import { SYMBOLS } from '../src/draw/symbols';

const font: VectorFont = {
  encode: (s) => (/^[\x20-\xff]*$/.test(s) ? `<${[...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')}>` : null),
  width: (s, size) => s.length * size * 0.5,
};

const drawing = (): Drawing => ({
  width: 595,
  height: 842,
  grid: 0,
  shapes: [
    { id: 'a', kind: 'rect', x: 60, y: 80, w: 200, h: 40, fill: '#ffffff', stroke: '#ff0000', width: 1 },
    { id: 'b', kind: 'text', x: 70, y: 105, text: 'Vu et approuvé\nle 5 novembre', size: 14 },
    { id: 'c', kind: 'line', points: [[300, 100], [400, 200]], end: 'arrow', stroke: '#0000ff', width: 2 },
    { id: 'd', kind: 'ellipse', x: 100, y: 300, w: 80, h: 40, opacity: 0.5 },
    { id: 'e', kind: 'free', points: [[10, 10], [20, 30], [40, 35], [60, 20]] },
  ],
});

/** pdf.js's viewport transform of an A4 page at scale 1, and its inverse. */
const VIEW: [number, number, number, number, number, number] = [1, 0, 0, -1, 0, 842];

async function blank(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  doc.addPage([595, 842]);
  return doc.save();
}

describe('PDF-021 drawings written as PDF vectors', () => {
  it('converts SVG paths, arcs and relative commands', () => {
    expect(pathOps('M10 20L30 40H50V60Z')).toBe('10 20 m\n30 40 l\n50 40 l\n50 60 l\nh');
    expect(pathOps('m10 10 l5 5 5 -5')).toBe('10 10 m\n15 15 l\n20 10 l');
    expect(pathOps('M0 0Q10 0 10 10')).toBe('0 0 m\n6.667 0 10 3.333 10 10 c');
    const arc = pathOps('M0 0A10 10 0 0 1 20 0');
    expect(arc.split('\n').filter((l) => l.endsWith(' c'))).toHaveLength(2);
    expect(arc.endsWith('20 0 c')).toBe(true);
    // Cut short: no NaN in the stream.
    expect(pathOps('M0 0L10')).not.toContain('NaN');
  });

  it('reads colours and transforms', () => {
    expect(parseColor('#f00')).toEqual([1, 0, 0]);
    expect(parseColor('none')).toBeNull();
    expect(parseColor('currentColor', '#0000ff')).toEqual([0, 0, 1]);
    expect(parseTransform('translate(10 20) rotate(90)').map((v) => Math.round(v))).toEqual([0, 1, -1, 0, 10, 20]);
    expect(invert(VIEW)).toEqual([1, 0, 0, -1, 0, 842]);
  });

  it('writes shapes and text as operators, text kept as text', () => {
    const out = drawingOps(drawing(), font)!;
    expect(out).not.toBeNull();
    expect(out.text).toBe(true);
    expect(out.ops).toContain('60 80 200 40 re');
    expect(out.ops).toContain('1 0 0 RG');
    expect(out.ops).toContain('/F1 14 Tf');
    // Two lines, the second 1.2 × the size below.
    expect(out.ops).toContain('1 0 0 -1 70 105 Tm');
    expect(out.ops).toContain('1 0 0 -1 70 121.8 Tm');
    expect(out.states).toEqual({ GS50: 0.5 });
  });

  it('gives up on what the font cannot show, for a picture instead', () => {
    const d = drawing();
    d.shapes.push({ id: 'z', kind: 'text', x: 0, y: 0, text: '你好' });
    expect(drawingOps(d, font)).toBeNull();
  });

  it('saves the drawing as a stamp annotation, opened again as an editable drawing', async () => {
    const out = await applyEdits(await blank(), { values: {}, stamps: [], flatten: false, drawings: [{ page: 1, drawing: drawing(), matrix: invert(VIEW), author: 'Ann Lee' }] });
    const back = await PDFDocument.load(out);
    const annots = back.getPage(1).node.Annots()!;
    expect(annots.size()).toBe(1);
    const annot = annots.lookup(0) as PDFDict;
    expect(annot.get(PDFName.of('Subtype'))).toBe(PDFName.of('Stamp'));
    expect((annot.get(PDFName.of('Contents')) as PDFHexString).decodeText()).toBe('Vu et approuvé\nle 5 novembre');
    expect(annot.lookup(PDFName.of('Rect'))!.toString()).toBe('[ 0 0 595 842 ]');
    const ap = (annot.lookup(PDFName.of('AP')) as PDFDict).lookup(PDFName.of('N')) as PDFRawStream;
    const content = new TextDecoder().decode(decodePDFRawStream(ap).decode());
    expect(content).toContain('/F1 14 Tf');

    const info = await inspectPdf(out, { drawings: true });
    expect(info.drawings).toHaveLength(1);
    expect(info.drawings![0]!.page).toBe(1);
    expect(info.drawings![0]!.drawing.shapes.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    // The file shown and saved again holds the drawing no more: it is added back on saving.
    const stripped = await PDFDocument.load(info.bytes!);
    expect(stripped.getPage(1).node.Annots()?.size() ?? 0).toBe(0);
  });

  it('makes the drawing part of the page when flattened', async () => {
    const out = await applyEdits(await blank(), { values: {}, stamps: [], flatten: true, drawings: [{ page: 0, drawing: drawing(), matrix: invert(VIEW) }] });
    const back = await PDFDocument.load(out);
    expect(back.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
    const xobjects = back.getPage(0).node.Resources()!.lookup(PDFName.of('XObject')) as PDFDict;
    expect(xobjects.keys().length).toBe(1);
    expect((await inspectPdf(out, { drawings: true })).drawings).toBeUndefined();
  });

  it('uses a picture of the drawing when given one', async () => {
    // A 1×1 PNG.
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const out = await applyEdits(await blank(), { values: {}, stamps: [], flatten: false, drawings: [{ page: 0, drawing: drawing(), matrix: invert(VIEW), png }] });
    const back = await PDFDocument.load(out);
    const annot = back.getPage(0).node.Annots()!.lookup(0) as PDFDict;
    const ap = (annot.lookup(PDFName.of('AP')) as PDFDict).lookup(PDFName.of('N')) as PDFRawStream;
    expect(new TextDecoder().decode(decodePDFRawStream(ap).decode())).toContain('/Im1 Do');
  });
});

describe('DRAW-020 texts with parts of their own look', () => {
  const rich = (): Drawing => ({
    width: 300,
    height: 200,
    grid: 0,
    shapes: [
      {
        id: 't',
        kind: 'text',
        x: 10,
        y: 30,
        size: 12,
        text: 'Total: 42 $\nsigned',
        runs: [{ text: 'Total: ' }, { text: '42 $', bold: true, size: 20, fill: '#ff0000' }, { text: '\nsigned', italic: true, underline: true }],
      },
    ],
  });

  it('draws each part with its face, size and colour, side by side', () => {
    const out = drawingOps(rich(), font)!;
    expect(out.faces.sort()).toEqual(['B', 'I', 'R']);
    expect(out.ops).toContain('/F1 12 Tf');
    expect(out.ops).toContain('/F2 20 Tf');
    expect(out.ops).toContain('1 0 0 rg');
    // "Total: " is 7 characters of 6 units: the bold part starts after it.
    expect(out.ops).toContain('1 0 0 -1 52 30 Tm');
    // The second line below the first's large part; the underline a stroke.
    expect(out.ops).toContain('/F3 12 Tf\n1 0 0 -1 10 46.4 Tm');
    expect(out.ops).toMatch(/ l\nS\nQ/);
  });

  it('embeds the bold and italic fonts needed', async () => {
    const out = await applyEdits(await blank(), { values: {}, stamps: [], flatten: false, drawings: [{ page: 0, drawing: rich(), matrix: invert(VIEW) }] });
    const back = await PDFDocument.load(out);
    const annot = back.getPage(0).node.Annots()!.lookup(0) as PDFDict;
    const ap = (annot.lookup(PDFName.of('AP')) as PDFDict).lookup(PDFName.of('N')) as PDFRawStream;
    const fonts = (ap.dict.lookup(PDFName.of('Resources')) as PDFDict).lookup(PDFName.of('Font')) as PDFDict;
    const base = (k: string): string => String((fonts.lookup(PDFName.of(k)) as PDFDict).get(PDFName.of('BaseFont')));
    expect([base('F1'), base('F2'), base('F3')]).toEqual(['/Helvetica', '/Helvetica-Bold', '/Helvetica-Oblique']);
    // Opened again, the looks are kept.
    const info = await inspectPdf(out, { drawings: true });
    expect((info.drawings![0]!.drawing.shapes[0] as { runs?: unknown[] }).runs).toHaveLength(3);
  });
});

describe('DRAW-021 a drawing as a PDF', () => {
  it('is one page its size, drawn as vectors', async () => {
    const bytes = await drawingPdf({ ...drawing(), alt: 'Wiring' });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
    expect(doc.getTitle()).toBe('Wiring');
    expect(doc.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
    const xobjects = doc.getPage(0).node.Resources()!.lookup(PDFName.of('XObject')) as PDFDict;
    const form = xobjects.lookup(xobjects.keys()[0]!) as PDFRawStream;
    expect(new TextDecoder().decode(decodePDFRawStream(form).decode())).toContain('/F1 14 Tf');
  });

  it('writes every symbol of the library as vectors', () => {
    const bad = SYMBOLS.filter((def) => {
      const d: Drawing = { width: 200, height: 200, grid: 10, shapes: [] };
      placeSymbol(d, def.id, 100, 100).value = '4.7 kΩ';
      return !drawingOps(d, WIN_ANSI);
    }).map((def) => def.id);
    expect(bad).toEqual([]);
  });

  it('writes the Ω of a value with the Symbol font, the rest in Helvetica', async () => {
    const d: Drawing = { width: 200, height: 100, grid: 0, shapes: [{ id: 'v', kind: 'text', x: 10, y: 50, text: 'R1 4.7 kΩ' }] };
    const doc = await PDFDocument.load(await drawingPdf(d));
    const xobjects = doc.getPage(0).node.Resources()!.lookup(PDFName.of('XObject')) as PDFDict;
    const form = xobjects.lookup(xobjects.keys()[0]!) as PDFRawStream;
    const ops = new TextDecoder().decode(decodePDFRawStream(form).decode());
    expect(ops).toMatch(/\/F1 16 Tf\n1 0 0 -1 10 50 Tm\n<[0-9A-F]+> Tj\n\/F5 16 Tf\n1 0 0 -1 [\d.]+ 50 Tm\n<57> Tj/);
    const fonts = (form.dict.lookup(PDFName.of('Resources')) as PDFDict).lookup(PDFName.of('Font')) as PDFDict;
    expect(String((fonts.lookup(PDFName.of('F5')) as PDFDict).get(PDFName.of('BaseFont')))).toBe('/Symbol');
    // Told apart from what no standard font has.
    expect(drawingOps(d, WIN_ANSI)).not.toBeNull();
    expect(drawingOps({ ...d, shapes: [{ id: 'z', kind: 'text', x: 0, y: 0, text: '你好' }] }, WIN_ANSI)).toBeNull();
  });
});
