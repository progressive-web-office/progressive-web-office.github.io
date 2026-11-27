/**
 * PSEUDO-026: the output check. The output is read again from its bytes, and
 * searched with a matcher that shares nothing with the engine but the lists:
 * whole words compared one by one (its own folding), every entry name, XML
 * text and attribute, text file, and the readable strings of binary parts.
 * It over-reports on purpose: a name of the exclusion or common-word lists,
 * a short name or a first name alone is a "mention"; anything else is a
 * "residue". The status is never a bare OK.
 */
import { COMMON_WORDS_FR, EXCLUSIONS } from './data/lists';
import type { Person } from './engine';
import { isZip, readPackage } from './package/zip';

export interface Finding {
  person: string;
  /** Part, entry name, "file name". */
  where: string;
  excerpt: string;
  kind: 'residue' | 'mention';
}

export type OutputStatus = 'residues' | 'check' | 'clean';

/** Folding of its own (not the engine's): NFKD, no marks, lower case, letters and digits only. */
const fold2 = (s: string): string => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

interface Word {
  w: string;
  raw: string;
  at: number;
}

function words(text: string): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) out.push({ w: fold2(m[0]), raw: m[0], at: m.index });
  return out;
}

const tokensOf = (name: string): string[] => words(name).map((x) => x.w);

interface Needle {
  person: string;
  tokens: string[];
  /** Found alone, it is only a mention. */
  weak: boolean;
  /** Must start with a capital to be a residue (last names that are common words). */
  capital: boolean;
}

export interface ResidualChecker {
  check(output: Uint8Array, outputName: string, isText: boolean): Finding[];
}

export function createResidualChecker(people: readonly Person[], extra: { exclusions?: readonly string[]; commonWords?: readonly string[] } = {}): ResidualChecker {
  const excluded = new Set([...EXCLUSIONS, ...(extra.exclusions ?? [])].map((n) => tokensOf(n).join(' ')));
  const common = new Set([...COMMON_WORDS_FR, ...(extra.commonWords ?? [])].map((n) => tokensOf(n).join(' ')));
  const needles: Needle[] = [];
  for (const p of people) {
    const last = tokensOf(p.lastName);
    const first = tokensOf(p.firstName);
    const lastKey = last.join(' ');
    if (last.length) needles.push({ person: p.key, tokens: last, weak: excluded.has(lastKey) || last.join('').length < 3, capital: common.has(lastKey) });
    if (first.length) needles.push({ person: p.key, tokens: first, weak: true, capital: false });
    // A particle may be glued: "Dalembert", "LeGall".
    if (last.length > 1) needles.push({ person: p.key, tokens: [last.join('')], weak: excluded.has(lastKey), capital: common.has(lastKey) });
  }
  const strings = people.flatMap((p) => [p.email, p.number].filter((x): x is string => !!x?.trim()).map((s) => ({ person: p.key, s: s.trim().toLowerCase() })));

  const scan = (text: string, where: string, out: Finding[]): void => {
    if (!text) return;
    const ws = words(text);
    for (const n of needles) {
      for (let i = 0; i + n.tokens.length <= ws.length; i++) {
        if (!n.tokens.every((t, k) => ws[i + k]!.w === t)) continue;
        const first = ws[i]!;
        const lastWord = ws[i + n.tokens.length - 1]!;
        const raw = first.raw[0] ?? '';
        const capitalised = raw !== raw.toLowerCase();
        const kind: Finding['kind'] = n.weak || (n.capital && !capitalised) ? 'mention' : 'residue';
        const excerpt = text.slice(Math.max(0, first.at - 20), Math.min(text.length, lastWord.at + lastWord.raw.length + 20)).replace(/\s+/g, ' ');
        out.push({ person: n.person, where, excerpt, kind });
      }
    }
    const lower = text.toLowerCase();
    for (const s of strings) {
      for (let at = lower.indexOf(s.s); at >= 0; at = lower.indexOf(s.s, at + 1)) {
        const before = lower[at - 1];
        const after = lower[at + s.s.length];
        if ((before && /[\p{L}\p{N}]/u.test(before)) || (after && /[\p{L}\p{N}]/u.test(after))) continue;
        out.push({ person: s.person, where, excerpt: text.slice(Math.max(0, at - 20), at + s.s.length + 20), kind: 'residue' });
      }
    }
  };

  const decodeEntities = (s: string): string =>
    s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
      const l = e.toLowerCase();
      if (l === 'amp') return '&';
      if (l === 'lt') return '<';
      if (l === 'gt') return '>';
      if (l === 'quot') return '"';
      if (l === 'apos') return "'";
      return String.fromCodePoint(l.startsWith('#x') ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10));
    });

  /** Readable runs of a binary part: UTF-8 and UTF-16LE strings of at least 3 letters. */
  const binaryStrings = (data: Uint8Array): string => {
    const runs: string[] = [];
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(data);
    for (const m of utf8.matchAll(/[\p{L}\p{N} .,'@_-]{3,}/gu)) runs.push(m[0]);
    let cur = '';
    for (let i = 0; i + 1 < data.length; i += 2) {
      const c = data[i]! | (data[i + 1]! << 8);
      const ch = String.fromCharCode(c);
      if (/[\p{L}\p{N} .,'@_-]/u.test(ch)) cur += ch;
      else {
        if (cur.length >= 3) runs.push(cur);
        cur = '';
      }
    }
    if (cur.length >= 3) runs.push(cur);
    return runs.join('\n');
  };

  const scanPackage = (bytes: Uint8Array, prefix: string, out: Finding[], depth: number): void => {
    for (const e of readPackage(bytes)) {
      const where = prefix + e.name;
      scan(e.name, `${where} (name)`, out);
      if (isZip(e.data) && depth < 3) {
        scanPackage(e.data, `${where}!`, out, depth + 1);
        continue;
      }
      const head = new TextDecoder('utf-8', { fatal: false }).decode(e.data.subarray(0, 64)).trimStart();
      if (head.startsWith('<') || /\.(xml|rels|vml|svg)$/i.test(e.name)) {
        const xml = new TextDecoder().decode(e.data);
        // Texts between tags, and attribute values, decoded — no XML parser shared with the rewriting.
        const texts = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, ' $1 ').replace(/<[^>]*>/g, '\n');
        const attrs = [...xml.matchAll(/=\s*"([^"]*)"|=\s*'([^']*)'/g)].map((m) => m[1] ?? m[2] ?? '').join('\n');
        scan(decodeEntities(texts), where, out);
        scan(decodeEntities(attrs), `${where} (attributes)`, out);
      } else if (/\.(md|markdown|txt|csv|tsv|tex|bib|json|ya?ml|html?)$/i.test(e.name) || e.name === 'mimetype') {
        scan(new TextDecoder().decode(e.data), where, out);
      } else scan(binaryStrings(e.data), `${where} (binary)`, out);
    }
  };

  return {
    check(output, outputName, isText) {
      const out: Finding[] = [];
      scan(outputName.replace(/\.[^.]+$/, ''), 'file name', out);
      if (!isText && isZip(output)) scanPackage(output, '', out, 0);
      else scan(new TextDecoder().decode(output), outputName, out);
      return out;
    },
  };
}

export function statusOf(findings: readonly Finding[], toCheck: number, otherChecks: number): OutputStatus {
  if (findings.some((f) => f.kind === 'residue')) return 'residues';
  return toCheck + otherChecks > 0 ? 'check' : 'clean';
}
