/**
 * Synthetic test sets for the pseudonymisation (PSEUDO-*, see
 * docs/design/pseudonymisation.md §14). Everything here is invented: people,
 * e-mails (example.org), numbers, and phone numbers in the range reserved
 * for fiction by ARCEP (06 39 98 xx xx).
 *
 * Each file comes with a manifest: the occurrences planted in it (every one
 * must be replaced), the decoys (each must stay as it is), the items that
 * must be listed "to check visually" and the parts that must be removed.
 *
 * Imported by the tests, or run alone to write the files to a folder and open
 * them in an office suite:
 *
 *   node tests/pseudo-fixtures.ts /tmp/pseudo-fixtures
 */
import { zipSync, strToU8, type Zippable } from 'fflate';
import { PDFDocument, PDFHexString, PDFName, StandardFonts } from '@pdfme/pdf-lib';

// ---------------------------------------------------------------- people

export interface FixturePerson {
  /** Short key used in the manifests. */
  key: string;
  last: string;
  first: string;
  email?: string;
  number?: string;
  /** Why this person is in the set. */
  case: string;
}

export const PEOPLE: readonly FixturePerson[] = [
  { key: 'lea', last: 'Martin', first: 'Léa', email: 'lea.martin@etu.example.org', number: '21900101', case: 'shared last name (with hugo)' },
  { key: 'hugo', last: 'Martin', first: 'Hugo', email: 'hugo.martin@etu.example.org', number: '21900102', case: 'shared last name (with lea)' },
  { key: 'jp', last: "D'Alembert", first: 'Jean-Pierre', number: '21900103', case: 'compound first name, particle with apostrophe, also a scientist' },
  { key: 'maelle', last: 'Le Gall', first: 'Maëlle', case: 'particle, diaeresis' },
  { key: 'chloe', last: 'Masse', first: 'Chloé', case: 'common word (la masse)' },
  { key: 'theo', last: 'Petit', first: 'Théo', case: 'common word (petit)' },
  { key: 'ines', last: 'Blanc', first: 'Inès', case: 'common word (blanc)' },
  { key: 'noem', last: 'Moulin', first: 'Noé', case: 'common word (moulin), shared first name (with noeb)' },
  { key: 'lucas', last: 'Force', first: 'Lucas', case: 'common word (force)' },
  { key: 'wei', last: 'Li', first: 'Wei', case: 'short last name' },
  { key: 'minh', last: 'Ng', first: 'Minh', case: 'short last name' },
  { key: 'awa', last: 'Ba', first: 'Awa', case: 'short last name' },
  { key: 'pascal', last: 'Young', first: 'Pascal', case: 'first and last names of scientists' },
  { key: 'zoe', last: 'Poisson', first: 'Zoé', case: 'scientist and common word' },
  { key: 'anais', last: 'Lefèvre', first: 'Anaïs', case: 'accents, written decomposed (NFD) in documents' },
  { key: 'noeb', last: 'Bérénger', first: 'Noé', case: 'accents, shared first name (with noem)' },
];

/** The people with pseudonyms ETU-101, ETU-102… (in list order: only for tests that need fixed pseudonyms). */
export const PEOPLE_WITH_PSEUDONYMS = PEOPLE.map((p, i) => ({
  key: p.key,
  lastName: p.last,
  firstName: p.first,
  ...(p.email ? { email: p.email } : {}),
  ...(p.number ? { number: p.number } : {}),
  pseudonym: `ETU-${101 + i}`,
}));

export const PHONE = '06 39 98 00 01';
export const PHONE_INTL = '+33 6 39 98 00 02';
export const INE = '0123456789A';

const nfd = (s: string): string => s.normalize('NFD');

// ---------------------------------------------------------------- manifests

export type PlantedForm =
  | 'full-name' | 'initial' | 'last-name' | 'first-name' | 'email' | 'phone' | 'ine'
  | 'number' | 'login' | 'labelled' | 'author' | 'meta';

export interface Planted {
  /** Part of the package (or "" for a plain file). */
  part: string;
  /** The text as written in the part (before XML escaping). */
  text: string;
  form: PlantedForm;
  /** Person of PEOPLE, when the occurrence is one of them. */
  person?: string;
  note?: string;
}

export interface Decoy {
  part: string;
  text: string;
  why: string;
}

export interface Fixture {
  name: string;
  bytes: Uint8Array;
  planted: Planted[];
  decoys: Decoy[];
  /** Parts that must be listed "to check visually". */
  toCheck: string[];
  /** Parts that must be removed from the output. */
  removed: string[];
  /** People the file must be attributed to. */
  attribution: string[];
}

// ---------------------------------------------------------------- helpers

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** 1×1 transparent PNG. */
export const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0),
);

/** A binary blob holding a name in UTF-16LE, as OLE objects do. */
function utf16le(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[2 * i] = c & 0xff;
    out[2 * i + 1] = c >> 8;
  }
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

type Entries = Record<string, string | Uint8Array>;

function zip(entries: Entries, stored: readonly string[] = []): Uint8Array {
  const files: Zippable = {};
  for (const [path, data] of Object.entries(entries)) {
    files[path] = [typeof data === 'string' ? strToU8(data) : data, { level: stored.includes(path) ? 0 : 6 }];
  }
  return zipSync(files);
}

/** Windows-1252 encoding of a text (throws on a character it does not have). */
export function encodeCp1252(text: string): Uint8Array {
  const special: Record<string, number> = {
    '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, 'Œ': 0x8c, 'œ': 0x9c,
  };
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out.push(c);
    else if (special[ch] !== undefined) out.push(special[ch]);
    else throw new Error(`No Windows-1252 byte for ${ch}`);
  }
  return Uint8Array.from(out);
}

const BOM = Uint8Array.of(0xef, 0xbb, 0xbf);

// ---------------------------------------------------------------- lists (PSEUDO-004, PSEUDO-005)

function rows(sep: string, header: string[], people: readonly FixturePerson[] = PEOPLE): string {
  const lines = [header.join(sep)];
  for (const p of people) lines.push([p.last, p.first, p.email ?? '', p.number ?? ''].join(sep));
  return lines.join('\r\n') + '\r\n';
}

export interface RosterFixture {
  name: string;
  bytes: Uint8Array;
  /** Expected separator and encoding, or the reason it must be refused. */
  expect: { separator: ';' | ',' | '\t'; encoding: 'utf-8' | 'utf-8-bom' | 'windows-1252'; people: number } | { refused: string };
}

export function rosters(): RosterFixture[] {
  const n = PEOPLE.length;
  return [
    { name: 'list-semicolon-utf8.csv', bytes: strToU8(rows(';', ['nom', 'prenom', 'email', 'numero'])), expect: { separator: ';', encoding: 'utf-8', people: n } },
    { name: 'list-comma-utf8-bom.csv', bytes: concat(BOM, strToU8(rows(',', ['Nom', 'Prénom', 'E-mail', 'Numéro étudiant']))), expect: { separator: ',', encoding: 'utf-8-bom', people: n } },
    { name: 'list-tab-cp1252.csv', bytes: encodeCp1252(rows('\t', ['NOM', 'PRENOM', 'Courriel', 'N°'])), expect: { separator: '\t', encoding: 'windows-1252', people: n } },
    { name: 'list-nfd-macos.csv', bytes: strToU8(nfd(rows(';', ['nom', 'prénom', 'mail', 'numéro']))), expect: { separator: ';', encoding: 'utf-8', people: n } },
    { name: 'list-english.csv', bytes: strToU8(rows(',', ['last_name', 'first_name', 'mail', 'student_id'])), expect: { separator: ',', encoding: 'utf-8', people: n } },
    { name: 'list-missing-first-name.csv', bytes: strToU8('nom;email\r\nMartin;lea.martin@etu.example.org\r\n'), expect: { refused: 'no first name column' } },
    { name: 'list-empty.csv', bytes: strToU8('nom;prenom\r\n'), expect: { refused: 'no person' } },
    {
      name: 'list-duplicate.csv',
      bytes: strToU8('nom;prenom\r\nMartin;Léa\r\nMARTIN;Lea\r\n'),
      expect: { refused: 'the same person twice (case and accents ignored)' },
    },
    {
      // One line with a field too many: rejected and shown, the others kept.
      name: 'list-ragged.csv',
      bytes: strToU8('nom;prenom\r\nMartin;Léa\r\nPetit;Théo;extra\r\nBlanc;Inès\r\n'),
      expect: { separator: ';', encoding: 'utf-8', people: 2 },
    },
  ];
}

// ---------------------------------------------------------------- common decoys

/** Texts that must never be changed (common words, scientists, units). */
const DECOY_TEXTS: readonly [string, string][] = [
  ['La masse vaut 2 kg.', 'common word Masse'],
  ['un petit écart', 'common word Petit'],
  ['le fil blanc', 'common word Blanc'],
  ['la force de 12 N', 'common word Force'],
  ['le module de Young E = 210 GPa', 'scientist Young (exclusion)'],
  ['la loi de Poisson', 'scientist Poisson (exclusion)'],
  ['une pression de 100 Pa (pascal)', 'unit pascal'],
  ["le principe de d'Alembert", "scientist d'Alembert (exclusion)"],
  ['une batterie Li-ion', 'short name Li alone'],
  ['la référence ETU-123 du catalogue', 'text shaped like a pseudonym: warned, kept'],
];

// ---------------------------------------------------------------- DOCX (PSEUDO-018, PSEUDO-025, PSEUDO-033)

const W_NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
  'xmlns:v="urn:schemas-microsoft-com:vml"',
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"',
  'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"',
  'mc:Ignorable="w14 w15"',
].join(' ');

const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_RT = 'http://schemas.openxmlformats.org/package/2006/relationships';

const wt = (text: string): string => `<w:t xml:space="preserve">${esc(text)}</w:t>`;
const run = (text: string, rpr = ''): string => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}${wt(text)}</w:r>`;
const para = (inner: string, rsid = '00A1B2C3'): string => `<w:p w:rsidR="${rsid}" w:rsidRDefault="${rsid}">${inner}</w:p>`;
const p = (text: string): string => para(run(text));
const cell = (inner: string): string => `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
const table = (cells: string[][]): string =>
  `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${cells.map((r) => `<w:tr>${r.map((c) => cell(p(c))).join('')}</w:tr>`).join('')}</w:tbl>`;

