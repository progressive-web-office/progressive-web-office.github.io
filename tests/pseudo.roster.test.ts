import { describe, expect, it } from 'vitest';
import { readRoster, RosterError } from '../src/pseudo/roster';
import { PEOPLE, rosters } from './pseudo-fixtures';

describe('PSEUDO-004 the list of people', () => {
  for (const r of rosters()) {
    if ('refused' in r.expect) continue;
    const expected = r.expect;
    it(`reads ${r.name}`, () => {
      const roster = readRoster(r.bytes);
      expect(roster.separator).toBe(expected.separator);
      expect(roster.encoding).toBe(expected.encoding);
      expect(roster.people).toHaveLength(expected.people);
    });
  }
  it('normalises an NFD list to NFC', () => {
    const roster = readRoster(rosters().find((r) => r.name === 'list-nfd-macos.csv')!.bytes);
    expect(roster.people.find((p) => p.lastName.startsWith('Lef'))!.lastName).toBe('Lefèvre');
    expect(roster.people[0]!.firstName).toBe('Léa');
  });
  it('reads Windows-1252 accents, e-mails and numbers', () => {
    const roster = readRoster(rosters().find((r) => r.name === 'list-tab-cp1252.csv')!.bytes);
    expect(roster.people[2]).toEqual({ lastName: "D'Alembert", firstName: 'Jean-Pierre', number: '21900103' });
    expect(roster.people[0]).toEqual({ lastName: 'Martin', firstName: 'Léa', email: PEOPLE[0]!.email, number: PEOPLE[0]!.number });
    expect(roster.columns).toEqual({ lastName: 'NOM', firstName: 'PRENOM', email: 'Courriel', number: 'N°' });
  });
  it('shows the lines it rejected', () => {
    const roster = readRoster(rosters().find((r) => r.name === 'list-ragged.csv')!.bytes);
    expect(roster.rejected).toEqual([{ line: 3, reason: 'fields' }]);
  });
});

describe('PSEUDO-005 lists that are refused', () => {
  it.each([
    ['list-missing-first-name.csv', 'no-first-name'],
    ['list-empty.csv', 'empty'],
    ['list-duplicate.csv', 'duplicate'],
  ])('%s', (name, problem) => {
    const bytes = rosters().find((r) => r.name === name)!.bytes;
    expect(() => readRoster(bytes)).toThrow(RosterError);
    try {
      readRoster(bytes);
    } catch (e) {
      expect((e as RosterError).problem).toBe(problem);
    }
  });
  it('refuses a list with no last name column', () => {
    expect(() => readRoster(new TextEncoder().encode('prenom;email\nLéa;x@example.org\n'))).toThrow(/no-last-name/);
  });
});
