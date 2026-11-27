/**
 * Built-in templates and examples (FILE-018): each builds a new document,
 * opened as an untitled file in the user's preferred format.
 */
import * as drawings from './drawings';
import type { MessageKey } from '../i18n';
import { readMarkdown } from '../document/markdown-reader';
import type { Paragraph, RichDocument } from '../document/model';
import { getCell, newWorkbook, setInput, type Workbook } from '../sheet/model';
import { applyCellStyle } from '../sheet/ops';
import { contentSlide, DEFAULT_SIZE, textShape, titleSlide, type Presentation, type Slide } from '../slides/model';
import { DOCUMENT_TEXTS, LABELS, type DocumentTexts, type TemplateLang } from './content';
import { labMarkdown } from './lab';
import { casMarkdown } from './cas';
import { widgetsMarkdown } from './widgets';
import { aeronauticsMarkdown, automationMarkdown, automotiveMarkdown, instrumentsMarkdown } from './instruments';
import { languagesMarkdown } from './languages';

export type Built =
  | { kind: 'document'; doc: RichDocument }
  | { kind: 'spreadsheet'; wb: Workbook }
  | { kind: 'presentation'; pres: Presentation }
  /** A drawing (SVG) or a picture (PNG), opened as a picture to edit (DRAW-001, DRAW-008). */
  | { kind: 'picture'; ext: 'svg' | 'png' | 'ora'; bytes: () => Promise<Uint8Array> };

export interface Template {
  id: string;
  kind: Built['kind'];
  /** An example showing the features, rather than a starting point. */
  example?: boolean;
  icon: string;
  /** i18n keys of the name and description. */
  name: MessageKey;
  description: MessageKey;
  build(lang: TemplateLang, today?: Date): Built;
}

/** Template content language for an interface language (Chinese uses the English content). */
export const contentLang = (locale: string): TemplateLang => (locale.startsWith('fr') ? 'fr' : 'en');

function documentFrom(text: keyof DocumentTexts, after?: (doc: RichDocument, lang: TemplateLang) => void): Template['build'] {
  return (lang, today = new Date()) => {
    const date = today.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    // The date of the front matter is the day's; `{date}` in the text is a field (DOC-041).
    const source = DOCUMENT_TEXTS[lang][text].replace(/^(---\n[\s\S]*?\n---\n)/, (front) => front.replace(/\{date\}/g, date));
    const doc = readMarkdown(source);
    // Its language: dates written as usual in it.
    doc.meta.language ??= lang;
    // Markdown keeps the extra front matter of a file: a template has none left.
    if (doc.extras) delete doc.extras.frontMatter;
    after?.(doc, lang);
    return { kind: 'document', doc };
  };
}

/** The lab report example: Python cells with their figures already drawn. */
function lab(lang: TemplateLang): Built {
  const doc = readMarkdown(labMarkdown(lang));
  if (doc.extras) delete doc.extras.frontMatter;
  return { kind: 'document', doc };
}

/** CAS-006: the computer algebra example: math cells and their results. */
function cas(lang: TemplateLang): Built {
  const doc = readMarkdown(casMarkdown(lang));
  if (doc.extras) delete doc.extras.frontMatter;
  return { kind: 'document', doc };
}

/** The interactive widgets example (CODE-016): a Python slider driving a plot, a JavaScript widget. */
function widgets(lang: TemplateLang): Built {
  const doc = readMarkdown(widgetsMarkdown(lang));
  if (doc.extras) delete doc.extras.frontMatter;
  return { kind: 'document', doc };
}

/** The instrument panel examples (CODE-016): the anywidget instruments, one family each, reactive controls and indicators. */
const instrumentsPage =
  (markdown: (lang: TemplateLang) => string) =>
  (lang: TemplateLang): Built => {
    const doc = readMarkdown(markdown(lang));
    if (doc.extras) delete doc.extras.frontMatter;
    return { kind: 'document', doc };
  };

/** The languages example (CODE-017, CODE-018): a small program in each language the cells run. */
function languages(lang: TemplateLang): Built {
  const doc = readMarkdown(languagesMarkdown(lang));
  if (doc.extras) delete doc.extras.frontMatter;
  return { kind: 'document', doc };
}