function docxDocument(): string {
  const d = PEOPLE;
  const lea = d[0]!;
  const body = [
    // Label on the left, label above (PSEUDO-008).
    table([
      ['Nom', 'Martin Léa'],
      ['Binôme :', 'Théo Petit'],
    ]),
    table([['Rédigé par'], ['Inès Blanc']]),
    // A labelled value ends at a tab (defect 3).
    para(run('Nom : Chloé Masse') + '<w:r><w:tab/></w:r>' + run("Sujet : calcul de la masse d'une poutre")),
    para(run('Nom :') + '<w:r><w:tab/></w:r>' + run('masse volumique ρ = 7850 kg/m³')),
    // A name split across runs, with a typographic apostrophe.
    para(run('Mesures faites avec ') + run('Jean-', '<w:b/>') + run('Pierre D’Alembert') + run('.')),
    // A decomposed name split inside its combining sequence (defect 1).
    para(run(nfd('Relu par Anaïs Lefe')) + run('\u0300vre.')),
    p('Wei Li a calibré le capteur ; Minh Ng a relevé les valeurs.'),
    p('Pascal Young a rédigé la conclusion.'),
    p(`Contact : ${lea.email}, ${PHONE} ou ${PHONE_INTL}, INE ${INE}, n° ${lea.number}.`),
    p('Fichier source : C:\\Users\\hmartin\\Documents\\tp3.docx'),
    ...DECOY_TEXTS.map(([t]) => p(t)),
    // Text box: both branches of mc:AlternateContent.
    para(
      '<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">' +
        '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>' +
        '<wp:extent cx="1828800" cy="457200"/><wp:wrapNone/><wp:docPr id="10" name="Zone de texte 1"/>' +
        '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr/>' +
        `<wps:txbx><w:txbxContent>${p('Maëlle Le Gall')}</w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>` +
        `<mc:Fallback><w:pict><v:shape id="tb1" style="width:144pt;height:36pt"><v:textbox><w:txbxContent>${p('Maëlle Le Gall')}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`,
    ),
    // Fields: simple, complex, a mailto hyperlink field.
    para(`<w:fldSimple w:instr=" AUTHOR \\* MERGEFORMAT ">${run('Hugo Martin')}</w:fldSimple>`),
    para(
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> HYPERLINK "mailto:hugo.martin@etu.example.org" </w:instrText></w:r>' +
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' + run('écrire à Hugo') + '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
    ),
    // Tracked changes and their authors.
    para(
      `<w:ins w:id="1" w:author="Noé Moulin" w:date="2026-10-01T10:00:00Z">${run('Ajout de Noé Moulin.')}</w:ins>` +
        `<w:del w:id="2" w:author="Zoé Poisson" w:date="2026-10-01T10:05:00Z"><w:r><w:delText xml:space="preserve">Zoé Poisson a mesuré.</w:delText></w:r></w:del>`,
    ),
    // Comment anchor.
    para('<w:commentRangeStart w:id="0"/>' + run('Résultat principal.') + '<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>'),
    // Footnote and endnote references.
    para(run('Voir la note') + '<w:r><w:footnoteReference w:id="1"/></w:r>' + run(' et la note de fin') + '<w:r><w:endnoteReference w:id="1"/></w:r>'),
    // Picture with alternative text (to check visually).
    para(
      '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="914400" cy="914400"/>' +
        '<wp:docPr id="20" name="Photo de Lucas Force" descr="Photo de Lucas Force au banc d\'essai" title="Lucas Force"/>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image1.png" descr="Lucas Force"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
    ),
    // External hyperlink to an e-mail address.
    para(`<w:hyperlink r:id="rIdMail">${run('mon adresse')}</w:hyperlink>`),
  ].join('');
  return `${XML}<w:document ${W_NS}><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rIdH1"/><w:headerReference w:type="first" r:id="rIdH2"/><w:footerReference w:type="default" r:id="rIdF1"/><w:titlePg/></w:sectPr></w:body></w:document>`;
}

function smallXlsx(strings: string[]): Uint8Array {
  const sst = `${XML}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`;
  const sheet = `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${strings.map((_, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="s"><v>${i}</v></c></row>`).join('')}</sheetData></worksheet>`;
  return zip({
    '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    '_rels/.rels': `${XML}<Relationships xmlns="${PKG_RT}"><Relationship Id="rId1" Type="${RT}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${RT}"><sheets><sheet name="Feuil1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML}<Relationships xmlns="${PKG_RT}"><Relationship Id="rId1" Type="${RT}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${RT}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': sheet,
    'xl/sharedStrings.xml': sst,
  });
}

