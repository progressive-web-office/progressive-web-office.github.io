import { describe, expect, it } from 'vitest';
import { pseudonymiseFiles, DEFAULT_OPTIONS, type FileReport } from '../src/pseudo/pipeline';
import { choiceFor, cleanChoices, kindOfName, OUTPUT_CHOICES } from '../src/pseudo/outputs';
import { docxFixture, odsFixture, odtFixture, pptxFixture, textFixtures, xlsxFixture, type Fixture } from './pseudo-fixtures';
import { PEOPLE_WITH_PSEUDONYMS as people } from './pseudo-fixtures';
import { readOdt } from '../src/document/odt-reader';
import { readDocx } from '../src/document/docx-reader';
import { readOds } from '../src/sheet/ods-reader';
import { readOdp } from '../src/slides/odp-reader';
import { plainText } from '../src/document/model';
import type { OutputChoices } from '../src/pseudo/outputs';

async function run(f: Fixture, outputs: OutputChoices): Promise<FileReport> {
  const report = await pseudonymiseFiles([{ name: f.name, read: async () => f.bytes }], { people, options: { ...DEFAULT_OPTIONS, outputs } });
  return report.files[0]!;
}

const bodyPlanted = (f: Fixture, part: RegExp): string[] => f.planted.filter((p) => part.test(p.part)).map((p) => p.text.normalize('NFC'));

describe('PSEUDO-043 output formats', () => {
  it('offers, for each kind, its own format first, plain text, and the formats the application writes', () => {
    for (const choices of Object.values(OUTPUT_CHOICES)) {
      expect(choices[0]).toBe('kept');
      expect(choices).toContain('text');
    }
    expect(kindOfName('a/b/Rapport.DOTX')).toBe('docx');
    expect(kindOfName('notes.markdown')).toBe('md');
    expect(kindOfName('data.csv')).toBeUndefined();
    expect(choiceFor({ docx: 'odt' }, 'docx')).toBe('odt');
    expect(choiceFor({ docx: 'pptx' as never }, 'docx')).toBe('kept');
    expect(choiceFor(undefined, undefined)).toBe('kept');
    expect(cleanChoices({ docx: 'odt', pdf: 'docx', odt: 3, other: 'text' })).toEqual({ docx: 'odt' });
  });

  it('keeps the format by default', async () => {
    const r = await run(docxFixture(), {});
    expect(r.output).toMatch(/\.docx$/);
  });

  it('converts a DOCX to ODT after pseudonymising it, and checks the converted file', async () => {
    const f = docxFixture();
    const r = await run(f, { docx: 'odt' });
    expect(r.refusal).toBeUndefined();
    expect(r.output).toMatch(/^ETU-\d{3}.*\.odt$/);
    const text = plainText(readOdt(r.outputBytes!)).normalize('NFC');
    for (const name of bodyPlanted(f, /^word\/document\.xml$/)) expect(text, name).not.toContain(name);
    expect(r.findings.filter((x) => x.kind === 'residue')).toEqual([]);
  });

  it('converts an ODT to DOCX and to Markdown', async () => {
    const f = odtFixture();
    const docx = await run(f, { odt: 'docx' });
    expect(docx.output).toMatch(/\.docx$/);
    const text = plainText(readDocx(docx.outputBytes!)).normalize('NFC');
    for (const name of bodyPlanted(f, /^content\.xml$/)) expect(text, name).not.toContain(name);
    const md = await run(f, { odt: 'md' });
    expect(md.output).toMatch(/\.md$/);
    const out = new TextDecoder().decode(md.outputBytes!).normalize('NFC');
    for (const name of bodyPlanted(f, /^content\.xml$/)) expect(out, name).not.toContain(name);
  });

  it('converts spreadsheets and presentations', async () => {
    const xlsx = await run(xlsxFixture(), { xlsx: 'ods' });
    expect(xlsx.output).toMatch(/\.ods$/);
    expect(readOds(xlsx.outputBytes!).sheets.length).toBeGreaterThan(0);
    const csv = await run(odsFixture(), { ods: 'csv' });
    expect(csv.output).toMatch(/\.csv$/);
    const pptx = await run(pptxFixture(), { pptx: 'odp' });
    expect(pptx.output).toMatch(/\.odp$/);
    expect(readOdp(pptx.outputBytes!).slides.length).toBeGreaterThan(0);
  });

  it('writes plain text holding every text analysed, the names replaced', async () => {
    const f = docxFixture();
    const r = await run(f, { docx: 'text' });
    expect(r.output).toMatch(/\.txt$/);
    const out = new TextDecoder().decode(r.outputBytes!).normalize('NFC');
    for (const p of f.planted) expect(out, `${p.part}: ${p.text}`).not.toContain(p.text.normalize('NFC'));
    for (const d of f.decoys.filter((x) => /document\.xml$/.test(x.part))) expect(out, d.text).toContain(d.text.normalize('NFC'));
  });

  it('converts a Markdown note to DOCX', async () => {
    const md = textFixtures().find((f) => f.name.endsWith('.md'))!;
    const r = await run(md, { md: 'docx' });
    expect(r.output).toMatch(/\.docx$/);
    const text = plainText(readDocx(r.outputBytes!)).normalize('NFC');
    for (const p of md.planted) expect(text, p.text).not.toContain(p.text.normalize('NFC'));
  });
});