/** Measurements: a signal and a linear fit computed by formulas, with their charts (SHEET-024). */
function measurements(lang: TemplateLang): Workbook {
  const fr = lang === 'fr';
  const wb = newWorkbook();
  const signal = wb.sheets[0]!;
  signal.name = fr ? 'Signal' : 'Signal';
  setInput(signal, 'A1', 't (s)');
  setInput(signal, 'B1', fr ? 'x (amorti)' : 'x (damped)');
  setInput(signal, 'C1', fr ? 'enveloppe' : 'envelope');
  setInput(signal, 'E1', fr ? 'Amortissement' : 'Damping');
  setInput(signal, 'F1', '0.3');
  setInput(signal, 'E2', fr ? 'Fréquence (Hz)' : 'Frequency (Hz)');
  setInput(signal, 'F2', '1');
  for (let i = 0; i <= 50; i++) {
    const r = i + 2;
    setInput(signal, `A${r}`, String(i / 10));
    setInput(signal, `B${r}`, `=EXP(-$F$1*A${r})*SIN(2*PI()*$F$2*A${r})`);
    setInput(signal, `C${r}`, `=EXP(-$F$1*A${r})`);
  }
  for (const cell of signal.cells.values()) if (cell.formula) cell.numFmt = '0.000';
  signal.colWidths = new Map([[4, 130]]);
  signal.freeze = { rows: 1, cols: 0 };
  applyCellStyle(wb, 0, { r1: 0, c1: 0, r2: 0, c2: 2 }, { bold: true, fill: '#d9e2f3' });
  applyCellStyle(wb, 0, { r1: 0, c1: 5, r2: 1, c2: 5 }, { fill: '#fff2cc', border: true });
  signal.charts = [{ type: 'line', title: fr ? 'Oscillations amorties' : 'Damped oscillations', range: 'A1:C52', headers: true, anchor: { row: 4, col: 4 }, width: 520, height: 300 }];

  const ohm = { name: fr ? 'Loi d’Ohm' : 'Ohm’s law', cells: new Map() } as Workbook['sheets'][number];
  wb.sheets.push(ohm);
  const I = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const U = [0.47, 0.99, 1.38, 1.9, 2.31, 2.86, 3.27, 3.78, 4.2, 4.71];
  setInput(ohm, 'A1', 'I (mA)');
  setInput(ohm, 'B1', 'U (V)');
  I.forEach((v, k) => {
    setInput(ohm, `A${k + 2}`, String(v));
    setInput(ohm, `B${k + 2}`, String(U[k]));
  });
  const results: [string, string, string][] = [
    [fr ? 'R (Ω) = pente' : 'R (Ω) = slope', '=SLOPE(B2:B11,A2:A11)*1000', '0.0'],
    ['U0 (V)', '=INTERCEPT(B2:B11,A2:A11)', '0.000'],
    ['R²', '=RSQ(B2:B11,A2:A11)', '0.0000'],
    [fr ? 'Écart-type des résidus (V)' : 'Residual std. dev. (V)', '=SQRT((1-F3)*STDEV(B2:B11)^2*9/8)', '0.000'],
  ];
  results.forEach(([label, formula, fmt], k) => {
    setInput(ohm, `E${k + 1}`, label);
    setInput(ohm, `F${k + 1}`, formula);
    getCell(ohm, `F${k + 1}`)!.numFmt = fmt;
  });
  ohm.colWidths = new Map([[4, 190]]);
  applyCellStyle(wb, 1, { r1: 0, c1: 0, r2: 0, c2: 1 }, { bold: true, fill: '#d9e2f3' });
  applyCellStyle(wb, 1, { r1: 0, c1: 4, r2: 3, c2: 5 }, { border: true });
  applyCellStyle(wb, 1, { r1: 0, c1: 5, r2: 0, c2: 5 }, { bold: true, fill: '#e2efda' });
  ohm.charts = [{ type: 'scatter', title: fr ? 'U en fonction de I' : 'U against I', range: 'A1:B11', headers: true, anchor: { row: 6, col: 4 }, width: 460, height: 280 }];
  return wb;
}


/** A letter: the sender's block is one paragraph per line, the place and date on the right. */
/** Centimetres in points, rounded. */
const cm = (n: number): number => Math.round(n * 28.35);

/**
 * Lay a letter out as is usual in its language: in French (as in the NF Z 11-001
 * standard), the recipient, the place and date and the signature on the right,
 * from 9 cm; in English, every block on the left (block style). Blocks are
 * separated by vertical space, not empty lines.
 */