export function docxFixture(): Fixture {
  const ct = (part: string, type: string): string => `<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}"/>`;
  const wml = 'wordprocessingml';
  const entries: Entries = {
    '[Content_Types].xml':
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.oleObject"/>' +
      '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/><Default Extension="sigs" ContentType="application/vnd.openxmlformats-package.digital-signature-origin"/>' +
      ct('word/document.xml', `${wml}.document.main+xml`) + ct('word/header1.xml', `${wml}.header+xml`) + ct('word/header2.xml', `${wml}.header+xml`) +
      ct('word/footer1.xml', `${wml}.footer+xml`) + ct('word/footnotes.xml', `${wml}.footnotes+xml`) + ct('word/endnotes.xml', `${wml}.endnotes+xml`) +
      ct('word/comments.xml', `${wml}.comments+xml`) + ct('word/settings.xml', `${wml}.settings+xml`) +
      '<Override PartName="/word/people.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml"/>' +
      ct('word/glossary/document.xml', `${wml}.document.glossary+xml`) + ct('word/charts/chart1.xml', 'drawingml.chart+xml') +
      ct('word/diagrams/data1.xml', 'drawingml.diagramData+xml') +
      '<Override PartName="/word/diagrams/drawing1.xml" ContentType="application/vnd.ms-office.drawingml.diagramDrawing+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      ct('docProps/app.xml', 'extended-properties+xml') + ct('docProps/custom.xml', 'custom-properties+xml') +
      '<Override PartName="/customXml/item1.xml" ContentType="application/xml"/><Override PartName="/customXml/item2.xml" ContentType="application/xml"/>' +
      '<Override PartName="/_xmlsignatures/sig1.xml" ContentType="application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml"/>' +
      '</Types>',
    '_rels/.rels':
      `${XML}<Relationships xmlns="${PKG_RT}">` +
      `<Relationship Id="rId1" Type="${RT}/officeDocument" Target="word/document.xml"/>` +
      `<Relationship Id="rId2" Type="${PKG_RT}/metadata/core-properties" Target="docProps/core.xml"/>` +
      `<Relationship Id="rId3" Type="${RT}/extended-properties" Target="docProps/app.xml"/>` +
      `<Relationship Id="rId4" Type="${RT}/custom-properties" Target="docProps/custom.xml"/>` +
      `<Relationship Id="rId5" Type="${PKG_RT}/metadata/thumbnail" Target="docProps/thumbnail.jpeg"/>` +
      `<Relationship Id="rId6" Type="${PKG_RT}/digital-signature/origin" Target="_xmlsignatures/origin.sigs"/>` +
      '</Relationships>',
    '_xmlsignatures/origin.sigs': new Uint8Array(0),
    '_xmlsignatures/_rels/origin.sigs.rels': `${XML}<Relationships xmlns="${PKG_RT}"><Relationship Id="rId1" Type="${PKG_RT}/digital-signature/signature" Target="sig1.xml"/></Relationships>`,
    '_xmlsignatures/sig1.xml': `${XML}<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><KeyInfo><X509Data><X509SubjectName>CN=Léa Martin, O=Example</X509SubjectName></X509Data></KeyInfo></Signature>`,
    'docProps/core.xml':
      `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      '<dc:title>Compte rendu TP3 — Léa Martin</dc:title><dc:subject>Mesures de Théo Petit</dc:subject><dc:creator>Léa Martin</dc:creator>' +
      '<cp:keywords>Martin; rapport</cp:keywords><dc:description>Rédigé par Hugo Martin</dc:description><cp:lastModifiedBy>Hugo Martin</cp:lastModifiedBy>' +
      '<cp:category>Groupe de Inès Blanc</cp:category><cp:contentStatus>Relu par Noé Moulin</cp:contentStatus>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">2026-10-01T08:00:00Z</dcterms:created></cp:coreProperties>',
    'docProps/app.xml':
      `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
      '<Template>Normal.dotm</Template><Company>Atelier Martin &amp; Fils</Company><Manager>Jean-Pierre D\'Alembert</Manager>' +
      '<HyperlinkBase>file:///C:/Users/hmartin/Documents/</HyperlinkBase>' +
      '<TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Compte rendu — Léa Martin</vt:lpstr></vt:vector></TitlesOfParts></Properties>',
    'docProps/custom.xml':
      `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
      '<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="Auteur"><vt:lpwstr>MASSE, Chloé</vt:lpwstr></property>' +
      '<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="Relecteur"><vt:lpwstr>Le Gall M.</vt:lpwstr></property></Properties>',
    'docProps/thumbnail.jpeg': concat(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0), strToU8('JFIF thumbnail of the first page: Léa Martin'), Uint8Array.of(0xff, 0xd9)),
    'word/document.xml': docxDocument(),
    'word/_rels/document.xml.rels':
      `${XML}<Relationships xmlns="${PKG_RT}">` +
      `<Relationship Id="rIdH1" Type="${RT}/header" Target="header1.xml"/><Relationship Id="rIdH2" Type="${RT}/header" Target="header2.xml"/>` +
      `<Relationship Id="rIdF1" Type="${RT}/footer" Target="footer1.xml"/><Relationship Id="rIdFn" Type="${RT}/footnotes" Target="footnotes.xml"/>` +
      `<Relationship Id="rIdEn" Type="${RT}/endnotes" Target="endnotes.xml"/><Relationship Id="rIdCm" Type="${RT}/comments" Target="comments.xml"/>` +
      `<Relationship Id="rIdSt" Type="${RT}/settings" Target="settings.xml"/><Relationship Id="rIdPp" Type="http://schemas.microsoft.com/office/2011/relationships/people" Target="people.xml"/>` +
      `<Relationship Id="rIdImg" Type="${RT}/image" Target="media/image1.png"/>` +
      `<Relationship Id="rIdMail" Type="${RT}/hyperlink" Target="mailto:lea.martin@etu.example.org" TargetMode="External"/>` +
      `<Relationship Id="rIdGl" Type="${RT}/glossaryDocument" Target="glossary/document.xml"/>` +
      `<Relationship Id="rIdCh" Type="${RT}/chart" Target="charts/chart1.xml"/>` +
      `<Relationship Id="rIdDg" Type="${RT}/diagramData" Target="diagrams/data1.xml"/>` +
      `<Relationship Id="rIdOle" Type="${RT}/oleObject" Target="embeddings/oleObject1.bin"/>` +
      `<Relationship Id="rIdCx1" Type="${RT}/customXml" Target="../customXml/item1.xml"/><Relationship Id="rIdCx2" Type="${RT}/customXml" Target="../customXml/item2.xml"/>` +
      '</Relationships>',
    'word/header1.xml': `${XML}<w:hdr ${W_NS}>${p('Léa MARTIN — TP3')}</w:hdr>`,
    'word/header2.xml': `${XML}<w:hdr ${W_NS}>${p('Martin Léa (première page)')}</w:hdr>`,
    'word/footer1.xml': `${XML}<w:ftr ${W_NS}>${p('L. Martin — page')}</w:ftr>`,
    'word/footnotes.xml': `${XML}<w:footnotes ${W_NS}><w:footnote w:type="separator" w:id="-1">${p('')}</w:footnote><w:footnote w:id="1">${p('Awa Ba a fait les mesures.')}</w:footnote></w:footnotes>`,
    'word/endnotes.xml': `${XML}<w:endnotes ${W_NS}><w:endnote w:type="separator" w:id="-1">${p('')}</w:endnote><w:endnote w:id="1">${p('Merci à Minh Ng.')}</w:endnote></w:endnotes>`,
    'word/comments.xml': `${XML}<w:comments ${W_NS}><w:comment w:id="0" w:author="Hugo Martin" w:date="2026-10-02T09:00:00Z" w:initials="HM">${p('Revu par Noé Bérénger')}</w:comment></w:comments>`,
    'word/people.xml': `${XML}<w15:people ${W_NS}><w15:person w15:author="Hugo Martin"><w15:presenceInfo w15:providerId="AD" w15:userId="S::hugo.martin@etu.example.org::0f0e0d0c"/></w15:person></w15:people>`,
    'word/settings.xml':
      `${XML}<w:settings ${W_NS}><w:attachedTemplate r:id="rIdTpl"/><w:docVars><w:docVar w:name="auteur" w:val="Théo Petit"/></w:docVars>` +
      '<w:rsids><w:rsidRoot w:val="00A1B2C3"/><w:rsid w:val="00A1B2C3"/><w:rsid w:val="00D4E5F6"/></w:rsids><w15:docId w15:val="{11111111-2222-3333-4444-555555555555}"/></w:settings>',
    'word/_rels/settings.xml.rels': `${XML}<Relationships xmlns="${PKG_RT}"><Relationship Id="rIdTpl" Type="${RT}/attachedTemplate" Target="file:///C:/Users/hmartin/AppData/Roaming/Microsoft/Templates/Rapport.dotm" TargetMode="External"/></Relationships>`,
    'word/glossary/document.xml': `${XML}<w:glossaryDocument ${W_NS}><w:docParts><w:docPart><w:docPartPr><w:name w:val="Signature"/></w:docPartPr><w:docPartBody>${p('Signature : Inès Blanc')}</w:docPartBody></w:docPart></w:docParts></w:glossaryDocument>`,
    'word/charts/chart1.xml':
      `${XML}<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${RT}">` +
      '<c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>Mesures de Wei Li</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:ser><c:idx val="0"/><c:order val="0"/>' +
      '<c:cat><c:strRef><c:f>Feuil1!$A$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Awa Ba</c:v></c:pt></c:strCache></c:strRef></c:cat></c:ser></c:barChart></c:plotArea></c:chart>' +
      '<c:externalData r:id="rIdWb"/></c:chartSpace>',
    'word/charts/_rels/chart1.xml.rels': `${XML}<Relationships xmlns="${PKG_RT}"><Relationship Id="rIdWb" Type="${RT}/package" Target="../embeddings/Microsoft_Excel_Worksheet.xlsx"/></Relationships>`,
    'word/embeddings/Microsoft_Excel_Worksheet.xlsx': smallXlsx(['Awa Ba', 'masse (kg)']),
    'word/embeddings/oleObject1.bin': concat(Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0), utf16le('Auteur: Hugo Martin')),
    'word/diagrams/data1.xml': `${XML}<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dgm:ptLst><dgm:pt modelId="1"><dgm:t><a:bodyPr/><a:p><a:r><a:t>Chloé Masse</a:t></a:r></a:p></dgm:t></dgm:pt></dgm:ptLst></dgm:dataModel>`,
    'word/diagrams/drawing1.xml': `${XML}<dsp:drawing xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dsp:spTree><dsp:sp><dsp:txBody><a:bodyPr/><a:p><a:r><a:t>Chloé Masse</a:t></a:r></a:p></dsp:txBody></dsp:sp></dsp:spTree></dsp:drawing>`,
    'word/media/image1.png': PNG_1PX,
    'customXml/item1.xml': `${XML}<b:Sources xmlns:b="http://schemas.openxmlformats.org/officeDocument/2006/bibliography"><b:Source><b:Tag>Poi1811</b:Tag><b:Author><b:Author><b:NameList><b:Person><b:Last>Poisson</b:Last><b:First>Siméon Denis</b:First></b:Person></b:NameList></b:Author></b:Author><b:Title>Traité de mécanique</b:Title></b:Source></b:Sources>`,
    'customXml/item2.xml': `${XML}<rapport xmlns="urn:example:rapport"><auteur>Moulin Noé</auteur><courriel>lea.martin@etu.example.org</courriel></rapport>`,
  };
  const D = 'word/document.xml';
  const planted: Planted[] = [
    { part: D, text: 'Martin Léa', form: 'labelled', person: 'lea', note: 'label on the left' },
    { part: D, text: 'Théo Petit', form: 'labelled', person: 'theo', note: 'label "Binôme :" on the left' },
    { part: D, text: 'Inès Blanc', form: 'labelled', person: 'ines', note: 'label above' },
    { part: D, text: 'Chloé Masse', form: 'labelled', person: 'chloe', note: 'ends at the tab' },
    { part: D, text: 'Jean-Pierre D’Alembert', form: 'full-name', person: 'jp', note: 'split across runs, typographic apostrophe' },
    { part: D, text: nfd('Anaïs Lefèvre'), form: 'full-name', person: 'anais', note: 'NFD, split inside a combining sequence' },
    { part: D, text: 'Wei Li', form: 'full-name', person: 'wei' },
    { part: D, text: 'Minh Ng', form: 'full-name', person: 'minh' },
    { part: D, text: 'Pascal Young', form: 'full-name', person: 'pascal' },
    { part: D, text: 'lea.martin@etu.example.org', form: 'email', person: 'lea' },
    { part: D, text: PHONE, form: 'phone' },
    { part: D, text: PHONE_INTL, form: 'phone' },
    { part: D, text: INE, form: 'ine' },
    { part: D, text: '21900101', form: 'number', person: 'lea' },
    { part: D, text: 'hmartin', form: 'login', note: 'C:\\Users\\… path' },
    { part: D, text: 'Maëlle Le Gall', form: 'full-name', person: 'maelle', note: 'text box, mc:Choice and mc:Fallback (twice)' },
    { part: D, text: 'Hugo Martin', form: 'full-name', person: 'hugo', note: 'AUTHOR field result' },
    { part: D, text: 'hugo.martin@etu.example.org', form: 'email', person: 'hugo', note: 'w:instrText of a HYPERLINK field' },
    { part: D, text: 'Noé Moulin', form: 'author', person: 'noem', note: 'w:ins@w:author and inserted text' },
    { part: D, text: 'Zoé Poisson', form: 'author', person: 'zoe', note: 'w:del@w:author and w:delText' },
    { part: D, text: 'Lucas Force', form: 'meta', person: 'lucas', note: 'wp:docPr@name/@descr/@title, pic:cNvPr@descr' },
    { part: 'word/_rels/document.xml.rels', text: 'mailto:lea.martin@etu.example.org', form: 'email', person: 'lea' },
    { part: 'word/header1.xml', text: 'Léa MARTIN', form: 'full-name', person: 'lea' },
    { part: 'word/header2.xml', text: 'Martin Léa', form: 'full-name', person: 'lea', note: 'first-page header' },
    { part: 'word/footer1.xml', text: 'L. Martin', form: 'initial', person: 'lea' },
    { part: 'word/footnotes.xml', text: 'Awa Ba', form: 'full-name', person: 'awa' },
    { part: 'word/endnotes.xml', text: 'Minh Ng', form: 'full-name', person: 'minh' },
    { part: 'word/comments.xml', text: 'Hugo Martin', form: 'author', person: 'hugo', note: 'w:author, w:initials="HM"' },
    { part: 'word/comments.xml', text: 'Noé Bérénger', form: 'full-name', person: 'noeb' },
    { part: 'word/people.xml', text: 'Hugo Martin', form: 'author', person: 'hugo' },
    { part: 'word/people.xml', text: 'hugo.martin@etu.example.org', form: 'email', person: 'hugo', note: 'w15:userId' },
    { part: 'word/settings.xml', text: 'Théo Petit', form: 'meta', person: 'theo', note: 'w:docVar' },
    { part: 'word/_rels/settings.xml.rels', text: 'hmartin', form: 'login', note: 'attached template path' },
    { part: 'word/glossary/document.xml', text: 'Inès Blanc', form: 'labelled', person: 'ines' },
    { part: 'word/charts/chart1.xml', text: 'Wei Li', form: 'full-name', person: 'wei', note: 'chart title' },
    { part: 'word/charts/chart1.xml', text: 'Awa Ba', form: 'full-name', person: 'awa', note: 'c:strCache' },
    { part: 'word/embeddings/Microsoft_Excel_Worksheet.xlsx', text: 'Awa Ba', form: 'full-name', person: 'awa', note: 'nested package, xl/sharedStrings.xml' },
    { part: 'word/diagrams/data1.xml', text: 'Chloé Masse', form: 'full-name', person: 'chloe' },
    { part: 'word/diagrams/drawing1.xml', text: 'Chloé Masse', form: 'full-name', person: 'chloe' },
    { part: 'customXml/item2.xml', text: 'Moulin Noé', form: 'full-name', person: 'noem' },
    { part: 'customXml/item2.xml', text: 'lea.martin@etu.example.org', form: 'email', person: 'lea' },
    { part: 'docProps/core.xml', text: 'Léa Martin', form: 'author', person: 'lea', note: 'dc:creator and dc:title' },
    { part: 'docProps/core.xml', text: 'Hugo Martin', form: 'author', person: 'hugo', note: 'cp:lastModifiedBy and dc:description' },
    { part: 'docProps/core.xml', text: 'Théo Petit', form: 'meta', person: 'theo' },
    { part: 'docProps/core.xml', text: 'Inès Blanc', form: 'meta', person: 'ines' },
    { part: 'docProps/core.xml', text: 'Noé Moulin', form: 'meta', person: 'noem' },
    { part: 'docProps/core.xml', text: 'Martin', form: 'last-name', note: 'cp:keywords: shared last name, common marker' },
    { part: 'docProps/app.xml', text: "Jean-Pierre D'Alembert", form: 'meta', person: 'jp', note: 'Manager' },
    { part: 'docProps/app.xml', text: 'Léa Martin', form: 'meta', person: 'lea', note: 'TitlesOfParts' },
    { part: 'docProps/app.xml', text: 'hmartin', form: 'login', note: 'HyperlinkBase' },
    { part: 'docProps/custom.xml', text: 'MASSE, Chloé', form: 'meta', person: 'chloe' },
    { part: 'docProps/custom.xml', text: 'Le Gall M.', form: 'initial', person: 'maelle' },
  ];
  const decoys: Decoy[] = [
    ...DECOY_TEXTS.map(([text, why]) => ({ part: D, text, why })),
    { part: D, text: "calcul de la masse d'une poutre", why: 'after the tab that ends the labelled value' },
    { part: D, text: 'masse volumique ρ = 7850 kg/m³', why: 'after "Nom :" and a tab: not names, listed to check' },
    { part: 'customXml/item1.xml', text: 'Poisson', why: 'cited scientist (other first name): a mention, not a residue' },
    { part: 'word/embeddings/Microsoft_Excel_Worksheet.xlsx', text: 'masse (kg)', why: 'common word in a nested package' },
  ];
  return {
    name: 'report.docx',
    bytes: zip(entries),
    planted,
    decoys,
    toCheck: ['word/media/image1.png', 'word/embeddings/oleObject1.bin'],
    removed: ['docProps/thumbnail.jpeg', '_xmlsignatures/sig1.xml', '_xmlsignatures/origin.sigs', '_xmlsignatures/_rels/origin.sigs.rels'],
    attribution: ['lea', 'theo'],
  };
}

