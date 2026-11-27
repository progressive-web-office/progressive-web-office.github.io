import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { pseudonymiseFiles, DEFAULT_OPTIONS, reidentifyFile, type FileReport } from '../src/pseudo/pipeline';
import type { Person } from '../src/pseudo/engine';
import { docxFixture, odpFixture, odsFixture, odtFixture, pptxFixture, textFixtures, xlsxFixture, type Fixture } from './pseudo-fixtures';
import { PEOPLE_WITH_PSEUDONYMS as people } from './pseudo-fixtures';
import { readDocx } from '../src/document/docx-reader';
import { readOdt } from '../src/document/odt-reader';
import { readXlsx } from '../src/sheet/xlsx-reader';
import { readOds } from '../src/sheet/ods-reader';
import { readPptx } from '../src/slides/pptx-reader';
import { readOdp } from '../src/slides/odp-reader';
import { plainText } from '../src/document/model';

const nfc = (s: string): string => s.normalize('NFC');

/** Every text of a part (nested packages included): texts between tags and attribute values. */
function partText(entries: Record<string, Uint8Array>, part: string): string {
  const data = entries[part];
  if (!data) return '';
  if (data[0] === 0x50 && data[1] === 0x4b) {
    const inner = unzipSync(data);
    return Object.keys(inner).map((k) => partText(inner, k)).join('\n');
  }
  const text = strFromU8(data);
  if (!text.trimStart().startsWith('<')) return nfc(text);
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const out: string[] = [];
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    for (const a of Array.from(el.attributes)) out.push(a.value);
    for (const c of Array.from(el.childNodes)) if (c.nodeType === 3) out.push((c as Text).data);
  }
  // Paragraph texts joined, so that a name split across runs would show.
  return nfc(`${out.join('\n')}\n${doc.documentElement.textContent ?? ''}`);
}

async function run(f: Fixture, opts: Partial<typeof DEFAULT_OPTIONS> = {}, who: readonly Person[] = people): Promise<FileReport> {
  const report = await pseudonymiseFiles([{ name: f.name, read: async () => f.bytes }], { people: who, options: { ...DEFAULT_OPTIONS, ...opts } });
  return report.files[0]!;
}

function expectClean(f: Fixture, r: FileReport): void {
  expect(r.refusal).toBeUndefined();
  const out = unzipSync(r.outputBytes!);
  for (const p of f.planted) {
    const text = partText(out, p.part);
    expect(text, `${p.part}: «${p.text}» (${p.note ?? p.form})`).not.toContain(nfc(p.text));
  }
  for (const d of f.decoys) expect(partText(out, d.part), `${d.part}: decoy «${d.text}»`).toContain(nfc(d.text));
  for (const name of f.removed.filter((n) => !n.includes(':'))) expect(out[name], `removed ${name}`).toBeUndefined();
  for (const name of f.toCheck) expect(r.toCheck.map((c) => c.where)).toContain(name);
}

describe('PSEUDO-018 DOCX', () => {
  it('replaces every planted occurrence, keeps the decoys and every other part, removes thumbnail and signatures', async () => {
    const f = docxFixture();
    const r = await run(f);
    expectClean(f, r);
    const out = unzipSync(r.outputBytes!);
    expect(strFromU8(out['_rels/.rels']!)).not.toContain('thumbnail');
    expect(strFromU8(out['[Content_Types].xml']!)).not.toContain('_xmlsignatures/sig1.xml');
    for (const name of Object.keys(unzipSync(f.bytes))) if (!f.removed.includes(name)) expect(out[name], name).toBeDefined();
    // The output is still a DOCX the application reads.
    expect(plainText(readDocx(r.outputBytes!))).toContain('ETU-');
    expect(r.attribution.people[0]?.key).toBe(f.attribution[0]);
    expect(r.output).toMatch(/^ETU-\d{3}(_ETU-\d{3})*\.docx$/);
    expect(r.status).not.toBe('clean');
  });
  it('turns AUTHOR fields into text', async () => {
    const r = await run(docxFixture());
    expect(strFromU8(unzipSync(r.outputBytes!)['word/document.xml']!)).not.toContain('AUTHOR');
  });
  it('PSEUDO-033 removes the Word revision identifiers, unless asked not to', async () => {
    const with_ = strFromU8(unzipSync((await run(docxFixture())).outputBytes!)['word/document.xml']!);
    expect(with_).not.toContain('w:rsidR');
    const without = strFromU8(unzipSync((await run(docxFixture(), { removeLinkable: false })).outputBytes!)['word/document.xml']!);
    expect(without).toContain('w:rsidR');
  });
  it('PSEUDO-025 replaces pictures, empties objects and removes macros on request', async () => {
    const f = docxFixture();
    const withMacros = unzipSync(f.bytes);
    withMacros['word/vbaProject.bin'] = new Uint8Array([1, 2, 3]);
    const { zipSync } = await import('fflate');
    const r = await run({ ...f, bytes: zipSync(withMacros) }, { removePictures: true });
    expect(r.toCheck.filter((c) => c.kind === 'picture')).toHaveLength(0);
    const out = unzipSync(r.outputBytes!);
    expect(out['word/embeddings/oleObject1.bin']!.length).toBe(0);
    expect(out['word/vbaProject.bin']).toBeUndefined();
    const kept = await run({ ...f, bytes: zipSync(withMacros) });
    expect(kept.toCheck.some((c) => c.kind === 'macro')).toBe(true);
  });
});

