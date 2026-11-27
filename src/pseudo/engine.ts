/**
 * Detection engine of the pseudonymisation (PSEUDO-006..PSEUDO-014): pure,
 * synchronous, no DOM, no network. Format adapters hand it the texts of a
 * document as units; it returns the replacements and the attribution of the
 * whole document (docs/design/pseudonymisation.md §5).
 */
import { escapeRegExp, fold, letterCount, nameTokens, type Folded } from './normalize';
import { BY_LABELS, COMMON_WORDS_FR, EXCLUSIONS, LABELS } from './data/lists';

export interface Person {
  /** Stable key: folded "last|first|number". */
  key: string;
  lastName: string;
  firstName: string;
  email?: string;
  number?: string;
  /** "ETU-012". */
  pseudonym: string;
}

export type UnitRole =
  | 'body' | 'header' | 'footer' | 'note' | 'comment' | 'author' | 'meta' | 'alt' | 'field' | 'link' | 'name' | 'file-name' | 'other';

export interface TextUnit {
  /** Text as written; `\t` and `\n` are hard breaks. */
  text: string;
  /** Where it is, for the report ("word/footer2.xml"). */
  where: string;
  role: UnitRole;
  /** Position in a table: a label takes the cell to its right or below. */
  cell?: { table: string; row: number; col: number };
}

/** Texts written in place of what cannot be given a pseudonym. */
export interface Markers {
  name: string;
  person: string;
  email: string;
  phone: string;
  ine: string;
  number: string;
  user: string;
}

export const FRENCH_MARKERS: Markers = {
  name: '[NOM]', person: '[PERSONNE]', email: '[COURRIEL]', phone: '[TÉLÉPHONE]', ine: '[INE]', number: '[NUMÉRO]', user: '[UTILISATEUR]',
};

export interface DetectorConfig {
  people: readonly Person[];
  /** Replace last names written alone (default true). */
  lastNameAlone?: boolean;
  /** PSEUDO-009: replace first names written alone (default false). */
  firstNameAlone?: boolean;
  /** Added to the built-in exclusion list. */
  exclusions?: readonly string[];
  /** Added to the built-in common words. */
  commonWords?: readonly string[];
  /** Added to the built-in labels. */
  labels?: readonly string[];
  markers?: Markers;
}

export type MatchKind =
  | 'full-name' | 'initial' | 'last-name' | 'first-name' | 'email' | 'phone' | 'ine' | 'number' | 'login' | 'labelled' | 'author';

export interface Match {
  unit: number;
  /** Range in the original text of the unit. */
  start: number;
  end: number;
  kind: MatchKind;
  person?: string;
  replacement: string;
}

export interface Evidence {
  kind: MatchKind | 'file-name';
  unit: number;
  weight: number;
}

export interface Attribution {
  status: 'single' | 'group' | 'none' | 'ambiguous';
  people: { key: string; score: number; evidence: Evidence[] }[];
}

export interface RosterNote {
  kind: 'excluded' | 'common-word' | 'short' | 'shared-last' | 'shared-first';
  people: string[];
}

/** A labelled value that does not look like names: listed, not replaced. */
export interface Check {
  unit: number;
  start: number;
  end: number;
  reason: 'labelled-not-names';
}

export interface Detection {
  matches: Match[];
  attribution: Attribution;
  checks: Check[];
  /** Texts shaped like a pseudonym that were already there. */
  pseudonymLike: number;
}

export interface CorpusStats {
  /** Person key → uses of their last name in lower case. */
  lowerCaseUses: ReadonlyMap<string, number>;
}

export interface Detector {
  readonly notes: readonly RosterNote[];
  readonly markers: Markers;
  scan(units: readonly TextUnit[], context?: { fileName?: string }): Detection;
}

const B_L = '(?<![\\p{L}\\p{N}])';
const B_R = '(?![\\p{L}\\p{N}])';
const IN_NAME = "[\\s\\-'_.]*";
const BETWEEN = '[\\s_.,;\\-]+';