// ---------------------------------------------------------------- OpenDocument (PSEUDO-019)

const ODF_NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
  'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"',
  'xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"',
  'office:version="1.3"',
].join(' ');

const tp = (inner: string): string => `<text:p>${inner}</text:p>`;
const tx = (s: string): string => esc(s);

function odfPackage(mimetype: string, content: string, styles: string, extra: Entries, manifestExtra: string[]): Uint8Array {
  const files = ['content.xml', 'styles.xml', 'meta.xml', 'settings.xml', ...manifestExtra];
  const manifest =
    `${XML}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">` +
    `<manifest:file-entry manifest:full-path="/" manifest:media-type="${mimetype}"/>` +
    files.map((f) => `<manifest:file-entry manifest:full-path="${f}" manifest:media-type="${f.endsWith('.png') ? 'image/png' : f.endsWith('/') ? 'application/vnd.oasis.opendocument.chart' : 'text/xml'}"/>`).join('') +
    '</manifest:manifest>';
  const meta =
    `${XML}<office:document-meta ${ODF_NS}><office:meta><meta:generator>Example/1.0</meta:generator>` +
    '<dc:title>Rapport de Léa Martin</dc:title><dc:subject>TP3</dc:subject><dc:description>Rédigé par Hugo Martin</dc:description>' +
    '<meta:keyword>Martin</meta:keyword><meta:initial-creator>Léa Martin</meta:initial-creator><dc:creator>Hugo Martin</dc:creator>' +
    '<meta:printed-by>Théo Petit</meta:printed-by><meta:user-defined meta:name="Auteur">Chloé Masse</meta:user-defined>' +
    '</office:meta></office:document-meta>';
  const settings =
    `${XML}<office:document-settings ${ODF_NS}><office:settings><config:config-item-set config:name="ooo:configuration-settings">` +
    '<config:config-item config:name="PrinterName" config:type="string">Imprimante de Hugo Martin</config:config-item>' +
    `<config:config-item config:name="PrinterSetup" config:type="base64Binary">${btoa('printer of hmartin')}</config:config-item>` +
    '</config:config-item-set></office:settings></office:document-settings>';
  return zip(
    {
      mimetype,
      'META-INF/manifest.xml': manifest,
      'content.xml': content,
      'styles.xml': styles,
      'meta.xml': meta,
      'settings.xml': settings,
      'Thumbnails/thumbnail.png': PNG_1PX,
      'META-INF/documentsignatures.xml': `${XML}<document-signatures xmlns="urn:oasis:names:tc:opendocument:xmlns:digitalsignature:1.0"><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><KeyInfo><X509Data><X509SubjectName>CN=Léa Martin</X509SubjectName></X509Data></KeyInfo></Signature></document-signatures>`,
      ...extra,
    },
    ['mimetype'],
  );
}

const ODF_META_PLANTED: Planted[] = [
  { part: 'meta.xml', text: 'Léa Martin', form: 'author', person: 'lea', note: 'meta:initial-creator, dc:title' },
  { part: 'meta.xml', text: 'Hugo Martin', form: 'author', person: 'hugo', note: 'dc:creator, dc:description' },
  { part: 'meta.xml', text: 'Théo Petit', form: 'meta', person: 'theo', note: 'meta:printed-by' },
  { part: 'meta.xml', text: 'Chloé Masse', form: 'meta', person: 'chloe', note: 'meta:user-defined' },
  { part: 'meta.xml', text: 'Martin', form: 'last-name', note: 'meta:keyword: shared last name' },
  { part: 'settings.xml', text: 'Hugo Martin', form: 'meta', person: 'hugo', note: 'PrinterName' },
];
const ODF_REMOVED = ['Thumbnails/thumbnail.png', 'META-INF/documentsignatures.xml'];

