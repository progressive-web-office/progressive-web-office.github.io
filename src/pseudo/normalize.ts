/**
 * PSEUDO-006: folding for matching, with a map back to the original text, so
 * that a name is found whatever its case, accents (composed or decomposed),
 * apostrophe, hyphen or space, and is replaced where it is written without
 * changing the normalisation of the rest of the document.
 */

export interface Folded {
  /** Lower case, without accents; apostrophes, hyphens and spaces unified. */
  text: string;
  /** `map[i]`: index in the original of folded character `i`; `map[text.length]` is the original length. */
  map: Uint32Array;
}

const APOSTROPHES = /['’ʼ‘´`＇]/u;
const HYPHENS = /[-‐‑‒–—―−]/u;
const SPACES = /[\s     　]/u;
const LIGATURES: Record<string, string> = { œ: 'oe', æ: 'ae', ß: 'ss', ĳ: 'ij', ﬁ: 'fi', ﬂ: 'fl' };
const MARK = /\p{M}/u;

/** Fold one code point (it may give 0, 1 or 2 characters). */
function foldPoint(ch: string): string {
  if (APOSTROPHES.test(ch)) return "'";
  if (HYPHENS.test(ch)) return '-';
  if (ch === '\t' || ch === '\n' || ch === '\r') return ch;
  if (SPACES.test(ch)) return ' ';
  const lower = ch.toLowerCase();
  const lig = LIGATURES[lower];
  if (lig) return lig;
  let out = '';
  for (const c of lower.normalize('NFD')) if (!MARK.test(c)) out += c;
  return out;
}

export function fold(text: string): Folded {
  let out = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = foldPoint(ch);
    for (let k = 0; k < f.length; k++) map.push(i);
    out += f;
    i += ch.length;
  }
  map.push(text.length);
  return { text: out, map: Uint32Array.from(map) };
}

/** Folded text only. */
export const foldText = (text: string): string => fold(text).text;

/** A range of the folded text, as a range of the original. */
export function toOriginal(f: Folded, start: number, end: number): [number, number] {
  return [f.map[start] ?? 0, f.map[end] ?? f.map[f.map.length - 1] ?? 0];
}

/** The tokens of a name: "Jean-Pierre" → ["jean", "pierre"], "D'Alembert" → ["d", "alembert"]. */
export function nameTokens(name: string): string[] {
  return foldText(name.normalize('NFC'))
    .split(/[\s\-'_.]+/)
    .filter(Boolean);
}

/** Letters only (for length checks): "D'Alembert" → 9. */
export const letterCount = (name: string): number => nameTokens(name).join('').length;

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
