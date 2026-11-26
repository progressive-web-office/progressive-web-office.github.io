/**
 * Settings of the pseudonymisation kept in this browser (`pwo.pseudo`): the
 * options and the lists the user added. They hold no personal data — the
 * list of people and the table never go here.
 */
import { DEFAULT_OPTIONS, type PseudoOptions } from './pipeline';

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