export function odtFixture(): Fixture {
  const lea = PEOPLE[0]!;
  const body = [
    `<table:table table:name="Cartouche"><table:table-column table:number-columns-repeated="2"/>` +
      `<table:table-row><table:table-cell>${tp('Nom')}</table:table-cell><table:table-cell>${tp('Martin Léa')}</table:table-cell></table:table-row>` +
      `<table:table-row><table:table-cell>${tp('Binôme :')}</table:table-cell><table:table-cell>${tp('Théo Petit')}</table:table-cell></table:table-row></table:table>`,
    `<table:table table:name="Auteurs"><table:table-column/><table:table-row><table:table-cell>${tp('Rédigé par')}</table:table-cell></table:table-row>` +
      `<table:table-row><table:table-cell>${tp('Inès Blanc')}</table:table-cell></table:table-row></table:table>`,
    tp(`Nom : Chloé Masse<text:tab/>Sujet : calcul de la masse d'une poutre`),
    tp('Mesures faites avec <text:span text:style-name="T1">Jean-</text:span>Pierre D’Alembert.'),
    tp(tx(nfd('Relu par Anaïs Lefèvre.'))),
    tp('Wei<text:s/>Li a calibré le capteur.'),
    tp(`Contact : ${lea.email}, ${PHONE}, INE ${INE}.`),
    tp('Chemin : /home/hmartin/tp3.odt'),
    ...DECOY_TEXTS.map(([t]) => tp(tx(t))),
    tp(`Voir la note<text:note text:id="ftn1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body>${tp('Awa Ba a fait les mesures.')}</text:note-body></text:note>` +
      ` et la note de fin<text:note text:id="edn1" text:note-class="endnote"><text:note-citation>i</text:note-citation><text:note-body>${tp('Merci à Minh Ng.')}</text:note-body></text:note>.`),
    tp(`Résultat<office:annotation><dc:creator>Hugo Martin</dc:creator><dc:date>2026-10-02T09:00:00</dc:date><meta:creator-initials>HM</meta:creator-initials>${tp('Revu par Noé Bérénger')}</office:annotation> principal.`),
    tp('Auteur : <text:author-name text:fixed="true">Léa Martin</text:author-name>, <text:sender-email text:fixed="true">lea.martin@etu.example.org</text:sender-email>, ' +
      '<text:sender-firstname text:fixed="true">Léa</text:sender-firstname> <text:sender-lastname text:fixed="true">Martin</text:sender-lastname>.'),
    tp(`<draw:frame draw:name="Photo de Lucas Force" svg:width="2cm" svg:height="2cm"><draw:image xlink:href="Pictures/image1.png" xlink:type="simple"/><svg:title>Lucas Force</svg:title><svg:desc>Photo de Lucas Force au banc d'essai</svg:desc></draw:frame>`),
    tp(`<draw:frame draw:name="Zone 1" svg:width="4cm" svg:height="1cm"><draw:text-box>${tp('Maëlle Le Gall')}</draw:text-box></draw:frame>`),
    tp(`<draw:frame draw:name="Objet 1" svg:width="4cm" svg:height="3cm"><draw:object xlink:href="./Object 1" xlink:type="simple"/><draw:image xlink:href="./ObjectReplacements/Object 1" xlink:type="simple"/></draw:frame>`),
    tp('<text:change-start text:change-id="ct1"/>Ajout de Noé Moulin.<text:change-end text:change-id="ct1"/>'),
  ].join('');
  const tracked =
    '<text:tracked-changes><text:changed-region text:id="ct1"><text:insertion><office:change-info><dc:creator>Noé Moulin</dc:creator><dc:date>2026-10-01T10:00:00</dc:date></office:change-info></text:insertion></text:changed-region>' +
    `<text:changed-region text:id="ct2"><text:deletion><office:change-info><dc:creator>Zoé Poisson</dc:creator><dc:date>2026-10-01T10:05:00</dc:date></office:change-info>${tp('Zoé Poisson a mesuré.')}</text:deletion></text:changed-region></text:tracked-changes>`;
  const content = `${XML}<office:document-content ${ODF_NS}><office:body><office:text>${tracked}${body}</office:text></office:body></office:document-content>`;
  const styles =
    `${XML}<office:document-styles ${ODF_NS}><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1">` +
    `<style:header>${tp('Léa MARTIN — TP3')}</style:header><style:header-left>${tp('Martin L.')}</style:header-left>` +
    `<style:header-first>${tp('Théo Petit (première page)')}</style:header-first><style:footer>${tp('L. Martin — page')}</style:footer>` +
    '</style:master-page></office:master-styles></office:document-styles>';
  const objectContent = `${XML}<office:document-content ${ODF_NS}><office:body><office:chart><table:table table:name="local-table"><table:table-row><table:table-cell office:value-type="string">${tp('Awa Ba')}</table:table-cell></table:table-row></table:table></office:chart></office:body></office:document-content>`;
  const bytes = odfPackage(
    'application/vnd.oasis.opendocument.text',
    content,
    styles,
    {
      'Pictures/image1.png': PNG_1PX,
      'Object 1/content.xml': objectContent,
      'ObjectReplacements/Object 1': concat(strToU8('preview '), utf16le('Awa Ba')),
    },
    ['Pictures/image1.png', 'Object 1/', 'Object 1/content.xml', 'ObjectReplacements/Object 1', 'Thumbnails/thumbnail.png'],
  );
  const C = 'content.xml';
  return {
    name: 'report.odt',
    bytes,
    planted: [
      { part: C, text: 'Martin Léa', form: 'labelled', person: 'lea' },
      { part: C, text: 'Théo Petit', form: 'labelled', person: 'theo' },
      { part: C, text: 'Inès Blanc', form: 'labelled', person: 'ines', note: 'label above' },
      { part: C, text: 'Chloé Masse', form: 'labelled', person: 'chloe', note: 'ends at text:tab' },
      { part: C, text: 'Jean-Pierre D’Alembert', form: 'full-name', person: 'jp', note: 'split by a span' },
      { part: C, text: nfd('Anaïs Lefèvre'), form: 'full-name', person: 'anais', note: 'NFD' },
      { part: C, text: 'Wei Li', form: 'full-name', person: 'wei', note: 'text:s between first and last name' },
      { part: C, text: 'lea.martin@etu.example.org', form: 'email', person: 'lea', note: 'body and text:sender-email' },
      { part: C, text: PHONE, form: 'phone' },
      { part: C, text: INE, form: 'ine' },
      { part: C, text: 'hmartin', form: 'login', note: '/home/… path' },
      { part: C, text: 'Awa Ba', form: 'full-name', person: 'awa', note: 'footnote' },
      { part: C, text: 'Minh Ng', form: 'full-name', person: 'minh', note: 'endnote' },
      { part: C, text: 'Hugo Martin', form: 'author', person: 'hugo', note: 'office:annotation dc:creator' },
      { part: C, text: 'Noé Bérénger', form: 'full-name', person: 'noeb', note: 'annotation text' },
      { part: C, text: 'Léa Martin', form: 'meta', person: 'lea', note: 'text:author-name, text:sender-firstname/lastname' },
      { part: C, text: 'Lucas Force', form: 'meta', person: 'lucas', note: 'draw:name, svg:title, svg:desc' },
      { part: C, text: 'Maëlle Le Gall', form: 'full-name', person: 'maelle', note: 'draw:text-box' },
      { part: C, text: 'Noé Moulin', form: 'author', person: 'noem', note: 'changed-region dc:creator and inserted text' },
      { part: C, text: 'Zoé Poisson', form: 'author', person: 'zoe', note: 'deletion dc:creator and deleted text' },
      { part: 'styles.xml', text: 'Léa MARTIN', form: 'full-name', person: 'lea', note: 'style:header' },
      { part: 'styles.xml', text: 'Martin L.', form: 'initial', person: 'lea', note: 'style:header-left' },
      { part: 'styles.xml', text: 'Théo Petit', form: 'full-name', person: 'theo', note: 'style:header-first' },
      { part: 'styles.xml', text: 'L. Martin', form: 'initial', person: 'lea', note: 'style:footer' },
      { part: 'Object 1/content.xml', text: 'Awa Ba', form: 'full-name', person: 'awa', note: 'embedded object' },
      ...ODF_META_PLANTED,
    ],
    decoys: [
      ...DECOY_TEXTS.map(([text, why]) => ({ part: C, text, why })),
      { part: C, text: "calcul de la masse d'une poutre", why: 'after the tab that ends the labelled value' },
    ],
    toCheck: ['Pictures/image1.png', 'ObjectReplacements/Object 1'],
    removed: [...ODF_REMOVED, 'settings.xml:PrinterSetup'],
    attribution: ['lea', 'theo'],
  };
}

export function odsFixture(): Fixture {
  const cellP = (s: string): string => `<table:table-cell office:value-type="string">${tp(tx(s))}</table:table-cell>`;
  const content =
    `${XML}<office:document-content ${ODF_NS}><office:body><office:spreadsheet>` +
    '<table:table table:name="Martin Léa"><table:table-row>' + cellP('Nom') + cellP('Théo Petit') + '</table:table-row>' +
    '<table:table-row>' + cellP('masse (kg)') + '<table:table-cell office:value-type="float" office:value="2"><text:p>2</text:p></table:table-cell></table:table-row>' +
    '<table:table-row><table:table-cell office:value-type="string"><office:annotation><dc:creator>Hugo Martin</dc:creator>' + tp('Vu par Inès Blanc') + '</office:annotation>' + tp('mesure') + '</table:table-cell></table:table-row>' +
    '</table:table><table:named-expressions><table:named-range table:name="Notes" table:base-cell-address="$\'Martin Léa\'.$A$1" table:cell-range-address="$\'Martin Léa\'.$A$1:.$B$3"/></table:named-expressions>' +
    '</office:spreadsheet></office:body></office:document-content>';
  const styles = `${XML}<office:document-styles ${ODF_NS}><office:master-styles><style:master-page style:name="Default"><style:header>${tp('Léa Martin')}</style:header></style:master-page></office:master-styles></office:document-styles>`;
  return {
    name: 'grid.ods',
    bytes: odfPackage('application/vnd.oasis.opendocument.spreadsheet', content, styles, {}, ['Thumbnails/thumbnail.png']),
    planted: [
      { part: 'content.xml', text: 'Martin Léa', form: 'full-name', person: 'lea', note: 'sheet name and named range references' },
      { part: 'content.xml', text: 'Théo Petit', form: 'labelled', person: 'theo', note: 'cell to the right of "Nom"' },
      { part: 'content.xml', text: 'Hugo Martin', form: 'author', person: 'hugo', note: 'annotation' },
      { part: 'content.xml', text: 'Inès Blanc', form: 'full-name', person: 'ines', note: 'annotation text' },
      { part: 'styles.xml', text: 'Léa Martin', form: 'full-name', person: 'lea' },
      ...ODF_META_PLANTED,
    ],
    decoys: [{ part: 'content.xml', text: 'masse (kg)', why: 'common word' }],
    toCheck: [],
    removed: ODF_REMOVED,
    attribution: ['lea'],
  };
}

export function odpFixture(): Fixture {
  const content =
    `${XML}<office:document-content ${ODF_NS}><office:body><office:presentation>` +
    '<draw:page draw:name="Diapo de Maëlle Le Gall" draw:master-page-name="Default">' +
    `<draw:frame draw:name="Titre" svg:width="20cm" svg:height="3cm"><draw:text-box>${tp('Présenté par Maëlle Le Gall')}</draw:text-box></draw:frame>` +
    `<draw:frame draw:name="Photo de Lucas Force" svg:width="5cm" svg:height="5cm"><draw:image xlink:href="Pictures/image1.png" xlink:type="simple"/><svg:desc>Lucas Force</svg:desc></draw:frame>` +
    `<presentation:notes><draw:frame svg:width="20cm" svg:height="10cm"><draw:text-box>${tp('Notes : Inès Blanc')}</draw:text-box></draw:frame></presentation:notes>` +
    '</draw:page></office:presentation></office:body></office:document-content>';
  const styles = `${XML}<office:document-styles ${ODF_NS}><office:master-styles><style:master-page style:name="Default"><draw:frame presentation:class="footer"><draw:text-box>${tp('Léa Martin')}</draw:text-box></draw:frame></style:master-page></office:master-styles></office:document-styles>`;
  return {
    name: 'talk.odp',
    bytes: odfPackage('application/vnd.oasis.opendocument.presentation', content, styles, { 'Pictures/image1.png': PNG_1PX }, ['Pictures/image1.png', 'Thumbnails/thumbnail.png']),
    planted: [
      { part: 'content.xml', text: 'Maëlle Le Gall', form: 'labelled', person: 'maelle', note: 'draw:page@draw:name and "Présenté par"' },
      { part: 'content.xml', text: 'Lucas Force', form: 'meta', person: 'lucas', note: 'draw:name, svg:desc' },
      { part: 'content.xml', text: 'Inès Blanc', form: 'full-name', person: 'ines', note: 'presentation:notes' },
      { part: 'styles.xml', text: 'Léa Martin', form: 'full-name', person: 'lea', note: 'footer of the master page' },
      ...ODF_META_PLANTED,
    ],
    decoys: [],
    toCheck: ['Pictures/image1.png'],
    removed: ODF_REMOVED,
    attribution: ['maelle'],
  };
}

// ---------------------------------------------------------------- XLSX (PSEUDO-020)

const SML = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

