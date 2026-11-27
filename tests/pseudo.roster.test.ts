import { describe, expect, it } from 'vitest';
import { applyMapping, guessHeaderRow, guessMapping, readListSource, readRoster, RosterError, splitFullName } from '../src/pseudo/roster';
import { hostilePackages, listSpreadsheets, PEOPLE, rosters } from './pseudo-fixtures';

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

describe('PSEUDO-004 lists in spreadsheets', () => {
  const lists = listSpreadsheets();
  it('reads the sheets of an Excel workbook and of an OpenDocument spreadsheet, on the device', async () => {
    const xlsx = await readListSource(lists[0]!.bytes, lists[0]!.name);
    expect(xlsx.format).toBe('xlsx');
    expect(xlsx.sheets.map((s) => s.name)).toEqual(['Groupe A', 'Groupe B']);
    const ods = await readListSource(lists[1]!.bytes, lists[1]!.name);
    expect(ods.format).toBe('ods');
    expect(ods.sheets.map((s) => s.name)).toEqual(['Notes', 'Liste']);
  });
  it('reads a CSV as one sheet, with its separator and encoding', async () => {
    const csv = await readListSource(rosters().find((r) => r.name === 'list-tab-cp1252.csv')!.bytes, 'list-tab-cp1252.csv');
    expect(csv).toMatchObject({ format: 'csv', separator: '\t', encoding: 'windows-1252' });
    expect(csv.sheets[0]!.rows[3]![1]).toBe('Jean-Pierre');
  });
  it('finds the header row below a title', async () => {
    const sheet = (await readListSource(lists[0]!.bytes, lists[0]!.name)).sheets[0]!;
    expect(guessHeaderRow(sheet)).toBe(2);
  });
  it('refuses a spreadsheet that breaks the package limits', async () => {
    const bomb = hostilePackages().find((h) => h.name === 'bomb-ratio.docx')!;
    await expect(readListSource(bomb.bytes, 'list.xlsx')).rejects.toMatchObject({ problem: 'unreadable' });
  });
});

describe('PSEUDO-036 columns proposed, changed by the user', () => {
  it('proposes the columns from their names', async () => {
    const ods = (await readListSource(listSpreadsheets()[1]!.bytes, 'list.ods')).sheets[1]!;
    expect(guessMapping(ods)).toEqual({ header: 0, lastName: 0, firstName: 1, email: 2, order: 'auto' });
    const xlsx = (await readListSource(listSpreadsheets()[0]!.bytes, 'groups.xlsx')).sheets[0]!;
    expect(guessMapping(xlsx)).toEqual({ header: 2, number: 0, fullName: 1, email: 2, order: 'auto' });
  });
  it('reads the people with the columns the user chose, and without a header row', async () => {
    const sheet = (await readListSource(listSpreadsheets()[1]!.bytes, 'list.ods')).sheets[1]!;
    // The user says the first column is the first name (wrongly): the preview shows it.
    const swapped = applyMapping(sheet, { header: 0, lastName: 1, firstName: 0, order: 'auto' });
    expect(swapped.people[0]).toEqual({ lastName: 'Léa', firstName: 'Martin' });
    const noHeader = applyMapping({ name: 'x', rows: [['Martin', 'Léa'], ['Petit', 'Théo']], numeric: [[false, false], [false, false]] }, { header: -1, lastName: 0, firstName: 1, order: 'auto' });
    expect(noHeader.people.map((p) => p.lastName)).toEqual(['Martin', 'Petit']);
    expect(noHeader.columns).toEqual({ lastName: 'A', firstName: 'B' });
  });
});

describe('PSEUDO-037 names in one column', () => {
  it.each([
    ['MARTIN Léa', 'auto', 'MARTIN', 'Léa'],
    ['LE GALL Maëlle', 'auto', 'LE GALL', 'Maëlle'],
    ["D'ALEMBERT Jean-Pierre", 'auto', "D'ALEMBERT", 'Jean-Pierre'],
    ['Maëlle LE GALL', 'auto', 'LE GALL', 'Maëlle'],
    ['Martin, Léa', 'first-last', 'Martin', 'Léa'],
    ['Martin Léa', 'auto', 'Martin', 'Léa'],
    ['Léa Martin', 'first-last', 'Martin', 'Léa'],
    ['Le Gall Maëlle', 'last-first', 'Le Gall', 'Maëlle'],
  ] as const)('%s (%s)', (text, order, lastName, firstName) => {
    expect(splitFullName(text, order)).toEqual({ lastName, firstName });
  });
  it('cannot split a single word', () => {
    expect(splitFullName('Martin', 'auto')).toBeNull();
  });
  it('reads a column of full names, and proposes it for a lone "Nom" column holding two words', async () => {
    const sheet = (await readListSource(listSpreadsheets()[0]!.bytes, 'groups.xlsx')).sheets[0]!;
    const roster = applyMapping(sheet, guessMapping(sheet));
    expect(roster.people).toHaveLength(8);
    expect(roster.people[0]).toEqual({ lastName: 'MARTIN', firstName: 'Léa', email: 'lea.martin@etu.example.org', number: '21900101' });
    expect(roster.people[3]).toMatchObject({ lastName: 'LE GALL', firstName: 'Maëlle' });
    const csv = { name: 'x', rows: [['Nom'], ['MARTIN Léa'], ['PETIT Théo']], numeric: [[false], [false], [false]] };
    expect(guessMapping(csv)).toMatchObject({ fullName: 0 });
  });
});

describe('PSEUDO-005 numbers and problems of a sheet', () => {
  it('writes numbers without decimals and warns about lost leading zeros', async () => {
    const sheet = (await readListSource(listSpreadsheets()[0]!.bytes, 'groups.xlsx')).sheets[0]!;
    const roster = applyMapping(sheet, guessMapping(sheet));
    expect(roster.people.map((p) => p.number)).toContain('123');
    expect(roster.people.every((p) => !p.number?.includes('.'))).toBe(true);
    expect(roster.leadingZeros).toBe(true);
    const b = (await readListSource(listSpreadsheets()[0]!.bytes, 'groups.xlsx')).sheets[1]!;
    expect(applyMapping(b, guessMapping(b)).leadingZeros).toBe(false);
  });
  it('says what is missing', async () => {
    const sheet = (await readListSource(listSpreadsheets()[1]!.bytes, 'list.ods')).sheets[0]!;
    expect(() => applyMapping(sheet, guessMapping(sheet))).toThrow(RosterError);
    expect(() => applyMapping(sheet, { header: 0, lastName: 0, order: 'auto' })).toThrow(/no-first-name/);
  });
});
