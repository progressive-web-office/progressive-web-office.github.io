/**
 * PSEUDO-030: pseudonyms back to names, in what comes back from whoever
 * received the pseudonymised documents, whatever the case, separator or
 * emphasis the pseudonym was given (`ETU-012`, `ETU 012`, `etu-012`,
 * `**ETU-012**`, non-breaking hyphen).
 */
import { escapeRegExp } from './normalize';
import type { Person } from './engine';

export interface Reidentified {
  text: string;
  /** Replacements made, by pseudonym. */
  replaced: Map<string, number>;
  /** Pseudonym-like texts that are not in the table. */
  unknown: string[];
}

export interface Reidentifier {
  /** Matches of one text: [start, end, name]. */
  find(text: string): { start: number; end: number; replacement: string; pseudonym?: string }[];
  text(text: string): Reidentified;
}

export function displayName(p: Pick<Person, 'firstName' | 'lastName'>): string {
  return `${p.firstName} ${p.lastName}`;
}

export function createReidentifier(people: readonly Person[], prefix: string): Reidentifier {
  const byNumber = new Map<number, Person>();
  for (const p of people) {
    const n = Number(p.pseudonym.slice(prefix.length));
    if (Number.isInteger(n)) byNumber.set(n, p);
  }
  const letters = escapeRegExp(prefix.replace(/[-_\s.]+$/, ''));
  // The separator the prefix ended with, or any other, or none.
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${letters}[\\s\\-\\u2010-\\u2015\\u2212_.\\u00a0]?0*(\\d{1,5})(?![\\p{L}\\p{N}])`, 'giu');
  const find: Reidentifier['find'] = (text) => {
    const out: ReturnType<Reidentifier['find']> = [];
    for (const m of text.matchAll(re)) {
      const p = byNumber.get(Number(m[1]));
      out.push({ start: m.index, end: m.index + m[0].length, replacement: p ? displayName(p) : m[0], ...(p ? { pseudonym: p.pseudonym } : {}) });
    }
    return out;
  };
  return {
    find,
    text(text) {
      const replaced = new Map<string, number>();
      const unknown: string[] = [];
      let out = '';
      let at = 0;
      for (const m of find(text)) {
        out += text.slice(at, m.start) + m.replacement;
        at = m.end;
        if (m.pseudonym) replaced.set(m.pseudonym, (replaced.get(m.pseudonym) ?? 0) + 1);
        else unknown.push(m.replacement);
      }
      return { text: out + text.slice(at), replaced, unknown };
    },
  };
}