export function xlsxFixture(): Fixture {
  const strings = ['Nom', 'Chloé Masse', 'masse (kg)', 'Young (GPa)'];
  const sst =
    `${XML}<sst xmlns="${SML}" count="5" uniqueCount="5">${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}` +
    '<si><r><rPr><b/></rPr><t>Jean-</t></r><r><t xml:space="preserve">Pierre D\'Alembert</t></r></si></sst>';
  const sheet =
    `${XML}<worksheet xmlns="${SML}" xmlns:r="${RT}"><sheetData>` +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
    '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>2</v></c></row>' +
    '<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>210</v></c></row>' +
    '<row r="4"><c r="A4" t="inlineStr"><is><t>Awa Ba</t></is></c><c r="B4" t="s"><v>4</v></c></row>' +
    '<row r="5"><c r="A5" t="str"><f>IF(B1="Inès Blanc","oui","non")</f><v>non</v></c><c r="B5"><f>\'Martin Léa\'!B2*2</f><v>4</v></c></row>' +
    '</sheetData><dataValidations count="1"><dataValidation type="list" sqref="C1" promptTitle="Saisie" prompt="Choisir Noé Moulin ou un autre"><formula1>"a,b"</formula1></dataValidation></dataValidations>' +
    '<headerFooter><oddHeader>&amp;L Léa Martin&amp;R TP3</oddHeader></headerFooter><legacyDrawing r:id="rIdVml"/></worksheet>';
  const entries: Entries = {
    '[Content_Types].xml':
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>` +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>' +
      '<Override PartName="/xl/threadedComments/threadedComment1.xml" ContentType="application/vnd.ms-excel.threadedcomments+xml"/>' +
      '<Override PartName="/xl/persons/person.xml" ContentType="application/vnd.ms-excel.person+xml"/>' +
      '<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>' +
      '<Override PartName="/xl/pivotCache/pivotCacheDefinition1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"/>' +
      '<Override PartName="/xl/pivotCache/pivotCacheRecords1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
    '_rels/.rels': `${XML}<Relationships xmlns="${PKG_RT}"><Relationship Id="rId1" Type="${RT}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="${PKG_RT}/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'docProps/core.xml': `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Léa Martin</dc:creator><cp:lastModifiedBy>Hugo Martin</cp:lastModifiedBy></cp:coreProperties>`,
    'xl/workbook.xml':
      `${XML}<workbook xmlns="${SML}" xmlns:r="${RT}"><fileSharing userName="Hugo Martin"/><sheets><sheet name="Martin Léa" sheetId="1" r:id="rId1"/><sheet name="Mesures" sheetId="2" r:id="rId2"/></sheets>` +
      '<definedNames><definedName name="Resultat">\'Martin Léa\'!$B$2</definedName></definedNames><pivotCaches><pivotCache cacheId="1" r:id="rIdPc"/></pivotCaches></workbook>',
    'xl/_rels/workbook.xml.rels':
      `${XML}<Relationships xmlns="${PKG_RT}"><Relationship Id="rId1" Type="${RT}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${RT}/worksheet" Target="worksheets/sheet2.xml"/>` +
      `<Relationship Id="rId3" Type="${RT}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rIdPc" Type="${RT}/pivotCacheDefinition" Target="pivotCache/pivotCacheDefinition1.xml"/>` +
      `<Relationship Id="rIdPs" Type="http://schemas.microsoft.com/office/2017/10/relationships/person" Target="persons/person.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': sheet,
    'xl/worksheets/_rels/sheet1.xml.rels':
      `${XML}<Relationships xmlns="${PKG_RT}"><Relationship Id="rIdCm" Type="${RT}/comments" Target="../comments1.xml"/><Relationship Id="rIdVml" Type="${RT}/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/>` +
      `<Relationship Id="rIdTc" Type="http://schemas.microsoft.com/office/2017/10/relationships/threadedComment" Target="../threadedComments/threadedComment1.xml"/>` +
      `<Relationship Id="rIdTb" Type="${RT}/table" Target="../tables/table1.xml"/></Relationships>`,
    'xl/worksheets/sheet2.xml': `${XML}<worksheet xmlns="${SML}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>valeur</t></is></c></row></sheetData></worksheet>`,
    'xl/sharedStrings.xml': sst,
    'xl/comments1.xml': `${XML}<comments xmlns="${SML}"><authors><author>Hugo Martin</author></authors><commentList><comment ref="B1" authorId="0"><text><r><t>Vu par Zoé Poisson</t></r></text></comment></commentList></comments>`,
    'xl/drawings/vmlDrawing1.vml': '<xml xmlns:v="urn:schemas-microsoft-com:vml"><v:shape id="c1"><v:textbox><div>Hugo Martin:</div></v:textbox></v:shape></xml>',
    'xl/threadedComments/threadedComment1.xml': `${XML}<ThreadedComments xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"><threadedComment ref="B2" dT="2026-10-02T09:00:00" personId="{AAAA0000-0000-0000-0000-000000000001}" id="{BBBB0000-0000-0000-0000-000000000001}"><text>Relu par Noé Bérénger</text></threadedComment></ThreadedComments>`,
    'xl/persons/person.xml': `${XML}<personList xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"><person displayName="Hugo Martin" id="{AAAA0000-0000-0000-0000-000000000001}" userId="hugo.martin@etu.example.org" providerId="AD"/></personList>`,
    'xl/tables/table1.xml': `${XML}<table xmlns="${SML}" id="1" name="Tableau_Lucas_Force" displayName="Tableau_Lucas_Force" ref="A1:B2"><tableColumns count="2"><tableColumn id="1" name="Lucas Force"/><tableColumn id="2" name="Valeur"/></tableColumns></table>`,
    'xl/pivotCache/pivotCacheDefinition1.xml': `${XML}<pivotCacheDefinition xmlns="${SML}" xmlns:r="${RT}" r:id="rId1" recordCount="1"><cacheSource type="worksheet"><worksheetSource ref="A1:B4" sheet="Martin Léa"/></cacheSource><cacheFields count="1"><cacheField name="Nom" numFmtId="0"><sharedItems><s v="Wei Li"/></sharedItems></cacheField></cacheFields></pivotCacheDefinition>`,
    'xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels': `${XML}<Relationships xmlns="${PKG_RT}"><Relationship Id="rId1" Type="${RT}/pivotCacheRecords" Target="pivotCacheRecords1.xml"/></Relationships>`,
    'xl/pivotCache/pivotCacheRecords1.xml': `${XML}<pivotCacheRecords xmlns="${SML}" count="1"><r><s v="Wei Li"/></r></pivotCacheRecords>`,
  };
  return {
    name: 'grades.xlsx',
    bytes: zip(entries),
    planted: [
      { part: 'xl/sharedStrings.xml', text: 'Chloé Masse', form: 'labelled', person: 'chloe', note: 'cell to the right of "Nom"' },
      { part: 'xl/sharedStrings.xml', text: "Jean-Pierre D'Alembert", form: 'full-name', person: 'jp', note: 'rich text split in two runs' },
      { part: 'xl/worksheets/sheet1.xml', text: 'Awa Ba', form: 'full-name', person: 'awa', note: 'inline string' },
      { part: 'xl/worksheets/sheet1.xml', text: 'Inès Blanc', form: 'full-name', person: 'ines', note: 'string literal in a formula' },
      { part: 'xl/worksheets/sheet1.xml', text: 'Martin Léa', form: 'full-name', person: 'lea', note: 'sheet reference in a formula' },
      { part: 'xl/worksheets/sheet1.xml', text: 'Noé Moulin', form: 'full-name', person: 'noem', note: 'data validation prompt' },
      { part: 'xl/worksheets/sheet1.xml', text: 'Léa Martin', form: 'full-name', person: 'lea', note: 'headerFooter' },
      { part: 'xl/workbook.xml', text: 'Martin Léa', form: 'full-name', person: 'lea', note: 'sheet name and defined name' },
      { part: 'xl/workbook.xml', text: 'Hugo Martin', form: 'author', person: 'hugo', note: 'fileSharing@userName' },
      { part: 'xl/comments1.xml', text: 'Hugo Martin', form: 'author', person: 'hugo' },
      { part: 'xl/comments1.xml', text: 'Zoé Poisson', form: 'full-name', person: 'zoe' },
      { part: 'xl/drawings/vmlDrawing1.vml', text: 'Hugo Martin', form: 'author', person: 'hugo', note: 'VML comment box' },
      { part: 'xl/threadedComments/threadedComment1.xml', text: 'Noé Bérénger', form: 'full-name', person: 'noeb' },
      { part: 'xl/persons/person.xml', text: 'Hugo Martin', form: 'author', person: 'hugo' },
      { part: 'xl/persons/person.xml', text: 'hugo.martin@etu.example.org', form: 'email', person: 'hugo' },
      { part: 'xl/tables/table1.xml', text: 'Lucas Force', form: 'full-name', person: 'lucas', note: 'column name; table name Tableau_Lucas_Force' },
      { part: 'xl/pivotCache/pivotCacheDefinition1.xml', text: 'Wei Li', form: 'full-name', person: 'wei', note: 'and the sheet name of the source' },
      { part: 'xl/pivotCache/pivotCacheRecords1.xml', text: 'Wei Li', form: 'full-name', person: 'wei' },
      { part: 'docProps/core.xml', text: 'Léa Martin', form: 'author', person: 'lea' },
      { part: 'docProps/core.xml', text: 'Hugo Martin', form: 'author', person: 'hugo' },
    ],
    decoys: [
      { part: 'xl/sharedStrings.xml', text: 'masse (kg)', why: 'common word' },
      { part: 'xl/sharedStrings.xml', text: 'Young (GPa)', why: 'scientist' },
    ],
    toCheck: [],
    removed: [],
    attribution: ['lea'],
  };
}

// ---------------------------------------------------------------- PPTX (PSEUDO-021)

const P_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

const sp = (id: number, name: string, text: string, descr = ''): string =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"${descr ? ` descr="${esc(descr)}"` : ''}/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>` +
  `<p:txBody><a:bodyPr/><a:p><a:r><a:t>${esc(text)}</a:t></a:r></a:p></p:txBody></p:sp>`;
const spTree = (inner: string): string => `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${inner}</p:spTree></p:cSld>`;

