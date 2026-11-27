/**
 * PSEUDO-004, PSEUDO-005: the list of people (CSV): separator and encoding
 * found, columns recognised by their usual French and English names, text
 * normalised to NFC.
 */
import { LIMITS } from './limits';
import { foldText, nameTokens } from './normalize';

export interface ListedPerson {
  lastName: string;
  firstName: string;
  email?: string;
  number?: string;
}

export interface Roster {
  people: ListedPerson[];
  separator: ';' | ',' | '\t';
  encoding: 'utf-8' | 'utf-8-bom' | 'windows-1252';
  /** Columns found, by role. */
  columns: { lastName: string; firstName: string; email?: string; number?: string };
  /** Lines left out, numbered from 1 (the header). */
  rejected: { line: number; reason: 'fields' | 'empty-name' }[];
}

export type RosterProblem = 'too-large' | 'no-last-name' | 'no-first-name' | 'empty' | 'duplicate';

export class RosterError extends Error {
  constructor(
    readonly problem: RosterProblem,
    readonly detail = '',
  ) {
    super(detail ? `${problem}: ${detail}` : problem);
    this.name = 'RosterError';
  }
}

const ALIASES: Record<'lastName' | 'firstName' | 'email' | 'number', readonly string[]> = {
  lastName: ['nom', 'nom de famille', 'nom famille', 'name', 'last name', 'lastname', 'surname', 'family name', 'familyname'],
  firstName: ['prenom', 'prenoms', 'first name', 'firstname', 'given name', 'givenname', 'forename'],
  email: ['email', 'e mail', 'mail', 'courriel', 'adresse mail', 'adresse electronique', 'e mail address', 'email address'],
  number: ['numero', 'numero etudiant', 'n etudiant', 'no etudiant', 'n', 'no', 'num', 'number', 'student id', 'studentid', 'id', 'ine', 'matricule', 'identifiant'],
};

const header = (h: string): string => foldText(h.normalize('NFC')).replace(/[°º]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function decodeList(bytes: Uint8Array): { text: string; encoding: Roster['encoding'] } {
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bom ? bytes.subarray(3) : bytes);
    return { text, encoding: bom ? 'utf-8-bom' : 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}

/** CSV fields of a text, quotes handled ("a;b" stays one field, "" is a quote). */
export function csvRows(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function detectSeparator(firstLine: string): Roster['separator'] {
  const count = (c: string): number => firstLine.split(c).length - 1;
  const counts: [Roster['separator'], number][] = [[';', count(';')], ['\t', count('\t')], [',', count(',')]];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ';';
}

export function readRoster(bytes: Uint8Array): Roster {
  if (bytes.length > LIMITS.listBytes) throw new RosterError('too-large');
  const { text: raw, encoding } = decodeList(bytes);
  const text = raw.normalize('NFC');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const separator = detectSeparator(firstLine);
  const rows = csvRows(text, separator).slice(0, LIMITS.listLines + 1);
  const head = rows[0] ?? [];
  const col: Partial<Record<keyof typeof ALIASES, number>> = {};
  head.forEach((h, i) => {
    const name = header(h);
    for (const role of Object.keys(ALIASES) as (keyof typeof ALIASES)[]) {
      if (col[role] === undefined && ALIASES[role].includes(name)) col[role] = i;
    }
  });
  if (col.lastName === undefined) throw new RosterError('no-last-name', head.join(separator));
  if (col.firstName === undefined) throw new RosterError('no-first-name', head.join(separator));
  const people: ListedPerson[] = [];
  const rejected: Roster['rejected'] = [];
  const seen = new Map<string, number>();
  rows.slice(1).forEach((r, k) => {
    const line = k + 2;
    if (r.every((f) => !f.trim())) return;
    if (r.length > head.length) return void rejected.push({ line, reason: 'fields' });
    const lastName = (r[col.lastName!] ?? '').trim();
    const firstName = (r[col.firstName!] ?? '').trim();
    if (!lastName || !firstName) return void rejected.push({ line, reason: 'empty-name' });
    const id = `${nameTokens(lastName).join(' ')}|${nameTokens(firstName).join(' ')}`;
    if (seen.has(id)) throw new RosterError('duplicate', `${firstName} ${lastName} (${seen.get(id)}, ${line})`);
    seen.set(id, line);
    const email = col.email !== undefined ? r[col.email]?.trim() : undefined;
    const number = col.number !== undefined ? r[col.number]?.trim() : undefined;
    people.push({ lastName, firstName, ...(email ? { email } : {}), ...(number ? { number } : {}) });
  });
  if (!people.length) throw new RosterError('empty');
  return {
    people,
    separator,
    encoding,
    columns: {
      lastName: head[col.lastName]!,
      firstName: head[col.firstName]!,
      ...(col.email !== undefined ? { email: head[col.email]! } : {}),
      ...(col.number !== undefined ? { number: head[col.number]! } : {}),
    },
    rejected,
  };
}

/** The stable key of a person of a list. */
export const personKey = (p: ListedPerson): string => `${nameTokens(p.lastName).join(' ')}|${nameTokens(p.firstName).join(' ')}|${foldText(p.number ?? '')}`;
