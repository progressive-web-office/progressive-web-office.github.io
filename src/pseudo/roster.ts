/**
 * The list of people (PSEUDO-004, PSEUDO-005, PSEUDO-036, PSEUDO-037): a CSV
 * or TSV file, an Excel workbook or an OpenDocument spreadsheet, read on the
 * device into sheets of text cells; the header row and the columns proposed
 * from their usual French and English names, changed by the user; the names
 * in two columns or in one (full name), split as the user says.
 */
import { LIMITS } from './limits';
import { foldText, nameTokens } from './normalize';
import { isZip, readPackage } from './package/zip';

export interface ListedPerson {
  lastName: string;
  firstName: string;
  email?: string;
  number?: string;
}

export interface ListSheet {
  name: string;
  /** Text of the cells, rows of equal length. */
  rows: string[][];
  /** The cells that held numbers (for the warning about leading zeros). */
  numeric: boolean[][];
}

export interface ListSource {
  format: 'csv' | 'xlsx' | 'ods';
  sheets: ListSheet[];
  /** CSV only. */
  separator?: ';' | ',' | '\t';
  encoding?: 'utf-8' | 'utf-8-bom' | 'windows-1252';
}

export type NameOrder = 'auto' | 'last-first' | 'first-last';

/** Columns by index; `header` is the index of the header row, -1 for none. */
export interface ColumnMapping {
  header: number;
  lastName?: number;
  firstName?: number;
  /** PSEUDO-037: the names in one column. */
  fullName?: number;
  order: NameOrder;
  email?: number;
  number?: number;
}

export interface Roster {
  people: ListedPerson[];
  /** Rows left out, numbered from 1 as in the sheet. */
  rejected: { line: number; reason: 'fields' | 'empty-name' }[];
  /** Numbers that may have lost their leading zeros (numeric cells of different lengths). */
  leadingZeros: boolean;
  /** CSV only. */
  separator?: ListSource['separator'];
  encoding?: ListSource['encoding'];
  /** Headers of the columns used, by role. */
  columns: { lastName?: string; firstName?: string; fullName?: string; email?: string; number?: string };
}

export type RosterProblem = 'too-large' | 'unreadable' | 'no-last-name' | 'no-first-name' | 'empty' | 'duplicate';

export class RosterError extends Error {
  constructor(
    readonly problem: RosterProblem,
    readonly detail = '',
  ) {
    super(detail ? `${problem}: ${detail}` : problem);
    this.name = 'RosterError';
  }
}

const ALIASES: Record<'lastName' | 'firstName' | 'fullName' | 'email' | 'number', readonly string[]> = {
  lastName: ['nom', 'nom de famille', 'nom famille', 'nom d usage', 'name', 'last name', 'lastname', 'surname', 'family name', 'familyname'],
  firstName: ['prenom', 'prenoms', 'premier prenom', 'first name', 'firstname', 'given name', 'givenname', 'forename'],
  fullName: ['nom prenom', 'nom et prenom', 'nom et prenoms', 'prenom nom', 'prenom et nom', 'nom complet', 'identite', 'eleve', 'eleves', 'etudiant', 'etudiants', 'etudiante', 'apprenant', 'participant', 'personne', 'full name', 'fullname', 'student', 'student name', 'person'],
  email: ['email', 'e mail', 'mail', 'courriel', 'adresse mail', 'adresse electronique', 'adresse email', 'e mail address', 'email address'],
  number: ['numero', 'numero etudiant', 'n etudiant', 'no etudiant', 'n', 'no', 'num', 'number', 'student id', 'studentid', 'id', 'ine', 'matricule', 'identifiant', 'numero ine'],
};