export function pptxFixture(): Fixture {
  const ov = (part: string, type: string): string => `<Override PartName="/${part}" ContentType="${type}"/>`;
  const pml = 'application/vnd.openxmlformats-officedocument.presentationml';
  const entries: Entries = {
    '[Content_Types].xml':
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/>` +
      ov('ppt/presentation.xml', `${pml}.presentation.main+xml`) + ov('ppt/slides/slide1.xml', `${pml}.slide+xml`) +
      ov('ppt/notesSlides/notesSlide1.xml', `${pml}.notesSlide+xml`) + ov('ppt/slideLayouts/slideLayout1.xml', `${pml}.slideLayout+xml`) +
      ov('ppt/slideMasters/slideMaster1.xml', `${pml}.slideMaster+xml`) + ov('ppt/commentAuthors.xml', `${pml}.commentAuthors+xml`) +
      ov('ppt/comments/comment1.xml', `${pml}.comments+xml`) + ov('ppt/authors.xml', 'application/vnd.ms-powerpoint.authors+xml') +
      ov('ppt/tags/tag1.xml', `${pml}.tags+xml`) + ov('docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml') + '</Types>',
    '_rels/.rels':
      `${XML}<Relationships xmlns="${PKG_RT}"><Relationship Id="rId1" Type="${RT}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="${PKG_RT}/metadata/core-properties" Target="docProps/core.xml"/>` +
      `<Relationship Id="rId3" Type="${PKG_RT}/metadata/thumbnail" Target="docProps/thumbnail.jpeg"/></Relationships>`,
    'docProps/core.xml': `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Soutenance de Maëlle Le Gall</dc:title><dc:creator>Maëlle Le Gall</dc:creator></cp:coreProperties>`,
    'docProps/thumbnail.jpeg': concat(Uint8Array.of(0xff, 0xd8), strToU8('thumbnail: Maëlle Le Gall'), Uint8Array.of(0xff, 0xd9)),
    'ppt/presentation.xml':
      `${XML}<p:presentation ${P_NS} xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdM"/></p:sldMasterIdLst>` +
      '<p:sldIdLst><p:sldId id="256" r:id="rIdS1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>' +
      '<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"><p14:sectionLst><p14:section name="Partie de Théo Petit" id="{CCCC0000-0000-0000-0000-000000000001}"><p14:sldIdLst><p14:sldId id="256"/></p14:sldIdLst></p14:section></p14:sectionLst></p:ext></p:extLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels':
      `${XML}<Relationships xmlns="${PKG_RT}"><Relationship Id="rIdM" Type="${RT}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rIdS1" Type="${RT}/slide" Target="slides/slide1.xml"/>` +
      `<Relationship Id="rIdCa" Type="${RT}/commentAuthors" Target="commentAuthors.xml"/><Relationship Id="rIdAu" Type="http://schemas.microsoft.com/office/2018/10/relationships/authors" Target="authors.xml"/></Relationships>`,
    'ppt/slides/slide1.xml': `${XML}<p:sld ${P_NS}>${spTree(sp(2, 'Titre', 'Présenté par Maëlle Le Gall') + sp(3, 'Photo de Lucas Force', 'Banc d’essai', 'Lucas Force au banc') + sp(4, 'Texte', 'La masse vaut 2 kg.'))}</p:sld>`,
    'ppt/slides/_rels/slide1.xml.rels':
      `${XML}<Relationships xmlns="${PKG_RT}"><Relationship Id="rId1" Type="${RT}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${RT}/notesSlide" Target="../notesSlides/notesSlide1.xml"/>` +
      `<Relationship Id="rId3" Type="${RT}/comments" Target="../comments/comment1.xml"/><Relationship Id="rId4" Type="${RT}/tags" Target="../tags/tag1.xml"/></Relationships>`,
    'ppt/notesSlides/notesSlide1.xml': `${XML}<p:notes ${P_NS}>${spTree(sp(2, 'Notes', 'Notes : Inès Blanc'))}</p:notes>`,
    'ppt/slideLayouts/slideLayout1.xml': `${XML}<p:sldLayout ${P_NS}>${spTree(sp(2, 'Pied de page', 'Léa Martin'))}</p:sldLayout>`,
    'ppt/slideMasters/slideMaster1.xml': `${XML}<p:sldMaster ${P_NS}>${spTree(sp(2, 'Pied de page', 'L. Martin'))}</p:sldMaster>`,
    'ppt/commentAuthors.xml': `${XML}<p:cmAuthorLst ${P_NS}><p:cmAuthor id="0" name="Hugo Martin" initials="HM" lastIdx="1" clrIdx="0"/></p:cmAuthorLst>`,
    'ppt/comments/comment1.xml': `${XML}<p:cmLst ${P_NS}><p:cm authorId="0" dt="2026-10-02T09:00:00" idx="1"><p:pos x="10" y="10"/><p:text>Revu avec Noé Moulin</p:text></p:cm></p:cmLst>`,
    'ppt/authors.xml': `${XML}<p188:authorLst xmlns:p188="http://schemas.microsoft.com/office/powerpoint/2018/8/main"><p188:author id="{DDDD0000-0000-0000-0000-000000000001}" name="Hugo Martin" initials="HM" userId="hugo.martin@etu.example.org" providerId="AD"/></p188:authorLst>`,
    'ppt/tags/tag1.xml': `${XML}<p:tagLst ${P_NS}><p:tag name="AUTEUR" val="Chloé Masse"/></p:tagLst>`,
  };
  return {
    name: 'talk.pptx',
    bytes: zip(entries),
    planted: [
      { part: 'ppt/slides/slide1.xml', text: 'Maëlle Le Gall', form: 'labelled', person: 'maelle', note: '"Présenté par"' },
      { part: 'ppt/slides/slide1.xml', text: 'Lucas Force', form: 'meta', person: 'lucas', note: 'p:cNvPr@name and @descr' },
      { part: 'ppt/notesSlides/notesSlide1.xml', text: 'Inès Blanc', form: 'labelled', person: 'ines' },
      { part: 'ppt/slideLayouts/slideLayout1.xml', text: 'Léa Martin', form: 'full-name', person: 'lea' },
      { part: 'ppt/slideMasters/slideMaster1.xml', text: 'L. Martin', form: 'initial', person: 'lea' },
      { part: 'ppt/commentAuthors.xml', text: 'Hugo Martin', form: 'author', person: 'hugo' },
      { part: 'ppt/comments/comment1.xml', text: 'Noé Moulin', form: 'full-name', person: 'noem' },
      { part: 'ppt/authors.xml', text: 'Hugo Martin', form: 'author', person: 'hugo' },
      { part: 'ppt/authors.xml', text: 'hugo.martin@etu.example.org', form: 'email', person: 'hugo' },
      { part: 'ppt/presentation.xml', text: 'Théo Petit', form: 'full-name', person: 'theo', note: 'section name' },
      { part: 'ppt/tags/tag1.xml', text: 'Chloé Masse', form: 'meta', person: 'chloe' },
      { part: 'docProps/core.xml', text: 'Maëlle Le Gall', form: 'author', person: 'maelle' },
    ],
    decoys: [{ part: 'ppt/slides/slide1.xml', text: 'La masse vaut 2 kg.', why: 'common word' }],
    toCheck: [],
    removed: ['docProps/thumbnail.jpeg'],
    attribution: ['maelle'],
  };
}

// ---------------------------------------------------------------- text files (PSEUDO-022)

export function textFixtures(): Fixture[] {
  const md =
    '---\ntitle: Compte rendu\nauthor: Léa Martin\n---\n\n# Mesures\n\nNom : Théo Petit\tSujet : la masse\n\n' +
    `Relu par ${nfd('Anaïs Lefèvre')} et J.-P. D'Alembert.\n\n` +
    '```text\nC:\\Users\\hmartin\\mesures.csv\n```\n\n' + DECOY_TEXTS.map(([t]) => `- ${t}`).join('\n') + '\n';
  const txt = '\ufeffNom\tPrénom\r\nPetit\tThéo\r\nRédigé par : Inès Blanc\r\nLe fil blanc est relié à la masse.\r\n';
  const csv = 'Nom;Note;Commentaire\r\nMartin Léa;15;bien\r\nmasse;2;unité kg\r\nAwa Ba;12;"Binôme : Minh Ng"\r\n';
  return [
    {
      name: 'notes.md',
      bytes: strToU8(md),
      planted: [
        { part: '', text: 'Léa Martin', form: 'author', person: 'lea', note: 'front matter' },
        { part: '', text: 'Théo Petit', form: 'labelled', person: 'theo', note: 'ends at the tab' },
        { part: '', text: nfd('Anaïs Lefèvre'), form: 'full-name', person: 'anais', note: 'NFD' },
        { part: '', text: "J.-P. D'Alembert", form: 'initial', person: 'jp' },
        { part: '', text: 'hmartin', form: 'login', note: 'path in a code block' },
      ],
      decoys: [...DECOY_TEXTS.map(([text, why]) => ({ part: '', text, why })), { part: '', text: 'Sujet : la masse', why: 'after the tab' }],
      toCheck: [],
      removed: [],
      attribution: ['lea', 'theo'],
    },
    {
      name: 'notes.txt',
      bytes: strToU8(txt),
      planted: [
        { part: '', text: 'Petit\tThéo', form: 'labelled', person: 'theo', note: 'header line "Nom\\tPrénom" above, byte order mark and CRLF kept' },
        { part: '', text: 'Inès Blanc', form: 'labelled', person: 'ines' },
      ],
      decoys: [{ part: '', text: 'Le fil blanc est relié à la masse.', why: 'common words Blanc, Masse' }],
      toCheck: [],
      removed: [],
      attribution: ['theo', 'ines'],
    },
    {
      name: 'marks.csv',
      bytes: strToU8(csv),
      planted: [
        { part: '', text: 'Martin Léa', form: 'labelled', person: 'lea', note: 'column "Nom"' },
        { part: '', text: 'Awa Ba', form: 'labelled', person: 'awa' },
        { part: '', text: 'Minh Ng', form: 'labelled', person: 'minh', note: 'inside a quoted cell' },
      ],
      decoys: [{ part: '', text: 'masse;2;unité kg', why: 'common word; a value never crosses a cell' }],
      toCheck: [],
      removed: [],
      attribution: [],
    },
  ];
}

// ---------------------------------------------------------------- PDF (PSEUDO-023)

