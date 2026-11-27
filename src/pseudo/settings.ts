/**
 * Settings of the pseudonymisation kept in this browser (`pwo.pseudo`): the
 * options and the lists the user added. They hold no personal data — the
 * list of people and the table never go here.
 */
import { DEFAULT_OPTIONS, type PseudoOptions } from './pipeline';
import { foldText } from './normalize';
import type { ColumnMapping } from './roster';
import { cleanChoices } from './outputs';

const KEY = 'pwo.pseudo';
const NOTICE_KEY = 'pwo.pseudo.notice';

/** PSEUDO-002: the version of the notice; a new text asks for a new acknowledgement. */
export const NOTICE_VERSION = 1;

export function loadOptions(): PseudoOptions {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PseudoOptions>;
    return {
      ...DEFAULT_OPTIONS,
      ...raw,
      exclusions: Array.isArray(raw.exclusions) ? raw.exclusions.filter((x) => typeof x === 'string') : [],
      commonWords: Array.isArray(raw.commonWords) ? raw.commonWords.filter((x) => typeof x === 'string') : [],
      labels: Array.isArray(raw.labels) ? raw.labels.filter((x) => typeof x === 'string') : [],
      // PSEUDO-043: the formats chosen, by kind of file.
      outputs: cleanChoices(raw.outputs),
    };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveOptions(options: PseudoOptions): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(options));
  } catch {
    /* storage full or blocked: the options last for this session */
  }
}

export function noticeAcknowledged(): boolean {
  try {
    return (JSON.parse(localStorage.getItem(NOTICE_KEY) ?? '{}') as { version?: number }).version === NOTICE_VERSION;
  } catch {
    return false;
  }
}

export function acknowledgeNotice(now = new Date()): void {
  localStorage.setItem(NOTICE_KEY, JSON.stringify({ version: NOTICE_VERSION, date: now.toISOString() }));
}

/** A list typed by the user: one item per line or comma. */
export const parseList = (text: string): string[] => [...new Set(text.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean))];

// ---------------------------------------------------------------- columns of lists (PSEUDO-038)

const MAPPINGS_KEY = 'pwo.pseudo.columns';
const MAX_MAPPINGS = 30;

/** The headers of a list, as a key: the headers only, never the rows. */
export const headerSignature = (headers: readonly string[]): string => headers.map((h) => foldText(h.trim())).join('\u001f');

type Remembered = Omit<ColumnMapping, 'header'>;

function mappings(): [string, Remembered][] {
  try {
    const raw = JSON.parse(localStorage.getItem(MAPPINGS_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw.filter((x) => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'object') as [string, Remembered][]) : [];
  } catch {
    return [];
  }
}

/** The columns chosen last time for lists with these headers. */
export function rememberedColumns(headers: readonly string[]): Remembered | undefined {
  const sig = headerSignature(headers);
  return mappings().find(([k]) => k === sig)?.[1];
}

export function rememberColumns(headers: readonly string[], mapping: ColumnMapping): void {
  const sig = headerSignature(headers);
  const { header: _h, ...columns } = mapping;
  const kept = mappings().filter(([k]) => k !== sig);
  kept.unshift([sig, columns]);
  try {
    localStorage.setItem(MAPPINGS_KEY, JSON.stringify(kept.slice(0, MAX_MAPPINGS)));
  } catch {
    /* storage full or blocked */
  }
}
