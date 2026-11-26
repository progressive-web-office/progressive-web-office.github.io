/**
 * PSEUDO-015..PSEUDO-017: pseudonyms and the mapping table. Pseudonyms are
 * drawn at random without bias; a person keeps theirs in later sessions with
 * the same table; the table lives only encrypted, in a KDBX 4 file (and in
 * this browser only while the application lock is set).
 */
import type { Person } from './engine';
import { personKey, type ListedPerson } from './roster';

export interface TablePerson extends Person {
  added: string;
}

export interface TableFile {
  source: string;
  output: string;
  date: string;
  people: string[];
}

export interface TableReport {
  date: string;
  /** The report of a run, as JSON (it holds real names). */
  json: string;
}

export interface PseudonymTable {
  version: 1;
  prefix: string;
  created: string;
  /** PSEUDO-017: planned deletion date (ISO date). */
  deleteAfter: string;
  keepReason?: string;
  people: TablePerson[];
  files: TableFile[];
  reports: TableReport[];
}

/** A uniform integer in [0, n), from `crypto.getRandomValues`, by rejection sampling (no modulo bias). */
export function secureRandomInt(n: number, source: (buf: Uint32Array<ArrayBuffer>) => Uint32Array = (b) => crypto.getRandomValues(b)): number {
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) throw new RangeError(`bad range ${n}`);
  const limit = 2 ** 32 - (2 ** 32 % n);
  const buf = new Uint32Array(new ArrayBuffer(4));
  for (;;) {
    const x = source(buf)[0]!;
    if (x < limit) return x % n;
  }
}

export function newTable(prefix = 'ETU-', now = new Date()): PseudonymTable {
  const deleteAfter = new Date(now);
  deleteAfter.setFullYear(deleteAfter.getFullYear() + 1);
  return { version: 1, prefix, created: now.toISOString(), deleteAfter: deleteAfter.toISOString().slice(0, 10), people: [], files: [], reports: [] };
}

const numberOf = (pseudonym: string, prefix: string): number => Number(pseudonym.slice(prefix.length));

/**
 * The people of a list with their pseudonyms: those already in the table keep
 * theirs, the others get free numbers drawn at random (the table is updated).
 */
export function assignPseudonyms(table: PseudonymTable, listed: readonly ListedPerson[], random: (n: number) => number = secureRandomInt, now = new Date()): Person[] {
  const used = new Set(table.people.map((p) => numberOf(p.pseudonym, table.prefix)));
  const byKey = new Map(table.people.map((p) => [p.key, p]));
  // A list without numbers (or with them, when the table had none) still finds its people by name, when only one matches.
  const name = (key: string): string => key.split('|').slice(0, 2).join('|');
  const find = (key: string): TablePerson | undefined => {
    const exact = byKey.get(key);
    if (exact) return exact;
    // Two different numbers are two people; a missing number on either side is not a difference.
    const noNumber = (k: string): boolean => k.endsWith('|');
    const same = table.people.filter((p) => name(p.key) === name(key) && (noNumber(p.key) || noNumber(key)));
    return same.length === 1 ? same[0] : undefined;
  };
  const fresh = listed.filter((l) => !find(personKey(l)));
  const total = table.people.length + fresh.length;
  // Three digits while the pool stays at least twice the list, four above.
  const digits = total > 450 || table.people.some((p) => p.pseudonym.length > table.prefix.length + 3) ? 4 : 3;
  const pool: number[] = [];
  for (let n = 1; n < 10 ** digits; n++) if (!used.has(n)) pool.push(n);
  const out: Person[] = [];
  for (const l of listed) {
    const key = personKey(l);
    let p = find(key);
    if (!p) {
      const at = random(pool.length);
      const n = pool[at]!;
      pool[at] = pool[pool.length - 1]!;
      pool.pop();
      p = {
        key,
        lastName: l.lastName,
        firstName: l.firstName,
        ...(l.email ? { email: l.email } : {}),
        ...(l.number ? { number: l.number } : {}),
        pseudonym: `${table.prefix}${String(n).padStart(digits, '0')}`,
        added: now.toISOString(),
      };
      table.people.push(p);
      byKey.set(key, p);
    } else {
      // The list may bring an e-mail or a number the table did not have.
      if (l.email && !p.email) p.email = l.email;
      if (l.number && !p.number) p.number = l.number;
    }
    out.push({ key: p.key, lastName: p.lastName, firstName: p.firstName, ...(p.email ? { email: p.email } : {}), ...(p.number ? { number: p.number } : {}), pseudonym: p.pseudonym });
  }
  return out;
}