const WEIGHTS: Record<MatchKind | 'file-name', number> = {
  labelled: 5, email: 5, number: 5, 'file-name': 4, author: 2, 'full-name': 2, initial: 1, 'last-name': 1,
  'first-name': 0, phone: 0, ine: 0, login: 0,
};
const PRIORITY: Record<MatchKind, number> = {
  author: 9, labelled: 8, email: 7, number: 7, ine: 6, phone: 6, login: 6, 'full-name': 5, initial: 4, 'last-name': 3, 'first-name': 2,
};

interface Info {
  p: Person;
  lastKey: string;
  firstKey: string;
  /** Normal context: forms allowed by the flags. */
  strict: RegExp;
  /** After a label or in an author field: every form. */
  lenient: RegExp;
  lastAlone: boolean;
  firstAlone: boolean;
  sharedLast: boolean;
  sharedFirst: boolean;
  common: boolean;
}

const tokPat = (tokens: string[]): string => tokens.map(escapeRegExp).join(IN_NAME);

function initialPattern(first: string[]): string {
  const letters = first.map((t) => escapeRegExp(t[0] ?? ''));
  if (letters.length === 1) return `${letters[0]}\\.`;
  const joined = letters.join('\\.?\\s*-?\\s*');
  return `(?:${joined}\\.?|${letters[0]}\\.)`;
}

function personRegex(first: string[], last: string[], lastAlone: boolean, firstAlone: boolean): RegExp {
  const F = tokPat(first);
  const L = tokPat(last);
  const I = initialPattern(first);
  const forms = [
    `(?<full>${F}${BETWEEN}${L}|${L}${BETWEEN}${F})`,
    `(?<init>${I}\\s*${L}|${L}[\\s,]+${I})`,
  ];
  if (lastAlone) forms.push(`(?<last>${L})`);
  if (firstAlone) forms.push(`(?<first>${F})`);
  return new RegExp(`${B_L}(?:${forms.join('|')})${B_R}`, 'gu');
}

const foldedSet = (names: readonly string[]): Set<string> => new Set(names.map((n) => nameTokens(n).join(' ')));

const isUpper = (ch: string | undefined): boolean => !!ch && ch !== ch.toLowerCase() && ch === ch.toUpperCase();

const PARTICLES = new Set(['de', 'du', 'des', "d'", 'd’', 'le', 'la', 'van', 'von', 'der', 'den', 'di', 'da', 'del', 'dos', 'ben', 'bin', 'el', 'al', 'ter', 'ten']);
const CONNECTORS = new Set([',', '/', '&', 'et', 'and', '+']);

