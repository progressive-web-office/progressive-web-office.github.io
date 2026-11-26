// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assignPseudonyms, expired, newTable, openTable, saveTable, secureRandomInt } from '../src/pseudo/table';
import { PEOPLE } from './pseudo-fixtures';

const listed = PEOPLE.map((p) => ({ lastName: p.last, firstName: p.first, ...(p.email ? { email: p.email } : {}), ...(p.number ? { number: p.number } : {}) }));

describe('PSEUDO-015 pseudonyms', () => {
  it('draws without modulo bias (rejection sampling)', () => {
    // n = 3: 2^32 % 3 = 1, so the largest value must be rejected.
    const values = [2 ** 32 - 1, 7];
    let k = 0;
    const source = (b: Uint32Array): Uint32Array => ((b[0] = values[k++]!), b);
    expect(secureRandomInt(3, source)).toBe(7 % 3);
    expect(k).toBe(2);
  });
  it('is roughly uniform', () => {
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < 5000; i++) counts[secureRandomInt(5)]!++;
    for (const c of counts) expect(Math.abs(c - 1000)).toBeLessThan(150);
  });
  it('gives unique pseudonyms unrelated to the order of the list', () => {
    const firsts = new Set<string>();
    for (let run = 0; run < 20; run++) {
      const people = assignPseudonyms(newTable(), listed);
      expect(new Set(people.map((p) => p.pseudonym)).size).toBe(listed.length);
      for (const p of people) expect(p.pseudonym).toMatch(/^ETU-\d{3}$/);
      firsts.add(people[0]!.pseudonym);
      const sorted = [...people].sort((a, b) => a.pseudonym.localeCompare(b.pseudonym));
      expect(sorted.map((p) => p.key)).not.toEqual(people.map((p) => p.key));
    }
    expect(firsts.size).toBeGreaterThan(10);
  });
  it('keeps the pseudonym of a person in a later session, and never gives a used number again', () => {
    const table = newTable();
    const first = assignPseudonyms(table, listed.slice(0, 5));
    const again = assignPseudonyms(table, [...listed.slice(2, 8)]);
    expect(again.slice(0, 3).map((p) => p.pseudonym)).toEqual(first.slice(2, 5).map((p) => p.pseudonym));
    expect(new Set(table.people.map((p) => p.pseudonym)).size).toBe(table.people.length);
    expect(table.people).toHaveLength(8);
  });
  it('finds a person again by name when the next list has no numbers', () => {
    const table = newTable();
    const first = assignPseudonyms(table, listed.slice(0, 3));
    const again = assignPseudonyms(table, listed.slice(0, 3).map(({ lastName, firstName }) => ({ lastName, firstName })));
    expect(again.map((p) => p.pseudonym)).toEqual(first.map((p) => p.pseudonym));
    expect(table.people).toHaveLength(3);
  });
  it('uses four digits above 450 people', () => {
    const many = Array.from({ length: 451 }, (_, i) => ({ lastName: `Nom${i}`, firstName: `Prénom${i}` }));
    expect(assignPseudonyms(newTable(), many)[0]!.pseudonym).toMatch(/^ETU-\d{4}$/);
  });
  it('takes the prefix of the table', () => {
    expect(assignPseudonyms(newTable('P-'), listed.slice(0, 1))[0]!.pseudonym).toMatch(/^P-\d{3}$/);
  });
});

describe('PSEUDO-016 the mapping table, encrypted', () => {
  it('goes to a KDBX 4 file and comes back', async () => {
    const table = newTable();
    assignPseudonyms(table, listed);
    table.files.push({ source: 'a/b.docx', output: 'ETU-001.docx', date: '2026-11-26', people: [table.people[0]!.key] });
    const bytes = await saveTable(table, 'correct horse battery');
    expect(new TextDecoder().decode(bytes)).not.toContain('Martin');
    const back = await openTable(bytes, 'correct horse battery');
    expect(back.people.map((p) => [p.key, p.pseudonym, p.email]).sort()).toEqual(table.people.map((p) => [p.key, p.pseudonym, p.email]).sort());
    expect(back.files).toEqual(table.files);
    expect(back.deleteAfter).toBe(table.deleteAfter);
    await expect(openTable(bytes, 'wrong password')).rejects.toThrow();
  }, 60_000);
});

describe('PSEUDO-017 retention', () => {
  it('plans the deletion one year later and says when it has passed', () => {
    const table = newTable('ETU-', new Date('2026-11-26T10:00:00Z'));
    expect(table.deleteAfter).toBe('2027-11-26');
    expect(expired(table, new Date('2027-11-26T12:00:00Z'))).toBe(false);
    expect(expired(table, new Date('2027-11-27T00:00:01Z'))).toBe(true);
  });
});