const header = (h: string): string => foldText(h.normalize('NFC')).replace(/[°º]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const roleOf = (h: string): keyof typeof ALIASES | undefined => {
  const name = header(h);
  return (Object.keys(ALIASES) as (keyof typeof ALIASES)[]).find((role) => ALIASES[role].includes(name));
};

// ---------------------------------------------------------------- reading

export function decodeList(bytes: Uint8Array): { text: string; encoding: NonNullable<ListSource['encoding']> } {
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

export function detectSeparator(firstLine: string): NonNullable<ListSource['separator']> {
  const count = (c: string): number => firstLine.split(c).length - 1;
  const counts: [NonNullable<ListSource['separator']>, number][] = [[';', count(';')], ['\t', count('\t')], [',', count(',')]];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ';';
}

const MAX_COLUMNS = 200;

/** CSV rows as they are: a row with a field too many is rejected later (PSEUDO-005). */
function csvSheet(name: string, rows: string[][]): ListSheet {
  const kept = rows.map((r) => r.slice(0, MAX_COLUMNS).map((f) => f.trim()));
  return { name, rows: kept, numeric: kept.map((r) => r.map(() => false)) };
}

function cellText(v: unknown): { text: string; numeric: boolean } {
  // A number is written without decimals when it has none (a student number, not 21900101.0).
  if (typeof v === 'number') return { text: String(v), numeric: true };
  if (typeof v === 'string') return { text: v.normalize('NFC').trim(), numeric: false };
  if (typeof v === 'boolean') return { text: v ? 'TRUE' : 'FALSE', numeric: false };
  return { text: '', numeric: false };
}

/** PSEUDO-004: a list file as sheets of text cells (CSV, TSV, XLSX, ODS), on the device. */
export async function readListSource(bytes: Uint8Array, name: string): Promise<ListSource> {
  if (bytes.length > LIMITS.listBytes) throw new RosterError('too-large');
  if (isZip(bytes)) {
    try {
      // The package is checked first, as any untrusted package (PSEUDO-032).
      const entries = readPackage(bytes);
      const names = new Set(entries.map((e) => e.name));
      const { parseKey } = await import('../sheet/address');
      let workbook: { sheets: { name: string; cells: Map<string, { value: unknown }> }[] };
      let format: ListSource['format'];
      if (names.has('xl/workbook.xml')) {
        workbook = (await import('../sheet/xlsx-reader')).readXlsx(bytes);
        format = 'xlsx';
      } else if (names.has('content.xml') && names.has('mimetype')) {
        workbook = (await import('../sheet/ods-reader')).readOds(bytes);
        format = 'ods';
      } else throw new RosterError('unreadable', name);
      const sheets = workbook.sheets.map((s) => {
        let maxRow = -1;
        let maxCol = -1;
        for (const key of s.cells.keys()) {
          const [r, c] = parseKey(key);
          if (r > LIMITS.listLines || c >= MAX_COLUMNS) continue;
          maxRow = Math.max(maxRow, r);
          maxCol = Math.max(maxCol, c);
        }
        const rows: string[][] = Array.from({ length: maxRow + 1 }, () => Array<string>(maxCol + 1).fill(''));
        const numeric: boolean[][] = Array.from({ length: maxRow + 1 }, () => Array<boolean>(maxCol + 1).fill(false));
        for (const [key, cell] of s.cells) {
          const [r, c] = parseKey(key);
          if (r > maxRow || c > maxCol) continue;
          const t = cellText(cell.value);
          rows[r]![c] = t.text;
          numeric[r]![c] = t.numeric;
        }
        return { name: s.name, rows, numeric };
      });
      return { format, sheets };
    } catch (e) {
      if (e instanceof RosterError) throw e;
      throw new RosterError('unreadable', (e as Error).message);
    }
  }
  const { text: raw, encoding } = decodeList(bytes);
  const text = raw.normalize('NFC');
  const separator = /\.tsv$/i.test(name) ? '\t' : detectSeparator(text.split(/\r?\n/, 1)[0] ?? '');
  return { format: 'csv', separator, encoding, sheets: [csvSheet(name.replace(/\.[^.]+$/, ''), csvRows(text, separator).slice(0, LIMITS.listLines + 1))] };
}

// ---------------------------------------------------------------- proposals

/** The header row: the first of the first ten rows holding a known column name, else the first row with text. */
export function guessHeaderRow(sheet: ListSheet): number {
  const top = sheet.rows.slice(0, 10);
  const known = top.findIndex((r) => r.some((c) => roleOf(c) === 'lastName' || roleOf(c) === 'firstName' || roleOf(c) === 'fullName'));
  if (known >= 0) return known;
  const any = top.findIndex((r) => r.some((c) => c.trim()));
  return any >= 0 ? any : -1;
}

/** PSEUDO-036, PSEUDO-037: the columns proposed from the headers. */
export function guessMapping(sheet: ListSheet, headerRow = guessHeaderRow(sheet)): ColumnMapping {
  const m: ColumnMapping = { header: headerRow, order: 'auto' };
  if (headerRow < 0) return m;
  (sheet.rows[headerRow] ?? []).forEach((h, i) => {
    const role = roleOf(h);
    if (role && m[role] === undefined) m[role] = i;
  });
  // Names in one column: only when the first names have no column of their own.
  if (m.lastName !== undefined && m.firstName !== undefined) delete m.fullName;
  else if (m.fullName !== undefined) {
    delete m.lastName;
    delete m.firstName;
  } else if (m.lastName !== undefined && m.firstName === undefined) {
    // "Nom" alone: a column of full names when its values have two words or more.
    const values = sheet.rows.slice(headerRow + 1).map((r) => r[m.lastName!] ?? '').filter(Boolean);
    if (values.length && values.filter((v) => v.trim().split(/\s+/).length >= 2).length * 2 > values.length) {
      m.fullName = m.lastName;
      delete m.lastName;
    }
  }
  return m;
}

const capitalWord = (w: string): boolean => /\p{L}.*\p{L}/u.test(w) && w === w.toUpperCase() && w !== w.toLowerCase();

/** PSEUDO-037: a full name split into last and first name; null when it cannot be. */
export function splitFullName(text: string, order: NameOrder): { lastName: string; firstName: string } | null {
  const s = text.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const comma = s.indexOf(',');
  if (comma > 0) {
    const lastName = s.slice(0, comma).trim();
    const firstName = s.slice(comma + 1).trim();
    return lastName && firstName ? { lastName, firstName } : null;
  }
  const words = s.split(' ');
  if (words.length < 2) return null;
  const caps = words.map(capitalWord);
  // Words in capitals are the last name ("MARTIN Léa", "Maëlle LE GALL").
  if (order === 'auto' && caps.some(Boolean) && !caps.every(Boolean)) {
    const lastName = words.filter((_, i) => caps[i]).join(' ');
    const firstName = words.filter((_, i) => !caps[i]).join(' ');
    return { lastName, firstName };
  }
  if (order === 'first-last') return { firstName: words[0]!, lastName: words.slice(1).join(' ') };
  // Last name first by default, as lists usually are ("Martin Léa").
  return { lastName: words.slice(0, -1).join(' '), firstName: words[words.length - 1]! };
}

// ---------------------------------------------------------------- the people

export function applyMapping(sheet: ListSheet, m: ColumnMapping): Roster {
  const head = m.header >= 0 ? (sheet.rows[m.header] ?? []) : [];
  const title = (i: number | undefined): string | undefined => (i === undefined ? undefined : head[i]?.trim() || colLetter(i));
  if (m.fullName === undefined && m.lastName === undefined) throw new RosterError('no-last-name');
  if (m.fullName === undefined && m.firstName === undefined) throw new RosterError('no-first-name');
  const people: ListedPerson[] = [];
  const rejected: Roster['rejected'] = [];
  const seen = new Map<string, number>();
  const numberLengths = new Set<number>();
  const width = head.length;
  const start = m.header + 1;
  sheet.rows.slice(start, start + LIMITS.listLines).forEach((r, k) => {
    const line = start + k + 1;
    if (r.every((f) => !f.trim())) return;
    if (width && r.length > width && r.slice(width).some((f) => f.trim())) return void rejected.push({ line, reason: 'fields' });
    let lastName = '';
    let firstName = '';
    if (m.fullName !== undefined) {
      const split = splitFullName(r[m.fullName] ?? '', m.order);
      if (split) ({ lastName, firstName } = split);
    } else {
      lastName = (r[m.lastName!] ?? '').trim();
      firstName = (r[m.firstName!] ?? '').trim();
    }
    if (!lastName || !firstName) return void rejected.push({ line, reason: 'empty-name' });
    const id = `${nameTokens(lastName).join(' ')}|${nameTokens(firstName).join(' ')}`;
    if (seen.has(id)) throw new RosterError('duplicate', `${firstName} ${lastName} (${seen.get(id)}, ${line})`);
    seen.set(id, line);
    const email = m.email !== undefined ? r[m.email]?.trim() : undefined;
    const number = m.number !== undefined ? r[m.number]?.trim() : undefined;
    if (number && m.number !== undefined && sheet.numeric[start + k]?.[m.number]) numberLengths.add(number.length);
    people.push({ lastName, firstName, ...(email ? { email } : {}), ...(number ? { number } : {}) });
  });
  if (!people.length) throw new RosterError('empty');
  const columns: Roster['columns'] = {};
  for (const role of ['lastName', 'firstName', 'fullName', 'email', 'number'] as const) {
    const t = title(m[role]);
    if (t) columns[role] = t;
  }
  return { people, rejected, leadingZeros: numberLengths.size > 1, columns };
}

/** "A", "B"… "AA": the letter of a column. */
export function colLetter(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** A CSV list read with the proposed columns (the first sheet, the header found). */
export function readRoster(bytes: Uint8Array): Roster {
  if (bytes.length > LIMITS.listBytes) throw new RosterError('too-large');
  const { text: raw, encoding } = decodeList(bytes);
  const text = raw.normalize('NFC');
  const separator = detectSeparator(text.split(/\r?\n/, 1)[0] ?? '');
  const sheet = csvSheet('list', csvRows(text, separator).slice(0, LIMITS.listLines + 1));
  const m = guessMapping(sheet, 0);
  return { ...applyMapping(sheet, m), separator, encoding };
}

/** The stable key of a person of a list. */
export const personKey = (p: ListedPerson): string => `${nameTokens(p.lastName).join(' ')}|${nameTokens(p.firstName).join(' ')}|${foldText(p.number ?? '')}`;