/** PSEUDO-017: the planned deletion date has passed. */
export const expired = (table: PseudonymTable, now = new Date()): boolean => now.toISOString().slice(0, 10) > table.deleteAfter;

// ---------------------------------------------------------------- KDBX file

const META_TITLE = 'Progressive Web Office — pseudonymisation';
const PEOPLE_GROUP = 'Pseudonyms';
const FIELDS = ['pwo:key', 'pwo:last', 'pwo:first', 'pwo:email', 'pwo:number', 'pwo:added'];

/** The table as a KDBX 4 file: one entry per person (readable in other KDBX applications), one for the rest. */
export async function saveTable(table: PseudonymTable, password: string): Promise<Uint8Array> {
  const kdbx = await import('../vault/kdbx');
  const db = await kdbx.newVault(META_TITLE, password);
  const group = kdbx.newGroup(db, undefined, PEOPLE_GROUP);
  for (const p of table.people) {
    const id = kdbx.newEntry(db, group, p.pseudonym);
    kdbx.setFields(db, id, {
      UserName: `${p.firstName} ${p.lastName}`,
      'pwo:key': p.key,
      'pwo:last': p.lastName,
      'pwo:first': p.firstName,
      'pwo:email': p.email ?? '',
      'pwo:number': p.number ?? '',
      'pwo:added': p.added,
    }, FIELDS);
  }
  const meta = kdbx.newEntry(db, undefined, META_TITLE);
  const { people: _people, ...rest } = table;
  kdbx.setFields(db, meta, { 'pwo:table': JSON.stringify(rest), Notes: `Mapping table of pseudonyms. Keep it encrypted, never send it, delete it after ${table.deleteAfter}.` }, ['pwo:table']);
  return kdbx.saveVault(db);
}

export async function openTable(bytes: Uint8Array, password: string): Promise<PseudonymTable> {
  const kdbx = await import('../vault/kdbx');
  const db = await kdbx.openVault(bytes, password);
  const entries = kdbx.entriesOf(db);
  const meta = entries.find((e) => e.title === META_TITLE && e.fields.some((f) => f.name === 'pwo:table'));
  if (!meta) throw new Error('not a mapping table');
  const rest = JSON.parse(kdbx.fieldOf(db, meta.uuid, 'pwo:table')) as Omit<PseudonymTable, 'people'>;
  const people: TablePerson[] = entries
    .filter((e) => e.fields.some((f) => f.name === 'pwo:key'))
    .map((e) => {
      const get = (n: string): string => kdbx.fieldOf(db, e.uuid, n);
      const email = get('pwo:email');
      const number = get('pwo:number');
      return { key: get('pwo:key'), lastName: get('pwo:last'), firstName: get('pwo:first'), ...(email ? { email } : {}), ...(number ? { number } : {}), pseudonym: e.title, added: get('pwo:added') };
    });
  return { ...rest, people };
}

// ---------------------------------------------------------------- copy in this browser (PSEUDO-016)

const STORE = 'pwo.pseudo.table';

/** Keep the encrypted file in this browser, only while the application lock is set and open. */
export async function rememberTable(file: Uint8Array): Promise<boolean> {
  const lock = await import('../lock/session');
  if (!lock.lockSet() || !lock.unlocked()) return false;
  let bin = '';
  for (const b of file) bin += String.fromCharCode(b);
  localStorage.setItem(STORE, await lock.sealText(btoa(bin)));
  return true;
}

export async function rememberedTable(): Promise<Uint8Array | null> {
  const lock = await import('../lock/session');
  const sealed = localStorage.getItem(STORE);
  if (!sealed) return null;
  if (!lock.sealedText(sealed) || !lock.lockSet()) {
    // Never kept in clear: drop what is not sealed.
    localStorage.removeItem(STORE);
    return null;
  }
  if (!lock.unlocked()) return null;
  const bin = atob(await lock.unsealText(sealed));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function forgetTable(): void {
  localStorage.removeItem(STORE);
}