function letterLayout(doc: RichDocument, lang: TemplateLang): void {
  const p = doc.blocks.filter((b): b is Paragraph => b.type === 'paragraph');
  const at = (i: number, layout: Partial<Paragraph>): void => void (p.at(i) && Object.assign(p.at(i)!, layout));
  if (lang === 'fr') {
    // Sender, recipient, place and date, subject (and enclosures), salutation, body, signature.
    const right = cm(9);
    at(1, { indent: right, spaceBefore: cm(1) });
    at(2, { indent: right, spaceBefore: cm(0.8) });
    at(3, { spaceBefore: cm(1.2) });
    at(4, { spaceBefore: cm(0.8) });
    for (let i = 5; i < p.length - 1; i++) at(i, { align: 'justify', firstLine: cm(1.25) });
    at(-1, { indent: right, spaceBefore: cm(1.5) });
  } else {
    // Sender, date, recipient, subject, salutation, body, closing, signature, enclosures.
    at(1, { spaceBefore: cm(0.6) });
    at(2, { spaceBefore: cm(0.6) });
    at(3, { spaceBefore: cm(0.8) });
    at(4, { spaceBefore: cm(0.6) });
    at(-2, { spaceBefore: cm(1.5) });
    at(-1, { spaceBefore: cm(1) });
  }
}

function budget(lang: TemplateLang): Workbook {
  const L = LABELS[lang].budget;
  const wb = newWorkbook();
  const s = wb.sheets[0]!;
  s.name = L.sheet;
  const rows: (string | number)[][] = [
    [L.item, ...L.months, L.total],
    [L.income],
    [L.salary, 2100, 2100, 2100],
    [L.other, 150, 0, 300],
    [L.expenses, ...L.months],
    [L.rent, 750, 750, 750],
    [L.food, 420, 390, 450],
    [L.transport, 80, 80, 95],
    [L.leisure, 120, 200, 90],
    [L.balance],
  ];
  rows.forEach((row, r) => row.forEach((v, c) => setInput(s, [r, c], String(v))));
  const cols = ['B', 'C', 'D'];
  for (const r of [3, 4, 6, 7, 8, 9]) setInput(s, `E${r}`, `=SUM(B${r}:D${r})`);
  for (const c of [...cols, 'E']) setInput(s, `${c}10`, `=SUM(${c}3:${c}4)-SUM(${c}6:${c}9)`);
  for (const cell of s.cells.values()) if (typeof cell.value === 'number' || cell.formula) cell.numFmt = '#,##0.00';
  s.colWidths = new Map([[0, 160]]);
  s.freeze = { rows: 1, cols: 1 };
  // SHEET-014: headings in bold on a light fill, the balance stands out.
  applyCellStyle(wb, 0, { r1: 0, c1: 0, r2: 0, c2: 4 }, { bold: true, fill: '#d9e2f3' });
  for (const r of [1, 4]) applyCellStyle(wb, 0, { r1: r, c1: 0, r2: r, c2: 4 }, { bold: true });
  applyCellStyle(wb, 0, { r1: 9, c1: 0, r2: 9, c2: 4 }, { bold: true, fill: '#e2efda', border: true });
  // The expenses' heading row repeats the months: they name the series.
  s.charts = [{ type: 'column', title: L.chart, range: 'A5:D9', headers: true, anchor: { row: 11, col: 0 }, width: 480, height: 280 }];
  return wb;
}

