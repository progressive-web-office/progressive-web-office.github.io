/**
 * PSEUDO-043: the format of the outputs, chosen for each kind of file. A
 * file is always pseudonymised in its own format first (every part handled,
 * PSEUDO-018..PSEUDO-024); a conversion is made from that pseudonymised
 * output, and the converted file is then checked like any other (PSEUDO-026).
 */
import type { DocumentFormat } from '../core/format';

/** Kinds of files whose output format can be chosen. */
export type OutputKind = 'pdf' | 'docx' | 'odt' | 'md' | 'xlsx' | 'ods' | 'pptx' | 'odp';

/** `kept`: the same format; `text`: plain text; otherwise another format the application writes. */
export type OutputChoice = 'kept' | 'text' | 'docx' | 'odt' | 'md' | 'xlsx' | 'ods' | 'csv' | 'pptx' | 'odp';

export const OUTPUT_CHOICES: Record<OutputKind, readonly OutputChoice[]> = {
  pdf: ['kept', 'text'],
  docx: ['kept', 'odt', 'md', 'text'],
  odt: ['kept', 'docx', 'md', 'text'],
  md: ['kept', 'docx', 'odt', 'text'],
  xlsx: ['kept', 'ods', 'csv', 'text'],
  ods: ['kept', 'xlsx', 'csv', 'text'],
  pptx: ['kept', 'odp', 'text'],
  odp: ['kept', 'pptx', 'text'],
};

export const OUTPUT_KINDS = Object.keys(OUTPUT_CHOICES) as OutputKind[];

const EXTENSIONS: [RegExp, OutputKind][] = [
  [/\.pdf$/i, 'pdf'],
  [/\.(docx|dotx)$/i, 'docx'],
  [/\.(odt|ott)$/i, 'odt'],
  [/\.(md|markdown)$/i, 'md'],
  [/\.(xlsx|xltx)$/i, 'xlsx'],
  [/\.(ods|ots)$/i, 'ods'],
  [/\.(pptx|potx)$/i, 'pptx'],
  [/\.(odp|otp)$/i, 'odp'],
];

/** The kind of a file from its name, when its output format can be chosen. */
export const kindOfName = (name: string): OutputKind | undefined => EXTENSIONS.find(([re]) => re.test(name))?.[1];

/** The kind of a file from its detected format. */
export const kindOfFormat = (format: DocumentFormat | null | undefined): OutputKind | undefined => (format && (OUTPUT_KINDS as string[]).includes(format) ? (format as OutputKind) : undefined);

export type OutputChoices = Partial<Record<OutputKind, OutputChoice>>;

/** The choice for a kind, `kept` when none (or one no longer offered) was made. */
export function choiceFor(choices: OutputChoices | undefined, kind: OutputKind | undefined): OutputChoice {
  if (!kind) return 'kept';
  const c = choices?.[kind];
  return c && OUTPUT_CHOICES[kind].includes(c) ? c : 'kept';
}

/** Choices read back from the settings, keeping only those still offered. */
export function cleanChoices(raw: unknown): OutputChoices {
  const out: OutputChoices = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of OUTPUT_KINDS) {
    const c = (raw as Record<string, unknown>)[k];
    if (typeof c === 'string' && (OUTPUT_CHOICES[k] as readonly string[]).includes(c)) out[k] = c as OutputChoice;
  }
  return out;
}

export interface Converted {
  bytes: Uint8Array;
  extension: string;
  /** What the conversion left out (other sheets of a CSV…). */
  removed: string[];
}

/** Convert a pseudonymised output of kind `from` to `to` (neither `kept` nor `text`, handled by the caller). */
export async function convertOutput(bytes: Uint8Array, from: OutputKind, to: Exclude<OutputChoice, 'kept' | 'text'>): Promise<Converted> {
  if (from === 'docx' || from === 'odt' || from === 'md') {
    const { readDocument, writeDocument } = await import('../document/io');
    const doc = await readDocument(from, bytes);
    return { bytes: writeDocument(doc, to as 'docx' | 'odt' | 'md'), extension: `.${to}`, removed: [] };
  }
  if (from === 'xlsx' || from === 'ods') {
    const { readWorkbook, writeWorkbook } = await import('../sheet/io');
    const wb = readWorkbook(from, bytes);
    const removed = to === 'csv' && wb.sheets.length > 1 ? [`sheets ${wb.sheets.slice(1).map((_, i) => i + 2).join(', ')} (CSV holds one sheet)`] : [];
    return { bytes: writeWorkbook(wb, to as 'xlsx' | 'ods' | 'csv'), extension: `.${to}`, removed };
  }
  if (from === 'pptx' || from === 'odp') {
    const { readPresentation, writePresentation } = await import('../slides/io');
    return { bytes: writePresentation(readPresentation(from, bytes), to as 'pptx' | 'odp'), extension: `.${to}`, removed: [] };
  }
  throw new Error(`no conversion from ${from} to ${to}`);
}