/** A word of a labelled value that can belong to a name. */
function nameWord(word: string): boolean {
  const w = word.replace(/[,;:]+$/, '');
  if (!w) return false;
  if (/^\p{Lu}\.(?:-?\p{Lu}\.)*$/u.test(w)) return true; // initials: J., J.-P.
  if (PARTICLES.has(w.toLowerCase()) || /^d['’]\p{Lu}/u.test(w)) return true;
  return /^\p{Lu}[\p{L}\p{M}'’\-]*\.?$/u.test(w);
}

/** A name word that is not a particle: a value needs one to look like names. */
const capitalWord = (word: string): boolean => nameWord(word) && !PARTICLES.has(word.replace(/[,;:.]+$/, '').toLowerCase());

export function createDetector(config: DetectorConfig): Detector {
  const markers = config.markers ?? FRENCH_MARKERS;
  const lastNameAlone = config.lastNameAlone ?? true;
  const firstNameAlone = config.firstNameAlone ?? false;
  const exclusions = foldedSet([...EXCLUSIONS, ...(config.exclusions ?? [])]);
  const common = foldedSet([...COMMON_WORDS_FR, ...(config.commonWords ?? [])]);
  const labels = [...new Set([...LABELS, ...(config.labels ?? [])].map((l) => fold(l).text.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const byLabels = BY_LABELS.map((l) => fold(l).text);

  const lastCount = new Map<string, number>();
  const firstCount = new Map<string, number>();
  for (const p of config.people) {
    const l = nameTokens(p.lastName).join(' ');
    const f = nameTokens(p.firstName).join(' ');
    lastCount.set(l, (lastCount.get(l) ?? 0) + 1);
    firstCount.set(f, (firstCount.get(f) ?? 0) + 1);
  }

  const notes = new Map<RosterNote['kind'], string[]>();
  const note = (kind: RosterNote['kind'], key: string): void => void notes.set(kind, [...(notes.get(kind) ?? []), key]);

  const infos: Info[] = config.people.map((p) => {
    const last = nameTokens(p.lastName);
    const first = nameTokens(p.firstName);
    const lastKey = last.join(' ');
    const firstKey = first.join(' ');
    const excluded = exclusions.has(lastKey);
    const isCommon = common.has(lastKey);
    const short = letterCount(p.lastName) < 3;
    const sharedLast = (lastCount.get(lastKey) ?? 0) > 1;
    const sharedFirst = (firstCount.get(firstKey) ?? 0) > 1;
    if (excluded) note('excluded', p.key);
    if (isCommon) note('common-word', p.key);
    if (short) note('short', p.key);
    if (sharedLast) note('shared-last', p.key);
    if (sharedFirst && firstNameAlone) note('shared-first', p.key);
    const lastAlone = lastNameAlone && !excluded && !short && !sharedLast && !isCommon && last.length > 0;
    const firstAlone = firstNameAlone && !sharedFirst && !exclusions.has(firstKey) && letterCount(p.firstName) >= 3 && first.length > 0;
    return {
      p,
      lastKey,
      firstKey,
      strict: personRegex(first, last, lastAlone, firstAlone),
      lenient: personRegex(first, last, last.length > 0, first.length > 0),
      lastAlone,
      firstAlone,
      sharedLast,
      sharedFirst,
      common: isCommon,
    };
  });

  /** Shared last names written alone: one marker, never a pseudonym. */
  const sharedLastNames = [...new Set(infos.filter((i) => i.sharedLast && lastNameAlone && !exclusions.has(i.lastKey) && !common.has(i.lastKey) && letterCount(i.p.lastName) >= 3).map((i) => i.lastKey))];
  const sharedRegex = sharedLastNames.length
    ? new RegExp(`${B_L}(?:${sharedLastNames.map((k) => tokPat(k.split(' '))).sort((a, b) => b.length - a.length).join('|')})${B_R}`, 'gu')
    : null;
  const emails = new Map(config.people.filter((p) => p.email).map((p) => [fold(p.email!.trim()).text, p.key]));
  const numbers = config.people.filter((p) => p.number?.trim()).map((p) => ({ re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(fold(p.number!.trim()).text)}(?![\\p{L}\\p{N}])`, 'gu'), key: p.key }));
  const byKey = new Map(config.people.map((p) => [p.key, p]));
  const prefix = config.people[0]?.pseudonym.replace(/\d+$/, '') ?? 'ETU-';
  const pseudonymLikeRe = new RegExp(`${B_L}${escapeRegExp(fold(prefix).text).replace(/-$/, '')}[\\s\\-_]?\\d{1,4}${B_R}`, 'gu');

  const labelAlternation = labels.map((l) => l.split(/\s+/).map(escapeRegExp).join('\\s+')).join('|');
  const labelRe = new RegExp(`(?<![\\p{L}])(?<label>${labelAlternation})(?:\\s*\\((?:s|e|es|x)\\))*\\s*(?:(?<colon>:)|(?<tab>\\t))`, 'gu');
  const byRe = new RegExp(`(?<![\\p{L}])(?<label>${byLabels.map(escapeRegExp).join('|')})\\s*:?[ \\u00a0]+(?=\\p{L})`, 'gu');
  const labelOnlyRe = new RegExp(`^\\s*(?:${labelAlternation})(?:\\s*\\((?:s|e|es|x)\\))*\\s*:?\\s*$`, 'u');

  const EMAIL = /(?<![\p{L}\p{N}._%+-])[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}(?![\p{L}\p{N}])/gu;
  const PHONE = /(?<![\d+])(?:\+33[\s.-]?|0033[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/g;
  const INE = /(?<![\p{L}\p{N}])(?:\d{10}[a-z]|\d{9}[a-z]{2})(?![\p{L}\p{N}])/gu;
  const LOGIN = /(?:[a-z]:[\\/]+users|\/home|\/users)[\\/]+([^\\/\s"'<>:;|*?]+)/dg;

  interface Candidate extends Match {
    priority: number;
  }

  /** People named in a short text (a labelled value, an author field), every form allowed. */
  function peopleIn(text: string): { key: string; start: number; end: number }[] {
    const f = fold(text);
    const found: { key: string; start: number; end: number }[] = [];
    for (const info of infos) {
      info.lenient.lastIndex = 0;
      for (const m of f.text.matchAll(info.lenient)) {
        const g = m.groups ?? {};
        // A shared last or first name alone does not tell who it is.
        if (g.last !== undefined && info.sharedLast) continue;
        if (g.first !== undefined && info.sharedFirst) continue;
        found.push({ key: info.p.key, start: m.index, end: m.index + m[0].length });
      }
    }
    // Longest first: "Léa Martin" beats "Martin".
    found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const out: typeof found = [];
    let last = -1;
    for (const x of found) {
      if (x.start >= last) {
        out.push(x);
        last = x.end;
      }
    }
    return out.map((x) => {
      const [s, e] = [f.map[x.start] ?? 0, f.map[x.end] ?? text.length];
      return { key: x.key, start: s, end: e };
    });
  }

  /** The labelled value starting at `from` (original index) in `text`: its name-like words, split into people. */
  function labelledValue(unit: number, text: string, from: number, out: Candidate[], checks: Check[]): void {
    let end = text.length;
    const stop = /[\t\n\r;|]/.exec(text.slice(from));
    if (stop) end = from + stop.index;
    const region = text.slice(from, end);
    // Words with their positions.
    const words: { w: string; s: number; e: number }[] = [];
    for (const m of region.matchAll(/\S+/g)) words.push({ w: m[0], s: from + m.index, e: from + m.index + m[0].length });
    let taken = 0;
    let nameWords = 0;
    for (let i = 0; i < words.length && nameWords < 6; i++) {
      const w = words[i]!.w;
      const bare = w.replace(/[,;:]+$/, '');
      if (CONNECTORS.has(bare.toLowerCase()) || w === ',') {
        if (taken === 0) break;
        continue;
      }
      if (!nameWord(w)) break;
      taken = i + 1;
      nameWords++;
      // A full stop ends the value, except after an initial.
      if (/\.$/.test(bare) && !/^\p{Lu}\.(?:-?\p{Lu}\.)*$/u.test(bare)) break;
    }
    // A particle does not end a name ("fait par la machine").
    while (taken > 0 && !capitalWord(words[taken - 1]!.w)) taken--;
    if (taken === 0 || !words.slice(0, taken).some((w) => capitalWord(w.w))) {
      const first = words[0];
      if (first) checks.push({ unit, start: first.s, end: words[Math.min(words.length, 6) - 1]!.e, reason: 'labelled-not-names' });
      return;
    }
    const valueStart = words[0]!.s;
    let valueEnd = words[taken - 1]!.e;
    // Trailing punctuation is not part of the name.
    while (valueEnd > valueStart && /[.,;:]/.test(text[valueEnd - 1]!) && !/\b\p{Lu}\.$/u.test(text.slice(valueStart, valueEnd))) valueEnd--;
    // People of the list first (a full name may hold a comma: "MARTIN, Léa"), then the rest by groups.
    const value = text.slice(valueStart, valueEnd);
    const found = peopleIn(value);
    let at = 0;
    const gaps: { s: number; e: number }[] = [];
    for (const f of found) {
      if (f.start > at) gaps.push({ s: at, e: f.start });
      const p = byKey.get(f.key)!;
      out.push({ unit, start: valueStart + f.start, end: valueStart + f.end, kind: 'labelled', person: p.key, replacement: p.pseudonym, priority: PRIORITY.labelled });
      at = f.end;
    }
    if (at < value.length) gaps.push({ s: at, e: value.length });
    for (const gap of gaps) {
      const part = value.slice(gap.s, gap.e);
      for (const m of part.matchAll(/[^,/&+]+/gu)) {
        // Connector words and spaces around a group are kept.
        const raw = m[0];
        const inner = raw.replace(/^(?:\s|\bet\b|\band\b)+|(?:\s|\bet\b|\band\b)+$/gu, '');
        if (!inner || !inner.split(/\s+/).some(capitalWord)) continue;
        const s = valueStart + gap.s + m.index + raw.indexOf(inner);
        const e = s + inner.length;
        const shared = infos.some((i) => i.sharedLast && fold(inner).text.trim() === i.lastKey);
        out.push({ unit, start: s, end: e, kind: 'labelled', replacement: shared ? markers.person : markers.name, priority: PRIORITY.labelled });
      }
    }
  }

  function scanUnit(i: number, unit: TextUnit, out: Candidate[], checks: Check[]): void {
    const text = unit.text;
    if (!text.trim()) return;
    if (unit.role === 'author') {
      const keys = [...new Set(peopleIn(text).map((f) => f.key))];
      const replacement = keys.map((k) => byKey.get(k)!.pseudonym).join(', ');
      out.push({ unit: i, start: 0, end: text.length, kind: 'author', person: keys.length === 1 ? keys[0] : undefined, replacement, priority: PRIORITY.author });
      if (keys.length > 1) for (const k of keys) out.push({ unit: i, start: 0, end: text.length, kind: 'author', person: k, replacement, priority: -1 });
      return;
    }
    const f: Folded = fold(text);
    const add = (s: number, e: number, kind: MatchKind, replacement: string, person?: string): void => {
      const [os, oe] = [f.map[s] ?? 0, f.map[e] ?? text.length];
      out.push({ unit: i, start: os, end: oe, kind, person, replacement, priority: PRIORITY[kind] });
    };
    for (const info of infos) {
      for (const m of f.text.matchAll(info.strict)) {
        const g = m.groups ?? {};
        const kind: MatchKind = g.full !== undefined ? 'full-name' : g.init !== undefined ? 'initial' : g.last !== undefined ? 'last-name' : 'first-name';
        // Alone, a name counts only when it is written with a capital.
        if ((kind === 'last-name' || kind === 'first-name') && !isUpper(text[f.map[m.index] ?? 0])) continue;
        add(m.index, m.index + m[0].length, kind, info.p.pseudonym, info.p.key);
      }
    }
    if (sharedRegex) {
      for (const m of f.text.matchAll(sharedRegex)) if (isUpper(text[f.map[m.index] ?? 0])) add(m.index, m.index + m[0].length, 'last-name', markers.person);
    }
    for (const m of f.text.matchAll(EMAIL)) add(m.index, m.index + m[0].length, 'email', markers.email, emails.get(m[0]));
    for (const m of f.text.matchAll(PHONE)) add(m.index, m.index + m[0].length, 'phone', markers.phone);
    for (const m of f.text.matchAll(INE)) add(m.index, m.index + m[0].length, 'ine', markers.ine);
    for (const n of numbers) for (const m of f.text.matchAll(n.re)) add(m.index, m.index + m[0].length, 'number', markers.number, n.key);
    for (const m of f.text.matchAll(LOGIN)) {
      const span = m.indices?.[1];
      if (span) add(span[0], span[1], 'login', markers.user);
    }
    // Labels: the value runs to the end of the line, a tab, a cell or the sixth word.
    for (const re of [labelRe, byRe]) {
      for (const m of f.text.matchAll(re)) {
        if (m.groups?.tab !== undefined) continue; // "Nom<TAB>…": a table row, handled with the cells
        const after = f.map[m.index + m[0].length] ?? text.length;
        let from = after;
        while (from < text.length && (text[from] === ' ' || text[from] === ' ')) from++;
        if (from >= text.length || /[\t\n\r]/.test(text[from]!)) continue;
        labelledValue(i, text, from, out, checks);
      }
    }
  }

  /** PSEUDO-008: a cell holding only a label takes the cell to its right, or the cells below. */
  function scanCells(units: readonly TextUnit[], out: Candidate[], checks: Check[]): void {
    const cells = new Map<string, number[]>();
    const rows = new Map<string, number>();
    for (const [i, u] of units.entries()) {
      if (!u.cell) continue;
      const k = `${u.cell.table}|${u.cell.row}|${u.cell.col}`;
      cells.set(k, [...(cells.get(k) ?? []), i]);
      rows.set(u.cell.table, Math.max(rows.get(u.cell.table) ?? 0, u.cell.row));
    }
    const textOf = (k: string): string => (cells.get(k) ?? []).map((i) => units[i]!.text).join('\n');
    const isLabel = (s: string): boolean => labelOnlyRe.test(fold(s).text);
    const take = (k: string): void => {
      for (const i of cells.get(k) ?? []) {
        const text = units[i]!.text;
        const from = text.search(/\S/);
        if (from >= 0) labelledValue(i, text, from, out, checks);
      }
    };
    for (const [k, idx] of cells) {
      const [table, rowS, colS] = k.split('|');
      const row = Number(rowS);
      const col = Number(colS);
      if (!isLabel(textOf(k)) || !idx.length) continue;
      const right = `${table}|${row}|${col + 1}`;
      const rightText = textOf(right).trim();
      const lastRow = rows.get(table!) ?? 0;
      const rightHasPerson = rightText ? peopleIn(rightText).length > 0 : false;
      if (rightText && !isLabel(rightText) && (rightHasPerson || row > 0 || lastRow === 0)) {
        take(right);
        continue;
      }
      // A header row: the column below holds the values.
      for (let r = row + 1; r <= lastRow; r++) {
        const below = `${table}|${r}|${col}`;
        const belowText = textOf(below);
        if (isLabel(belowText)) break;
        take(below);
      }
    }
  }

  function resolve(cands: Candidate[]): { chosen: Candidate[]; extra: Candidate[] } {
    const main = cands.filter((c) => c.priority >= 0).sort((a, b) => a.unit - b.unit || a.start - b.start || b.end - b.start - (a.end - a.start) || b.priority - a.priority);
    const chosen: Candidate[] = [];
    let unit = -1;
    let last = -1;
    for (const c of main) {
      if (c.unit !== unit) {
        unit = c.unit;
        last = -1;
      }
      if (c.start >= last) {
        chosen.push(c);
        last = c.end;
      } else {
        // Overlap: a labelled or author match wins over a shorter name match it covers.
        const prev = chosen[chosen.length - 1]!;
        if (c.priority > prev.priority && c.start <= prev.start && c.end >= prev.end) {
          chosen[chosen.length - 1] = c;
          last = c.end;
        }
      }
    }
    const extra = cands.filter((c) => c.priority < 0 && chosen.some((x) => x.unit === c.unit && x.start === c.start && x.end === c.end));
    return { chosen, extra };
  }

  function attribute(matches: Candidate[], fileHits: { key: string }[], units: number): Attribution {
    const score = new Map<string, { score: number; evidence: Evidence[] }>();
    const addEvidence = (key: string, kind: Evidence['kind'], unit: number): void => {
      const w = WEIGHTS[kind];
      if (!w) return;
      const s = score.get(key) ?? { score: 0, evidence: [] };
      s.score += w;
      s.evidence.push({ kind, unit, weight: w });
      score.set(key, s);
    };
    for (const m of matches) {
      if (!m.person) continue;
      const info = infos.find((x) => x.p.key === m.person);
      // Common words, shared and short names alone never attribute a document.
      if (m.kind === 'last-name' && (!info || !info.lastAlone)) continue;
      addEvidence(m.person, m.kind, m.unit);
    }
    for (const h of fileHits) addEvidence(h.key, 'file-name', units);
    const ranked = [...score.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.score - a.score);
    const best = ranked[0]?.score ?? 0;
    const people = ranked.filter((r) => r.score >= 4 && r.score * 2 >= best);
    const status: Attribution['status'] = people.length === 0 ? 'none' : people.length === 1 ? 'single' : people.length <= 3 ? 'group' : 'ambiguous';
    return { status, people };
  }

  return {
    notes: [...notes.entries()].map(([kind, people]) => ({ kind, people })),
    markers,
    scan(units, context = {}) {
      const cands: Candidate[] = [];
      const checks: Check[] = [];
      let pseudonymLike = 0;
      for (const [i, u] of units.entries()) {
        scanUnit(i, u, cands, checks);
        pseudonymLike += [...fold(u.text).text.matchAll(pseudonymLikeRe)].length;
      }
      scanCells(units, cands, checks);
      const { chosen, extra } = resolve(cands);
      const fileHits = context.fileName ? peopleIn(context.fileName.replace(/\.[^.]+$/, '')).map((h) => ({ key: h.key })) : [];
      const attribution = attribute([...chosen, ...extra], fileHits, units.length);
      const matches: Match[] = chosen.map(({ priority: _p, ...m }) => m);
      const covered = (c: Check): boolean => chosen.some((m) => m.unit === c.unit && m.start <= c.start && m.end >= c.end);
      return { matches, attribution, checks: checks.filter((c) => !covered(c)), pseudonymLike };
    },
  };
}

/** PSEUDO-011: how often each last name of the list is written in lower case in a set of texts. */
export function corpusStats(texts: Iterable<string>, people: readonly Person[]): CorpusStats {
  const uses = new Map<string, number>();
  const res = people.map((p) => ({ key: p.key, re: new RegExp(`${B_L}${tokPat(nameTokens(p.lastName))}${B_R}`, 'gu') }));
  for (const text of texts) {
    const f = fold(text);
    for (const { key, re } of res) {
      for (const m of f.text.matchAll(re)) {
        const start = f.map[m.index] ?? 0;
        const ch = text[start];
        // Parts of e-mail addresses, logins and paths are not words.
        const before = text[start - 1] ?? '';
        const after = text[f.map[m.index + m[0].length] ?? text.length] ?? '';
        if (/[@._/\\]/.test(before) || /[@._/\\]/.test(after)) continue;
        if (ch && ch === ch.toLowerCase() && ch !== ch.toUpperCase()) uses.set(key, (uses.get(key) ?? 0) + 1);
      }
    }
  }
  return { lowerCaseUses: uses };
}

/** People whose last name is used as a common word in the corpus: their words go to `commonWords`. */
export function commonFromCorpus(stats: CorpusStats, people: readonly Person[]): string[] {
  return people.filter((p) => (stats.lowerCaseUses.get(p.key) ?? 0) > 0).map((p) => p.lastName);
}

/** Apply the matches of one unit to its text. */
export function applyMatches(text: string, matches: readonly Pick<Match, 'start' | 'end' | 'replacement'>[]): string {
  let out = '';
  let at = 0;
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    if (m.start < at) continue;
    out += text.slice(at, m.start) + m.replacement;
    at = m.end;
  }
  return out + text.slice(at);
}