function grades(lang: TemplateLang): Workbook {
  const L = LABELS[lang].grades;
  const wb = newWorkbook();
  const s = wb.sheets[0]!;
  s.name = L.sheet;
  [L.student, ...L.tests, L.average, L.mention].forEach((v, c) => setInput(s, [0, c], v));
  const marks = [
    [15, 17, 16],
    [11, 9.5, 12],
    [18, 16, 19],
    [8, 12, 10.5],
    [13, 14, 12],
    [9, 7.5, 11],
  ];
  L.students.forEach((name, i) => {
    const r = i + 2;
    setInput(s, `A${r}`, name);
    marks[i]!.forEach((m, j) => setInput(s, [r - 1, j + 1], String(m)));
    setInput(s, `E${r}`, `=ROUND(AVERAGE(B${r}:D${r}),1)`);
    const [a, b, c, d, e] = L.mentions;
    setInput(s, `F${r}`, `=IF(E${r}>=16,"${a}",IF(E${r}>=14,"${b}",IF(E${r}>=12,"${c}",IF(E${r}>=10,"${d}","${e}"))))`);
  });
  const last = L.students.length + 1;
  setInput(s, `A${last + 2}`, L.classAverage);
  for (const c of ['B', 'C', 'D', 'E']) setInput(s, `${c}${last + 2}`, `=ROUND(AVERAGE(${c}2:${c}${last}),1)`);
  setInput(s, `A${last + 3}`, L.passed);
  setInput(s, `E${last + 3}`, `=COUNTIF(E2:E${last},">=10")`);
  s.colWidths = new Map([[0, 170], [5, 120]]);
  s.freeze = { rows: 1, cols: 1 };
  applyCellStyle(wb, 0, { r1: 0, c1: 0, r2: 0, c2: 5 }, { bold: true, fill: '#d9e2f3', align: 'center' });
  return wb;
}

function invoice(lang: TemplateLang): Workbook {
  const L = LABELS[lang].invoice;
  const wb = newWorkbook();
  const s = wb.sheets[0]!;
  s.name = L.sheet;
  setInput(s, 'A1', L.title);
  setInput(s, 'A3', L.number);
  setInput(s, 'B3', '2026-001');
  setInput(s, 'A4', L.date);
  setInput(s, 'B4', '=TODAY()');
  getCell(s, 'B4')!.numFmt = 'yyyy-mm-dd';
  setInput(s, 'A5', L.client);
  [L.description, L.qty, L.price, L.amount].forEach((v, c) => setInput(s, [6, c], v));
  const items: [string, number, number][] = [
    [L.items[0], 12, 45],
    [L.items[1], 200, 0.35],
    [L.items[2], 1, 15],
  ];
  items.forEach(([d, q, p], i) => {
    const r = i + 8;
    setInput(s, `A${r}`, d);
    setInput(s, `B${r}`, String(q));
    setInput(s, `C${r}`, String(p));
    setInput(s, `D${r}`, `=B${r}*C${r}`);
  });
  setInput(s, 'C12', L.subtotal);
  setInput(s, 'D12', '=SUM(D8:D10)');
  setInput(s, 'C13', L.tax);
  setInput(s, 'B13', '20%');
  setInput(s, 'D13', '=D12*B13');
  setInput(s, 'C14', L.total);
  setInput(s, 'D14', '=D12+D13');
  for (const ref of ['C8', 'C9', 'C10', 'D8', 'D9', 'D10', 'D12', 'D13', 'D14']) getCell(s, ref)!.numFmt = '#,##0.00';
  s.colWidths = new Map([[0, 220], [2, 110], [3, 110]]);
  applyCellStyle(wb, 0, { r1: 0, c1: 0, r2: 0, c2: 0 }, { bold: true });
  applyCellStyle(wb, 0, { r1: 6, c1: 0, r2: 6, c2: 3 }, { bold: true, fill: '#d9e2f3', border: true });
  applyCellStyle(wb, 0, { r1: 7, c1: 0, r2: 9, c2: 3 }, { border: true });
  applyCellStyle(wb, 0, { r1: 13, c1: 2, r2: 13, c2: 3 }, { bold: true });
  return wb;
}

/** A4 landscape at 96 dpi: signs are printed one per page. */
const A4_LANDSCAPE = { width: 1123, height: 794 };

/** Width in em of a character in a bold sans-serif font, roughly (wide letters, capitals, digits, the rest). */
function charWidth(c: string): number {
  if (/[WM]/.test(c)) return 1.0;
  if (/[A-Z]|[À-Þ]/.test(c)) return 0.78;
  if (/[0-9]/.test(c)) return 0.7;
  if (c === ' ') return 0.35;
  if (/[a-z]|[ß-ÿ]/.test(c)) return 0.64;
  return 0.9;
}

/** The largest font size (points) for which `text` fits in a box, on one line. */
export function fitFontSize(text: string, boxWidth: number, boxHeight: number): number {
  const ems = [...text].reduce((n, c) => n + charWidth(c), 0) || 1;
  // A line is about 1.2 em high; keep 8 % to spare for the fonts that are wider.
  const px = Math.min(boxWidth / ems, boxHeight / 1.2) * 0.92;
  return Math.floor(px * 0.75);
}