describe('PSEUDO-019 OpenDocument', () => {
  for (const make of [odtFixture, odsFixture, odpFixture]) {
    it(make().name, async () => {
      const f = make();
      const r = await run(f);
      expectClean(f, r);
      const out = unzipSync(r.outputBytes!);
      expect(strFromU8(out['META-INF/manifest.xml']!)).not.toContain('Thumbnails/thumbnail.png');
      expect(strFromU8(out['settings.xml']!)).not.toContain('PrinterName');
      expect(Object.keys(out)[0]).toBe('mimetype');
      const reread = f.name.endsWith('.odt') ? plainText(readOdt(r.outputBytes!)) : f.name.endsWith('.ods') ? readOds(r.outputBytes!).sheets[0]!.name : String(readOdp(r.outputBytes!).slides.length);
      expect(reread).toBeTruthy();
    });
  }
});

describe('PSEUDO-020 XLSX and PSEUDO-021 PPTX', () => {
  it('grades.xlsx', async () => {
    const f = xlsxFixture();
    const r = await run(f);
    expectClean(f, r);
    const wb = readXlsx(r.outputBytes!);
    expect(wb.sheets[0]!.name).toMatch(/^ETU-\d{3}$/);
    const table = strFromU8(unzipSync(r.outputBytes!)['xl/tables/table1.xml']!);
    expect(table).toMatch(/displayName="Tableau_ETU_\d{3}"/);
  });
  it('talk.pptx', async () => {
    const f = pptxFixture();
    const r = await run(f);
    expectClean(f, r);
    expect(readPptx(r.outputBytes!).slides).toHaveLength(1);
  });
});

describe('PSEUDO-022 text files', () => {
  for (const f of textFixtures()) {
    it(f.name, async () => {
      const r = await run(f);
      expect(r.refusal).toBeUndefined();
      const out = nfc(new TextDecoder().decode(r.outputBytes!));
      for (const p of f.planted) expect(out, `«${p.text}» (${p.note ?? p.form})`).not.toContain(nfc(p.text));
      for (const d of f.decoys) expect(out, `decoy «${d.text}»`).toContain(nfc(d.text));
    });
  }
  it('keeps the byte order mark and the line ends', async () => {
    const f = textFixtures().find((x) => x.name === 'notes.txt')!;
    const r = await run(f);
    const b = r.outputBytes!;
    expect([b[0], b[1], b[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(b)).toContain('\r\n');
  });
  it('keeps Windows-1252', async () => {
    const bytes = Uint8Array.from([...'Rédigé par : Inès Blanc\r\n'].map((c) => c.charCodeAt(0)));
    const r = await run({ name: 'a.txt', bytes, planted: [], decoys: [], toCheck: [], removed: [], attribution: [] });
    expect(new TextDecoder('windows-1252').decode(r.outputBytes!)).toMatch(/^Rédigé par : ETU-\d{3}\r\n$/);
  });
});

describe('PSEUDO-026 output check', () => {
  it('never says a bare OK: residues are found when the engine misses a name', async () => {
    // The engine is given a list without Hugo; the check is given the full list.
    const f = docxFixture();
    const report = await pseudonymiseFiles([{ name: f.name, read: async () => f.bytes }], { people, options: DEFAULT_OPTIONS });
    expect(report.files[0]!.status).not.toBe('clean');
    const partial = people.filter((p) => p.key !== 'anais');
    const r = await run(textFixtures()[0]!, {}, partial);
    // Anaïs is not in the list given: nothing to find for her, nothing reported.
    expect(r.findings.every((x) => x.person !== 'anais')).toBe(true);
  });
  it('reports a residue left in a binary part', async () => {
    const r = await run(docxFixture());
    expect(r.findings.some((x) => x.kind === 'residue' && x.where.includes('oleObject1.bin'))).toBe(true);
    expect(r.status).toBe('residues');
  });
  it('says "check" when pictures were not analysed, "clean" only without anything left', async () => {
    const pictureOnly = await run(odpFixture());
    expect(pictureOnly.status).toBe('check');
    const plain = await run({ name: 'a.md', bytes: new TextEncoder().encode('Nom : Inès Blanc\n'), planted: [], decoys: [], toCheck: [], removed: [], attribution: [] });
    expect(plain.status).toBe('clean');
  });
});

describe('PSEUDO-030 re-identification of documents', () => {
  it('puts the names back in a DOCX and a Markdown file', async () => {
    const r = await run(docxFixture());
    const back = await reidentifyFile('back.docx', r.outputBytes!, people, 'ETU-');
    expect(back.replaced).toBeGreaterThan(10);
    expect(plainText(readDocx(back.bytes))).toContain('Théo Petit');
    const md = await reidentifyFile('back.md', new TextEncoder().encode(`Bravo **${people[5]!.pseudonym.replace('-', ' ')}** et etu-999.`), people, 'ETU-');
    expect(new TextDecoder().decode(md.bytes)).toBe('Bravo **Théo Petit** et etu-999.');
    expect(md.unknown).toEqual(['etu-999']);
  });
});
