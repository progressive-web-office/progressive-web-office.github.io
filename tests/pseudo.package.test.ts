import { describe, expect, it } from 'vitest';
import { readPackage, safeEntryName } from '../src/pseudo/package/zip';
import { parseXmlPart } from '../src/pseudo/package/xml';
import { Refusal } from '../src/pseudo/limits';
import { DEFAULT_OPTIONS, pseudonymiseFiles } from '../src/pseudo/pipeline';
import { docxFixture, hostilePackages, oversizeFile } from './pseudo-fixtures';
import { PEOPLE_WITH_PSEUDONYMS as people } from './pseudo-fixtures';

const codeOf = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Refusal ? e.code : `other: ${(e as Error).message}`;
  }
  return 'accepted';
};

describe('PSEUDO-032 untrusted packages', () => {
  it.each([
    ['bomb-ratio.docx', 'ratio'],
    ['lying-size.docx', 'size-mismatch'],
    ['encrypted-entry.docx', 'encrypted'],
    ['duplicate-entry.docx', 'duplicate'],
    ['too-many-entries.docx', 'too-many-entries'],
    ['zip-slip.docx', 'unsafe-name'],
    ['absolute-path.docx', 'unsafe-name'],
  ])('refuses %s (%s)', (name, code) => {
    const h = hostilePackages().find((x) => x.name === name)!;
    expect(codeOf(() => readPackage(h.bytes))).toBe(code);
  });
  it.each([['billion-laughs.docx'], ['external-entity.docx']])('refuses the document type declaration of %s', (name) => {
    const h = hostilePackages().find((x) => x.name === name)!;
    const entries = readPackage(h.bytes);
    const doc = entries.find((e) => e.name === 'word/document.xml')!;
    expect(codeOf(() => parseXmlPart(new TextDecoder().decode(doc.data), doc.name))).toBe('doctype');
  });
  it('checks entry names', () => {
    expect(safeEntryName('word/document.xml')).toBe(true);
    for (const bad of ['../x', 'a/../../x', '/etc/x', 'C:/x', 'a\\b', 'a\0b', '']) expect(safeEntryName(bad)).toBe(false);
  });
  it('reads a normal package', () => {
    expect(readPackage(docxFixture().bytes).length).toBeGreaterThan(20);
  });
  it('writes no output for a refused file, and says why', async () => {
    const files = [...hostilePackages().map((h) => ({ name: h.name, read: async () => h.bytes })), { name: 'big.docx', read: async () => oversizeFile() }];
    const report = await pseudonymiseFiles(files, { people, options: DEFAULT_OPTIONS });
    for (const f of report.files) {
      expect(f.status, f.source).toBe('refused');
      expect(f.outputBytes).toBeUndefined();
      expect(f.refusal?.code).not.toBe('error');
    }
    expect(report.files.at(-1)!.refusal?.code).toBe('too-large');
  });
});