/** Race signs (FILE-018): one big word, arrow or distance per page, in high-contrast colours. */
function raceSigns(lang: TemplateLang): Presentation {
  const L = LABELS[lang].signs;
  const { width, height } = A4_LANDSCAPE;
  const margin = 40;
  const sign = (text: string, background: string, color: string, caption?: string): Slide => {
    const boxH = caption ? height * 0.72 : height - 2 * margin;
    const big = textShape(text, {
      x: margin,
      y: margin,
      width: width - 2 * margin,
      height: boxH,
      anchor: 'middle',
      fontSize: fitFontSize(text, width - 2 * margin, boxH),
      paragraphs: [{ type: 'paragraph', style: 'normal', align: 'center', runs: [{ text, bold: true, color }] }],
    });
    const shapes = [big];
    if (caption) {
      shapes.push(
        textShape(caption, {
          x: margin,
          y: margin + boxH,
          width: width - 2 * margin,
          height: height - boxH - 2 * margin,
          anchor: 'middle',
          fontSize: 32,
          paragraphs: [{ type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: caption, color }] }],
        }),
      );
    }
    return { shapes, background, notes: L.notes };
  };
  const slides: Slide[] = [
    sign(L.start, '#1b7f3b', '#ffffff', L.event),
    sign('→', '#ffd400', '#000000'),
    sign('←', '#ffd400', '#000000'),
    sign('↑', '#ffd400', '#000000'),
    sign(`1 ${L.km}`, '#ffffff', '#000000', L.event),
    sign(`2 ${L.km}`, '#ffffff', '#000000', L.event),
    sign(L.water, '#0b5cad', '#ffffff', L.event),
    sign(L.finish, '#c4161c', '#ffffff', L.event),
  ];
  return { ...A4_LANDSCAPE, slides, resources: new Map(), meta: { title: L.title } };
}

function talk(lang: TemplateLang): Presentation {
  const L = LABELS[lang].talk;
  const first = titleSlide();
  first.shapes[0]!.paragraphs = [{ type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: L.title }] }];
  first.shapes[1]!.paragraphs = [{ type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: L.subtitle }] }];
  const slides: Slide[] = [first];
  for (const s of L.slides) {
    const slide = contentSlide();
    slide.shapes[0]!.paragraphs = [{ type: 'paragraph', style: 'normal', runs: [{ text: s.title }] }];
    slide.shapes[1]!.paragraphs = s.points.map((p) => ({ type: 'paragraph', style: 'normal', list: { ordered: false, level: 0 }, runs: [{ text: p }] }));
    if (s.notes) slide.notes = s.notes;
    slides.push(slide);
  }
  return { ...DEFAULT_SIZE, slides, resources: new Map(), meta: { title: L.title } };
}