export async function pdfFixture(): Promise<Fixture> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle('Compte rendu de Léa Martin');
  doc.setAuthor('Léa Martin');
  doc.setSubject('TP3');
  doc.setKeywords(['Martin', 'rapport']);
  doc.setCreator('Hugo Martin');
  doc.setProducer('Example');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  const line = (text: string, x: number, y: number): void => page.drawText(text, { x, y, size: 12, font });
  line('Nom : Léa Martin', 50, 780);
  line('Binôme : Théo Petit', 50, 760);
  // A labelled value followed, on the same baseline, by unrelated text far to the right (a "tab").
  line('Nom :', 50, 740);
  line('masse volumique 7850 kg/m3', 300, 740);
  // A name drawn as two items on one baseline.
  line('Mesures de Jean-Pierre', 50, 720);
  line("D'Alembert.", 190, 720);
  line(`Contact : ${PEOPLE[0]!.email}, ${PHONE}.`, 50, 700);
  const decoyPage = doc.addPage([595, 842]);
  DECOY_TEXTS.slice(0, 7).forEach(([t], i) => decoyPage.drawText(t, { x: 50, y: 780 - 20 * i, size: 12, font }));
  // A page that is only a picture: a scan (not processed, no OCR).
  const scan = doc.addPage([595, 842]);
  const png = await doc.embedPng(PNG_1PX);
  scan.drawImage(png, { x: 0, y: 0, width: 595, height: 842 });

  // Form field.
  const form = doc.getForm();
  const field = form.createTextField('nom');
  field.setText('Chloé Masse');
  field.addToPage(page, { x: 50, y: 640, width: 200, height: 20, font });

  const ctx = doc.context;
  // Text annotation with an author.
  const annot = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [400, 780, 420, 800],
      Contents: PDFHexString.fromText('Vu par Inès Blanc'),
      T: PDFHexString.fromText('Hugo Martin'),
    }),
  );
  const annots = page.node.Annots();
  if (annots) annots.push(annot);
  else page.node.set(PDFName.of('Annots'), ctx.obj([annot]));

  // Outline with one item.
  const outlines = ctx.nextRef();
  const item = ctx.register(ctx.obj({ Title: PDFHexString.fromText('Annexe de Wei Li'), Parent: outlines, Dest: [page.ref, 'XYZ', null, null, null] }));
  ctx.assign(outlines, ctx.obj({ Type: 'Outlines', First: item, Last: item, Count: 1 }));
  doc.catalog.set(PDFName.of('Outlines'), outlines);

  // XMP metadata.
  const xmp =
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator><rdf:Seq><rdf:li>Léa Martin</rdf:li></rdf:Seq></dc:creator></rdf:Description>' +
    '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  const meta = ctx.register(ctx.stream(xmp, { Type: 'Metadata', Subtype: 'XML' }));
  doc.catalog.set(PDFName.of('Metadata'), meta);

  // Attachment whose name holds a name.
  // Base64, not bytes: pdf-lib checks `instanceof Uint8Array`, which fails across realms (jsdom).
  await doc.attach(btoa(String.fromCharCode(...strToU8('Notes de Noé Moulin'))), 'notes-Noé-Moulin.txt', { mimeType: 'text/plain', description: 'Notes de Noé Moulin' });

  return {
    name: 'scan-and-text.pdf',
    bytes: await doc.save({ useObjectStreams: false }),
    planted: [
      { part: 'page 1', text: 'Léa Martin', form: 'labelled', person: 'lea' },
      { part: 'page 1', text: 'Théo Petit', form: 'labelled', person: 'theo' },
      { part: 'page 1', text: "Jean-Pierre D'Alembert", form: 'full-name', person: 'jp', note: 'two text items on one baseline' },
      { part: 'page 1', text: 'lea.martin@etu.example.org', form: 'email', person: 'lea' },
      { part: 'page 1', text: PHONE, form: 'phone' },
      { part: 'form field nom', text: 'Chloé Masse', form: 'labelled', person: 'chloe' },
      { part: 'annotation', text: 'Inès Blanc', form: 'full-name', person: 'ines', note: '/Contents' },
      { part: 'annotation', text: 'Hugo Martin', form: 'author', person: 'hugo', note: '/T' },
      { part: 'outline', text: 'Wei Li', form: 'full-name', person: 'wei' },
      { part: 'attachment', text: 'Noé-Moulin', form: 'full-name', person: 'noem', note: 'file name and description; content never copied' },
      { part: 'Info', text: 'Léa Martin', form: 'author', person: 'lea', note: 'not carried over' },
      { part: 'XMP', text: 'Léa Martin', form: 'author', person: 'lea', note: 'not carried over' },
    ],
    decoys: [
      ...DECOY_TEXTS.slice(0, 7).map(([text, why]) => ({ part: 'page 2', text, why })),
      { part: 'page 1', text: 'masse volumique 7850 kg/m3', why: 'far to the right of "Nom :": a tab, not names' },
    ],
    toCheck: ['page 3 (scanned page, not processed)'],
    removed: [],
    attribution: ['lea', 'theo'],
  };
}

// ---------------------------------------------------------------- packages to refuse (PSEUDO-032)

export interface HostileFixture {
  name: string;
  bytes: Uint8Array;
  reason: string;
}

function findSignature(bytes: Uint8Array, sig: number, from = 0): number {
  const b0 = sig & 0xff, b1 = (sig >> 8) & 0xff, b2 = (sig >> 16) & 0xff, b3 = sig >>> 24;
  for (let i = from; i + 3 < bytes.length; i++) {
    if (bytes[i] === b0 && bytes[i + 1] === b1 && bytes[i + 2] === b2 && bytes[i + 3] === b3) return i;
  }
  return -1;
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;

/** Patch every local and central header of a ZIP. */
function patchHeaders(bytes: Uint8Array, patch: (view: DataView, at: number, central: boolean) => void): Uint8Array {
  const out = bytes.slice();
  const view = new DataView(out.buffer);
  for (const [sig, central] of [[LOCAL, false], [CENTRAL, true]] as const) {
    for (let at = findSignature(out, sig); at >= 0; at = findSignature(out, sig, at + 4)) patch(view, at, central);
  }
  return out;
}

const minimalDocx = (documentXml: string, extra: Entries = {}): Entries => ({
  '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  '_rels/.rels': `${XML}<Relationships xmlns="${PKG_RT}"><Relationship Id="rId1" Type="${RT}/officeDocument" Target="word/document.xml"/></Relationships>`,
  'word/document.xml': documentXml,
  ...extra,
});

const plainDocument = (text: string): string => `${XML}<w:document ${W_NS}><w:body>${p(text)}</w:body></w:document>`;

export function hostilePackages(): HostileFixture[] {
  // 2 MB of spaces inside a paragraph: compressed more than 100 times.
  const bomb = zip(minimalDocx(`${XML}<w:document ${W_NS}><w:body><w:p><w:r><w:t xml:space="preserve">${' '.repeat(2 * 1024 * 1024)}</w:t></w:r></w:p></w:body></w:document>`));
  // The headers say 64 bytes, the data inflates to much more.
  const lying = patchHeaders(zip(minimalDocx(plainDocument('x'.repeat(200_000)))), (v, at, central) => {
    v.setUint32(at + (central ? 24 : 22), 64, true);
  });
  // Encrypted flag (general purpose bit 0) on every entry.
  const encrypted = patchHeaders(zip(minimalDocx(plainDocument('Léa Martin'))), (v, at, central) => {
    const off = at + (central ? 8 : 6);
    v.setUint16(off, v.getUint16(off, true) | 1, true);
  });
  // Two entries with the same name: "word/aaaaaaaa.xml" renamed to "word/document.xml" (same length).
  const dupSource = zip(minimalDocx(plainDocument('Léa Martin'), { 'word/aaaaaaaa.xml': plainDocument('Hugo Martin') }));
  const dup = dupSource.slice();
  const from = strToU8('word/aaaaaaaa.xml');
  const to = strToU8('word/document.xml');
  for (let i = 0; i + from.length <= dup.length; i++) {
    if (from.every((b, k) => dup[i + k] === b)) dup.set(to, i);
  }
  const many: Entries = minimalDocx(plainDocument('x'));
  for (let i = 0; i < 10_001; i++) many[`word/media/i${i}.png`] = PNG_1PX;
  const laughs =
    '<?xml version="1.0"?>\n<!DOCTYPE w:document [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]>' +
    `<w:document ${W_NS}><w:body>${para(`<w:r><w:t>&c;</w:t></w:r>`)}</w:body></w:document>`;
  const external =
    '<?xml version="1.0"?>\n<!DOCTYPE w:document [<!ENTITY x SYSTEM "file:///etc/passwd">]>' +
    `<w:document ${W_NS}><w:body>${para(`<w:r><w:t>&x;</w:t></w:r>`)}</w:body></w:document>`;
  return [
    { name: 'bomb-ratio.docx', bytes: bomb, reason: 'entry compressed more than 100 times' },
    { name: 'lying-size.docx', bytes: lying, reason: 'decompressed size larger than declared' },
    { name: 'encrypted-entry.docx', bytes: encrypted, reason: 'encrypted entry' },
    { name: 'duplicate-entry.docx', bytes: dup, reason: 'two entries with the same name' },
    { name: 'too-many-entries.docx', bytes: zip(many), reason: 'more than 10,000 entries' },
    { name: 'zip-slip.docx', bytes: zip(minimalDocx(plainDocument('x'), { '../evil.xml': '<x/>' })), reason: 'entry name leaving the package' },
    { name: 'absolute-path.docx', bytes: zip(minimalDocx(plainDocument('x'), { '/etc/evil.xml': '<x/>' })), reason: 'absolute entry name' },
    { name: 'billion-laughs.docx', bytes: zip(minimalDocx(laughs)), reason: 'document type declaration with entities' },
    { name: 'external-entity.docx', bytes: zip(minimalDocx(external)), reason: 'external entity' },
  ];
}

/** A file just over the 50 MB limit (made on demand: not written by the command line). */
export function oversizeFile(): Uint8Array {
  return new Uint8Array(50 * 1024 * 1024 + 1);
}

// ---------------------------------------------------------------- all

export async function allFixtures(): Promise<Fixture[]> {
  return [docxFixture(), odtFixture(), odsFixture(), odpFixture(), xlsxFixture(), pptxFixture(), ...textFixtures(), await pdfFixture()];
}

/** Write every set to a folder, with the manifests as JSON. */
export async function writeFixtures(dir: string): Promise<void> {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  for (const sub of ['documents', 'lists', 'refused']) mkdirSync(join(dir, sub), { recursive: true });
  const manifest: Record<string, Omit<Fixture, 'bytes'>> = {};
  for (const f of await allFixtures()) {
    writeFileSync(join(dir, 'documents', f.name), f.bytes);
    const { bytes: _bytes, ...rest } = f;
    manifest[f.name] = rest;
  }
  for (const r of rosters()) writeFileSync(join(dir, 'lists', r.name), r.bytes);
  for (const h of hostilePackages()) writeFileSync(join(dir, 'refused', h.name), h.bytes);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ people: PEOPLE, documents: manifest, lists: rosters().map((r) => ({ name: r.name, expect: r.expect })), refused: hostilePackages().map((h) => ({ name: h.name, reason: h.reason })) }, null, 2));
}

const argv = (globalThis as { process?: { argv?: string[] } }).process?.argv;
if (argv?.[1] && import.meta.url === new URL(`file://${argv[1]}`).href) {
  const dir = argv[2];
  if (!dir) throw new Error('usage: node tests/pseudo-fixtures.ts <folder>');
  await writeFixtures(dir);
  console.log(`Synthetic test sets written to ${dir}`);
}
