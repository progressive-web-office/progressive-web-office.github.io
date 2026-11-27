/**
 * The pseudonymisation of files (PSEUDO-014, PSEUDO-026, PSEUDO-027,
 * PSEUDO-032): format chosen from the content, the units of a whole document
 * scanned at once, the output written, read again and checked, and a report
 * made. No network: this module and those it uses only compute.
 */
import { detectFormat, type DocumentFormat } from '../core/format';
import { commonFromCorpus, corpusStats, createDetector, type Attribution, type Detector, type Markers, type MatchKind, type Person, type RosterNote, type TextUnit } from './engine';
import { openPackage } from './formats/package';
import { appPdfLoader, openPdfText, type PdfLoader, type PdfRaster } from './formats/pdf-text';
import { openText } from './formats/text';
import { editedTexts, type OpenedDocument, type UnitEdit, type VisualCheck } from './formats/types';
import { choiceFor, convertOutput, kindOfFormat, type OutputChoices } from './outputs';
import { LIMITS, Refusal, type RefusalCode } from './limits';
import { createReidentifier } from './reidentify';
import { createResidualChecker, statusOf, type Finding, type OutputStatus } from './residual';

export interface PseudoOptions {
  lastNameAlone: boolean;
  firstNameAlone: boolean;
  exclusions: string[];
  commonWords: string[];
  labels: string[];
  removePictures: boolean;
  removeLinkable: boolean;
  /** PSEUDO-043: the format of the outputs, by kind of file (`kept` when absent). */
  outputs: OutputChoices;
}

export const DEFAULT_OPTIONS: PseudoOptions = {
  lastNameAlone: true,
  firstNameAlone: false,
  exclusions: [],
  commonWords: [],
  labels: [],
  removePictures: false,
  removeLinkable: true,
  outputs: {},
};

export interface Replacement {
  kind: MatchKind;
  where: string;
  /** The text replaced (confidential: shown only on this device). */
  before: string;
  after: string;
  person?: string;
}

export interface FileReport {
  source: string;
  format?: DocumentFormat;
  status: OutputStatus | 'refused';
  refusal?: { code: RefusalCode | 'error'; detail: string };
  output?: string;
  /** Kept only in memory, for the download and the thumbnails. */
  outputBytes?: Uint8Array;
  attribution: Attribution;
  replacements: Replacement[];
  toCheck: VisualCheck[];
  removed: string[];
  findings: Finding[];
  /** Labelled values that did not look like names. */
  checks: { where: string; excerpt: string }[];
  pseudonymLike: number;
}

export interface RunReport {
  date: string;
  notes: RosterNote[];
  files: FileReport[];
}

export interface RunContext {
  people: readonly Person[];
  options: PseudoOptions;
  markers?: Markers;
  pdfLoader?: PdfLoader;
  /** PSEUDO-024: how pages are drawn as pictures (the browser's canvas by default). */
  pdfRaster?: PdfRaster;
  signal?: AbortSignal;
  progress?: (done: number, total: number, name: string) => void;
}

export interface InputFile {
  name: string;
  read(): Promise<Uint8Array>;
}

const yieldNow = (): Promise<void> => {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return s?.yield ? s.yield() : new Promise((r) => setTimeout(r, 0));
};

const PACKAGES = new Set<DocumentFormat>(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'mdz', 'texzip']);
const TEXTS = new Set<DocumentFormat>(['md', 'csv', 'text', 'tex', 'jl', 'marimo']);

/** Formats the pseudonymisation handles. */
export function handled(format: DocumentFormat | null): boolean {
  return !!format && (PACKAGES.has(format) || TEXTS.has(format) || format === 'pdf');
}

async function openFile(name: string, bytes: Uint8Array, format: DocumentFormat, ctx: RunContext): Promise<OpenedDocument> {
  if (PACKAGES.has(format)) return openPackage(bytes, name, { removePictures: ctx.options.removePictures, removeLinkable: ctx.options.removeLinkable, yieldNow, ...(ctx.signal ? { signal: ctx.signal } : {}) });
  if (TEXTS.has(format)) return openText(bytes, name);
  if (format === 'pdf') return openPdfText(bytes, name, ctx.pdfLoader, { keep: choiceFor(ctx.options.outputs, 'pdf') === 'kept', ...(ctx.pdfRaster ? { raster: ctx.pdfRaster } : {}) });
  throw new Refusal('unsupported-format', format);
}