export const TEMPLATES: Template[] = [
  { id: 'letter', kind: 'document', icon: '✉️', name: 'tpl.letter', description: 'tpl.letterDesc', build: documentFrom('letter', letterLayout) },
  { id: 'report', kind: 'document', icon: '📘', name: 'tpl.report', description: 'tpl.reportDesc', build: documentFrom('report') },
  { id: 'minutes', kind: 'document', icon: '🗒️', name: 'tpl.minutes', description: 'tpl.minutesDesc', build: documentFrom('minutes') },
  { id: 'exercises', kind: 'document', icon: '✏️', name: 'tpl.exercises', description: 'tpl.exercisesDesc', build: documentFrom('exercises') },
  { id: 'article', kind: 'document', icon: '🔬', name: 'tpl.article', description: 'tpl.articleDesc', build: documentFrom('article') },
  { id: 'newspaper', kind: 'document', icon: '📰', name: 'tpl.newspaper', description: 'tpl.newspaperDesc', build: documentFrom('newspaper') },
  { id: 'budget', kind: 'spreadsheet', icon: '💶', name: 'tpl.budget', description: 'tpl.budgetDesc', build: (lang) => ({ kind: 'spreadsheet', wb: budget(lang) }) },
  { id: 'grades', kind: 'spreadsheet', icon: '🎓', name: 'tpl.grades', description: 'tpl.gradesDesc', build: (lang) => ({ kind: 'spreadsheet', wb: grades(lang) }) },
  { id: 'invoice', kind: 'spreadsheet', icon: '🧾', name: 'tpl.invoice', description: 'tpl.invoiceDesc', build: (lang) => ({ kind: 'spreadsheet', wb: invoice(lang) }) },
  { id: 'talk', kind: 'presentation', icon: '🎤', name: 'tpl.talk', description: 'tpl.talkDesc', build: (lang) => ({ kind: 'presentation', pres: talk(lang) }) },
  { id: 'race-signs', kind: 'presentation', icon: '🏁', name: 'tpl.signs', description: 'tpl.signsDesc', build: (lang) => ({ kind: 'presentation', pres: raceSigns(lang) }) },
  // DRAW-012: drawings and schematics, and pictures made here (CC0).
  ...(
    [
      ['circuit-rc', '🔌', 'tpl.rc', 'tpl.rcDesc', drawings.rcCircuit],
      ['ladder-latch', '🪜', 'tpl.ladder', 'tpl.ladderDesc', drawings.ladderLatch],
      ['grafcet', '🔁', 'tpl.grafcet', 'tpl.grafcetDesc', drawings.grafcetCycle],
      ['pneumatic', '💨', 'tpl.pneumatic', 'tpl.pneumaticDesc', drawings.pneumaticCylinder],
      ['flowchart', '🔀', 'tpl.flowchart', 'tpl.flowchartDesc', drawings.flowchart],
    ] as const
  ).map(([id, icon, name, description, make]): Template => ({ id, kind: 'picture', icon, name, description, build: (lang) => ({ kind: 'picture', ext: 'svg', bytes: async () => new TextEncoder().encode(make(lang)) }) })),
  ...(
    [
      ['graph-paper', '📐', 'tpl.graphPaper', 'tpl.graphPaperDesc', drawings.graphPaper],
      ['colour-wheel', '🎨', 'tpl.colourWheel', 'tpl.colourWheelDesc', drawings.colourWheel],
      ['pixel-art', '👾', 'tpl.pixelArt', 'tpl.pixelArtDesc', drawings.pixelCanvas],
    ] as const
  ).map(([id, icon, name, description, make]): Template => ({ id, kind: 'picture', icon, name, description, build: () => ({ kind: 'picture', ext: 'png', bytes: make }) })),
  // DRAW-013: a picture in layers, to see what they do.
  { id: 'layered-poster', kind: 'picture', example: true, icon: '🗂', name: 'tpl.layeredPoster', description: 'tpl.layeredPosterDesc', build: (lang) => ({ kind: 'picture', ext: 'ora', bytes: () => drawings.layeredPoster(lang) }) },
  { id: 'tour', kind: 'document', example: true, icon: '🧭', name: 'tpl.tour', description: 'tpl.tourDesc', build: documentFrom('tour') },
  { id: 'lab', kind: 'document', example: true, icon: '🧪', name: 'tpl.lab', description: 'tpl.labDesc', build: lab },
  { id: 'cas', kind: 'document', example: true, icon: '∑', name: 'tpl.cas', description: 'tpl.casDesc', build: cas },
  { id: 'widgets', kind: 'document', example: true, icon: '🎛️', name: 'tpl.widgets', description: 'tpl.widgetsDesc', build: widgets },
  { id: 'instruments', kind: 'document', example: true, icon: '🏭', name: 'tpl.instruments', description: 'tpl.instrumentsDesc', build: instrumentsPage(instrumentsMarkdown) },
  { id: 'instruments-automation', kind: 'document', example: true, icon: '🤖', name: 'tpl.automation', description: 'tpl.automationDesc', build: instrumentsPage(automationMarkdown) },
  { id: 'instruments-aeronautics', kind: 'document', example: true, icon: '✈️', name: 'tpl.aeronautics', description: 'tpl.aeronauticsDesc', build: instrumentsPage(aeronauticsMarkdown) },
  { id: 'instruments-automotive', kind: 'document', example: true, icon: '🚗', name: 'tpl.automotive', description: 'tpl.automotiveDesc', build: instrumentsPage(automotiveMarkdown) },
  { id: 'languages', kind: 'document', example: true, icon: '🔤', name: 'tpl.languages', description: 'tpl.languagesDesc', build: languages },
  { id: 'measurements', kind: 'spreadsheet', example: true, icon: '📈', name: 'tpl.measurements', description: 'tpl.measurementsDesc', build: (lang) => ({ kind: 'spreadsheet', wb: measurements(lang) }) },
];
