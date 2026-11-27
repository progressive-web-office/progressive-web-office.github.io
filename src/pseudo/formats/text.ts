/**
 * PSEUDO-022: Markdown, text, CSV, LaTeX and source files. The whole text is
 * processed; encoding, byte order mark and line ends are kept. Lines are
 * units; CSV cells, tab-separated fields and Markdown table cells are units
 * with their place in the table, so that a value never runs into the next
 * cell and a header "Nom" takes the column below it.
 */
import type { TextUnit } from '../engine';
import { detectSeparator } from '../roster';
import type { OpenedDocument, UnitEdit } from './types';

export interface DecodedFile {
  text: string;
  encoding: 'utf-8' | 'windows-1252';
  bom: boolean;
}

export function decodeFile(bytes: Uint8Array): DecodedFile {
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bom ? bytes.subarray(3) : bytes), encoding: 'utf-8', bom };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252', bom: false };
  }
}

const CP1252: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b,
  'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99,
  'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

/** Windows-1252 bytes of a text, or null when a character has none. */
export function encodeCp1252(text: string): Uint8Array | null {
  const out = new Uint8Array(text.length);
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out[n++] = c;
    else if (CP1252[ch] !== undefined) out[n++] = CP1252[ch]!;
    else return null;
  }
  return out.slice(0, n);
}

export function encodeFile(text: string, from: DecodedFile): Uint8Array {
  if (from.encoding === 'windows-1252') {
    const bytes = encodeCp1252(text);
    if (bytes) return bytes;
  }
  const body = new TextEncoder().encode(text);
  // A Windows-1252 file that can no longer be one becomes UTF-8 with a byte order mark.
  if (!from.bom && from.encoding === 'utf-8') return body;
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(body, 3);
  return out;
}

interface Span {
  start: number;
  end: number;
  cell?: TextUnit['cell'];
}

/** CSV cells with their positions in the text (inside the quotes). */
function csvSpans(text: string, sep: string): Span[] {
  const spans: Span[] = [];
  let row = 0;
  let col = 0;
  let i = 0;
  while (i <= text.length) {
    let start = i;
    let end: number;
    if (text[i] === '"') {
      start = i + 1;
      let j = start;
      for (;;) {
        const q = text.indexOf('"', j);
        if (q < 0) {
          j = text.length;
          break;
        }
        if (text[q + 1] === '"') j = q + 2;
        else {
          j = q;
          break;
        }
      }
      end = j;
      i = Math.min(text.length, j + 1);
      while (i < text.length && text[i] !== sep && text[i] !== '\n' && text[i] !== '\r') i++;
    } else {
      while (i < text.length && text[i] !== sep && text[i] !== '\n' && text[i] !== '\r') i++;
      end = i;
    }
    spans.push({ start, end, cell: { table: 'csv', row, col } });
    if (i >= text.length) break;
    if (text[i] === sep) {
      col++;
      i++;
    } else {
      if (text[i] === '\r' && text[i + 1] === '\n') i++;
      i++;
      row++;
      col = 0;
      if (i >= text.length) break;
    }
  }
  return spans;
}

/** Lines, split into cells when they hold tabs or are Markdown table rows. */
function lineSpans(text: string, markdown: boolean): Span[] {
  const spans: Span[] = [];
  let table = 0;
  let row = 0;
  let inTable = false;
  let at = 0;
  for (const line of text.split('\n')) {
    const start = at;
    at += line.length + 1;
    const body = line.endsWith('\r') ? line.slice(0, -1) : line;
    const end = start + body.length;
    const pipes = markdown && /^\s*\|.*\|\s*$/.test(body);
    const cells = pipes ? '|' : body.includes('\t') ? '\t' : '';
    if (!cells) {
      inTable = false;
      spans.push({ start, end });
      continue;
    }
    if (pipes && /^\s*\|[\s:|-]+\|\s*$/.test(body)) continue; // | --- | --- |
    if (!inTable) {
      table++;
      row = 0;
      inTable = true;
    } else row++;
    let col = 0;
    let s = start;
    const parts = body.split(cells);
    parts.forEach((part, k) => {
      if (pipes && (k === 0 || k === parts.length - 1)) {
        s += part.length + 1;
        return;
      }
      spans.push({ start: s, end: s + part.length, cell: { table: `t${table}`, row, col: col++ } });
      s += part.length + 1;
    });
  }
  return spans;
}

export function openText(bytes: Uint8Array, name: string): OpenedDocument {
  const decoded = decodeFile(bytes);
  const text = decoded.text;
  const ext = name.toLowerCase().split('.').pop() ?? '';
  let spans: Span[];
  if (ext === 'csv' || ext === 'tsv') spans = csvSpans(text, ext === 'tsv' ? '\t' : detectSeparator(text.split(/\r?\n/, 1)[0] ?? ''));
  else spans = lineSpans(text, ext === 'md' || ext === 'markdown');
  const units: TextUnit[] = spans.map((s) => ({ text: text.slice(s.start, s.end), where: name, role: 'body', ...(s.cell ? { cell: s.cell } : {}) }));
  return {
    units,
    toCheck: [],
    removed: [],
    outputExtension: name.includes('.') ? `.${name.split('.').pop()}` : '',
    async write(edits: readonly UnitEdit[]) {
      const global = edits
        .map((e) => ({ start: spans[e.unit]!.start + e.start, end: spans[e.unit]!.start + e.end, replacement: e.replacement }))
        .sort((a, b) => a.start - b.start);
      let out = '';
      let at = 0;
      for (const e of global) {
        if (e.start < at) continue;
        out += text.slice(at, e.start) + e.replacement;
        at = e.end;
      }
      return encodeFile(out + text.slice(at), decoded);
    },
  };
}