function detectorFor(ctx: RunContext, learned: string[]): Detector {
  return createDetector({
    people: ctx.people,
    lastNameAlone: ctx.options.lastNameAlone,
    firstNameAlone: ctx.options.firstNameAlone,
    exclusions: ctx.options.exclusions,
    commonWords: [...ctx.options.commonWords, ...learned],
    labels: ctx.options.labels,
    ...(ctx.markers ? { markers: ctx.markers } : {}),
  });
}

const baseName = (path: string): string => path.split('/').pop() ?? path;

function outputName(attribution: Attribution, people: readonly Person[], index: number, ext: string, used: Set<string>): string {
  const pseudonyms = attribution.status === 'single' || attribution.status === 'group' ? attribution.people.map((p) => people.find((x) => x.key === p.key)!.pseudonym).sort() : [];
  const base = pseudonyms.length ? pseudonyms.join('_') : `copy-${String(index).padStart(3, '0')}`;
  let name = `${base}${ext}`;
  for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base}-${k}${ext}`;
  used.add(name.toLowerCase());
  return name;
}

const emptyAttribution: Attribution = { status: 'none', people: [] };

/** PSEUDO-024, PSEUDO-026: what a PDF output holds, read again from its bytes: the text of its pages and the strings of its objects. */
async function pdfCheckText(bytes: Uint8Array, loader: PdfLoader = appPdfLoader): Promise<Uint8Array> {
  const again = await openPdfText(bytes, 'output.pdf', loader);
  // The objects outside the streams (dictionaries, strings): the streams hold the pages, read above, and pictures.
  const raw = new TextDecoder('latin1').decode(bytes).replace(/stream\r?\n[\s\S]*?endstream/g, '');
  return new TextEncoder().encode(`${again.units.map((u) => u.text).join('\n')}\n${raw}`);
}

/** Pseudonymise files: one detector for the whole set, after a first pass that learns the common words. */
export async function pseudonymiseFiles(files: readonly InputFile[], ctx: RunContext): Promise<RunReport> {
  const opened = new Map<number, { bytes: Uint8Array; format: DocumentFormat | null; doc?: OpenedDocument; error?: FileReport['refusal'] }>();
  // 1. Open everything once: the texts of the set tell which names are common words (PSEUDO-011).
  const texts: string[] = [];
  for (const [i, f] of files.entries()) {
    if (ctx.signal?.aborted) throw ctx.signal.reason ?? new DOMException('Aborted', 'AbortError');
    ctx.progress?.(i, files.length * 2, f.name);
    const bytes = await f.read();
    const format = detectFormat(baseName(f.name), bytes);
    try {
      if (bytes.length > LIMITS.inputBytes) throw new Refusal('too-large', String(bytes.length));
      if (!handled(format)) throw new Refusal('unsupported-format', format ?? 'unknown');
      const doc = await openFile(baseName(f.name), bytes, format!, ctx);
      for (const u of doc.units) texts.push(u.text);
      opened.set(i, { bytes, format, doc });
    } catch (e) {
      opened.set(i, { bytes, format, error: e instanceof Refusal ? { code: e.code, detail: e.detail } : { code: 'error', detail: (e as Error).message } });
    }
    await yieldNow();
  }
  const learned = commonFromCorpus(corpusStats(texts, ctx.people), ctx.people);
  const detector = detectorFor(ctx, learned);
  const checker = createResidualChecker(ctx.people, { exclusions: ctx.options.exclusions, commonWords: [...ctx.options.commonWords, ...learned] });
  const used = new Set<string>();
  const reports: FileReport[] = [];
  // 2. Each file: scan, write, read again.
  for (const [i, f] of files.entries()) {
    if (ctx.signal?.aborted) throw ctx.signal.reason ?? new DOMException('Aborted', 'AbortError');
    ctx.progress?.(files.length + i, files.length * 2, f.name);
    const o = opened.get(i)!;
    const base: FileReport = { source: f.name, ...(o.format ? { format: o.format } : {}), status: 'refused', attribution: emptyAttribution, replacements: [], toCheck: [], removed: [], findings: [], checks: [], pseudonymLike: 0 };
    if (o.error || !o.doc) {
      reports.push({ ...base, refusal: o.error ?? { code: 'error', detail: '' } });
      continue;
    }
    try {
      const doc = o.doc;
      const detection = detector.scan(doc.units, { fileName: baseName(f.name) });
      const edits: UnitEdit[] = detection.matches;
      // PSEUDO-043: written in its own format, then converted where another one was chosen.
      const kind = kindOfFormat(o.format);
      const choice = kind === 'pdf' ? 'kept' : choiceFor(ctx.options.outputs, kind);
      const left: string[] = [];
      let bytes: Uint8Array;
      let extension = doc.outputExtension;
      if (choice === 'text') {
        bytes = new TextEncoder().encode(`${editedTexts(doc.units, edits).filter((t) => t.trim()).join('\n')}\n`);
        extension = '.txt';
      } else if (choice !== 'kept' && kind) {
        const converted = await convertOutput(await doc.write(edits), kind, choice);
        bytes = converted.bytes;
        extension = converted.extension;
        left.push(...converted.removed);
      } else bytes = await doc.write(edits);
      // Read after writing: a PDF says then which pages were drawn.
      const removed = [...doc.removed, ...left];
      const output = outputName(detection.attribution, ctx.people, i + 1, extension, used);
      const findings = checker.check(extension === '.pdf' ? await pdfCheckText(bytes, ctx.pdfLoader) : bytes, output, extension === '.pdf' || /^\.(txt|md|csv)$/.test(extension) || (choice === 'kept' && TEXTS.has(o.format!)));
      const unit = (k: number): TextUnit => doc.units[k]!;
      const checks = detection.checks.map((c) => ({ where: unit(c.unit).where, excerpt: unit(c.unit).text.slice(c.start, c.end) }));
      const unclear = detection.attribution.status === 'none' || detection.attribution.status === 'ambiguous' ? 1 : 0;
      reports.push({
        ...base,
        status: statusOf(findings, doc.toCheck.length, checks.length + unclear + (detection.pseudonymLike ? 1 : 0)),
        output,
        outputBytes: bytes,
        attribution: detection.attribution,
        replacements: detection.matches.map((m) => ({ kind: m.kind, where: unit(m.unit).where, before: unit(m.unit).text.slice(m.start, m.end), after: m.replacement, ...(m.person ? { person: m.person } : {}) })),
        toCheck: doc.toCheck,
        removed,
        findings,
        checks,
        pseudonymLike: detection.pseudonymLike,
      });
    } catch (e) {
      reports.push({ ...base, refusal: e instanceof Refusal ? { code: e.code, detail: e.detail } : { code: 'error', detail: (e as Error).message } });
    }
    await yieldNow();
  }
  ctx.progress?.(files.length * 2, files.length * 2, '');
  return { date: new Date().toISOString(), notes: [...detector.notes], files: reports };
}

/** The report as kept in the mapping table: without the bytes of the outputs. */
export function reportJson(report: RunReport): string {
  return JSON.stringify({ ...report, files: report.files.map(({ outputBytes: _b, toCheck, ...f }) => ({ ...f, toCheck: toCheck.map(({ bytes: _x, ...c }) => c) })) });
}

export interface ReidentifiedFile {
  bytes: Uint8Array;
  replaced: number;
  unknown: string[];
}

/** PSEUDO-030: a document sent back (DOCX, ODT, Markdown, text…) with the names in place of the pseudonyms. */
export async function reidentifyFile(name: string, bytes: Uint8Array, people: readonly Person[], prefix: string): Promise<ReidentifiedFile> {
  const format = detectFormat(name, bytes);
  if (!format || !(PACKAGES.has(format) || TEXTS.has(format))) throw new Refusal('unsupported-format', format ?? 'unknown');
  if (bytes.length > LIMITS.inputBytes) throw new Refusal('too-large', String(bytes.length));
  const doc = PACKAGES.has(format) ? await openPackage(bytes, name, { removeLinkable: false, yieldNow }) : openText(bytes, name);
  const r = createReidentifier(people, prefix);
  const edits: UnitEdit[] = [];
  const unknown: string[] = [];
  doc.units.forEach((u, i) => {
    for (const m of r.find(u.text)) {
      if (m.pseudonym) edits.push({ unit: i, start: m.start, end: m.end, replacement: m.replacement });
      else unknown.push(m.replacement);
    }
  });
  return { bytes: await doc.write(edits), replaced: edits.length, unknown };
}
