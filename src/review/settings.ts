/**
 * Reading and review settings (SET-002): how PDF files and text documents in
 * review mode are shown when they open, shared by both.
 */
import { PAGES_PER_ROW } from '../pdf/fit';

/** Pages scrolled one after the other, or shown a spread at a time (REVIEW-001). */
export type PageFlow = 'scroll' | 'pages';

export interface ReadingSettings {
  /** Pages side by side. */
  perRow: number;
  /** SET-002: fit the width, the whole page, or a percentage (1 = 100 %, the default). */
  zoom: 'width' | 'page' | number;
  flow: PageFlow;
  /** The choices made in the toolbar become the defaults. */
  rememberLast: boolean;
  /** REVIEW-006: the review mode, for every file (PDF files and text documents) until it is left. */
  review: boolean;
}

const KEY = 'pwo.reading';
/** Where the PDF viewer kept its last view before these settings. */
const FORMER_PDF_KEY = 'pwo.pdf.view';

export const DEFAULT_READING: ReadingSettings = { perRow: 1, zoom: 1, flow: 'scroll', rememberLast: true, review: false };

/**
 * SET-002: a zoom is only taken from the settings window. Settings written
 * before (version 1 held the old default, the width; version 2 the last zoom
 * of the toolbar) hold no choice of the user's: files open at 100 %.
 */
const ZOOM_VERSION = 3;

function read(key: string): Record<string, unknown> | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function loadReading(): ReadingSettings {
  const former = read(FORMER_PDF_KEY);
  const v = read(KEY) ?? (former ? { ...former, perRow: former.columns } : {});
  const d = DEFAULT_READING;
  return {
    perRow: (PAGES_PER_ROW as readonly number[]).includes(v.perRow as number) ? (v.perRow as number) : d.perRow,
    zoom: v.zoomVersion !== ZOOM_VERSION ? d.zoom : v.zoom === 'page' || v.zoom === 'width' ? v.zoom : typeof v.zoom === 'number' && v.zoom >= 0.1 && v.zoom <= 8 ? v.zoom : d.zoom,
    flow: v.flow === 'pages' || v.flow === 'scroll' ? v.flow : d.flow,
    rememberLast: typeof v.rememberLast === 'boolean' ? v.rememberLast : d.rememberLast,
    // Formerly one setting for PDF files and one for documents.
    review: typeof v.review === 'boolean' ? v.review : v.pdfReview === true || v.docReview === true,
  };
}

/** Change settings (the settings window). */
export function saveReading(changes: Partial<ReadingSettings>): ReadingSettings {
  const next = { ...loadReading(), ...changes };
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...next, zoomVersion: ZOOM_VERSION }));
  } catch {
    /* storage unavailable: the choice lasts for this page */
  }
  return next;
}

/** A choice made in the toolbar: it becomes the default when the user wants it to. The zoom is not one (SET-002). */
export function rememberReading(changes: Partial<Pick<ReadingSettings, 'perRow' | 'flow'>>): void {
  if (!loadReading().rememberLast) return;
  const { perRow, flow } = changes;
  saveReading({ ...(perRow !== undefined ? { perRow } : {}), ...(flow !== undefined ? { flow } : {}) });
}
