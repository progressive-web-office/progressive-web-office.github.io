---
search: false
description: Design note — local pseudonymisation of documents before they are shared (with a person, an examination board, a researcher or an AI assistant), and re-identification of what comes back (PSEUDO-001..PSEUDO-040).
---

# Pseudonymisation of documents (design note)

- Status: **implemented** (`src/pseudo/`), except the assistant's pseudonymised mode (PSEUDO-031), the rasterised PDF (PSEUDO-024) and the removal of picture metadata (PSEUDO-034)
- User guide: [Pseudonymising documents](../guide/pseudonymisation)
- Requirements: [PSEUDO-001..PSEUDO-040](../requirements#_9ze-pseudonymisation-pseudo)
- Scope: text documents, spreadsheets, presentations, Markdown and text
  files, PDF; one document or a folder; optionally, the AI assistant
- Delivery: **one pull request, one commit** (§16)

## 1. Goal, and what this is not

A user wants to share documents about people without their identities.
The recipient may be a colleague for a second reading, a board, a researcher, a provider, or an AI assistant. The
feature does not depend on the assistant. The application replaces, **on
the device and without any network request**, the names and identifiers of
the people of a list by pseudonyms (`ETU-012`), keeps the correspondence in
an encrypted **mapping table**, and later replaces the pseudonyms in what
comes back (marks, comments, a corrected copy) by the real names
(**re-identification**).

This is a **pseudonymisation** in the sense of GDPR art. 4(5): the data can
be attributed to a person again with additional information (the table),
kept separately. Recital 26 says that pseudonymised data **remain personal
data**. As long as the table exists, and even after it is deleted, the
output is not anonymous: writing style, the content (internship company,
project subject, a photograph) and the small size of a group allow
re-identification. The interface, the report and the documentation never use
the words *anonymous*, *anonymised* or *anonymisation* (PSEUDO-001).

Not in scope: optical character recognition (OCR), analysis of pictures,
detection of names absent from the list (except after a label, §5.5), legal
advice. The feature is a tool. Lawfulness stays the responsibility of the
data controller (the institution), which is why the feature has a notice
(disclaimer) that the user must acknowledge (§10.2, PSEUDO-002).

## 2. What the code base gives us

Facts found while reading the repository. They drive the choices below.

| Area | Fact | Consequence |
|------|------|-------------|
| Writers | DOCX, ODT, XLSX, ODS, PPTX and ODP writers **rebuild the package from the model** (`docx-writer.ts:169-197`, `odt-writer.ts:136-157`, …); nothing of the original package is kept. | Going through the model loses what it does not hold: text boxes, endnotes, non-default headers and footers, charts, SmartArt, `people.xml`, most metadata. Losing a text box means losing part of a student's work. |
| Model | `RichDocument` holds paragraphs, tables, footnotes, comments, tracked changes and ten metadata fields. Headers and footers are plain strings (first paragraph only). `allParagraphs()` walks neither footnotes, comments nor metadata. | The model cannot prove that every name was removed, because it does not see every place where a name can be. |
| ZIP | `readZip()` (`src/core/zip.ts:10`) is a bare `unzipSync`: no limit on uncompressed size, compression ratio or entry count. Only the archive-as-folder provider (`src/archive/provider.ts:55`) has limits. | The pseudonymisation needs its own hardened reader (§11.1). Making the rest of the application use it is a separate topic (question Q12). |
| XML | `parseXml()` (`src/core/xml.ts:24`) is `DOMParser` with no DOCTYPE or entity check and no size limit. **`DOMParser` does not exist in Web Workers.** | Same as above. Moving the XML work to a worker needs another parser (§12). |
| Text | `decodeText()` (`src/files/text-view.ts:58`) decodes UTF-8 (BOM or not, fatal) and falls back to Windows-1252, keeping BOM and line ends. The Markdown path uses a non-fatal `TextDecoder` with no fallback. | Reuse `decodeText()`/`encodeText()` for text files and the student list. |
| PDF | pdf.js gives text items with positions (`page.getTextContent()`). Text extraction for the AI tools is `pageStrings()` (`src/pdf/viewer.ts:683`). pdf-lib only fills forms and adds annotations; **nothing edits content streams**. | See the PDF options (§9). |
| Vault | `src/vault/kdbx.ts` reads and writes KDBX 4 (Argon2id 64 MiB). It has entries and custom fields, but no attachments. A vault is a user-visible document. | A natural, portable, encrypted store for the table (§7.3). |
| Lock | `seal()`/`sealText()` (`src/lock/session.ts:82`) **return their input unchanged when no application lock is set**. | Keeping the table in the browser is safe only while the lock is set (PSEUDO-016). |
| Folders | `StorageProvider` (`src/fs/types.ts:23`) uses path strings. There is no guard against writing inside a given folder. Handles are internal to providers. | The input/output separation must be checked with directory handles (§11.4). |
| Batch | Folder search and form compilation loop on the main thread; the only workers are pdf.js, Typst, the TypeScript service and the code sandbox. | §12. |
| AI | Two agents (`runAgent`, `runOpenAiAgent`), no common class. `callTool()` (`src/ai/tools.ts:449`) is the single place where the built-in assistant validates and runs tool calls; WebMCP has its own copy (`src/ai/webmcp.ts:48`). The document reaches the model **only through tool results and the system prompt, which holds the file name**. The built-in assistant **does not ask approval** for modifying tools (snapshot + Undo); MCP calls do. | Interception points for (c), §4.3. |
| i18n | `fr.ts`/`zh.ts` are typed `Record<MessageKey, string>`; `tests/i18n.test.ts` checks keys and placeholders. | New keys under `pseudo.*`. |
| Tests | No binary fixtures: tests build packages in code (`tests/helpers.ts` `makeZip`). Nothing blocks the network globally in Playwright; specs route given origins. | Fixtures are generated (§14). The no-network test is new. |
| Exam mode | `installExamGuards()` (`src/exam/mode.ts:118`) wraps `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `RTCPeerConnection`, `sendBeacon`. | The same list is used to spy on the network in tests (§11.3). |

### 2.1 Inconsistencies in the documentation (reported, not fixed here)

1. `docs/architecture.md` (*Security*) says "The AI assistant sends document
   content **to Anthropic only** after explicit consent", but AI-007, the
   README and `docs/guide/assistant.md` list six providers (Anthropic,
   OpenAI, Mistral, Albert, Ollama, any OpenAI-compatible server), plus the
   remote MCP servers of AI-012..AI-014.
2. The vision of `docs/requirements.md` says "No document ever leaves the
   device", while PLT-002 lists exceptions (git hosting, AI assistant,
   QRShare).
3. `SECURITY.md` lists "document changes made by an AI agent … without the
   user's consent or approval" in its scope. The built-in assistant applies
   its changes without asking, and relies on the consent given before sending,
   a snapshot and Undo (AI-003). This is consistent with AI-003 but can be
   read against `SECURITY.md`.
4. `SECURITY.md` lists zip bombs in its scope, but `readZip()` has no limit
   (see the table above).
5. `docs/requirements.md` is generated from `specs/spec.md`
   (`just sync-spec`). That file is not tracked and not in this working copy,
   so the PSEUDO rows were written directly in `docs/requirements.md` and must
   be copied into `specs/spec.md` before the next `just sync-spec` (question
   Q1).

## 3. Overview

```
              ┌──────────── src/pseudo/ (no DOM in the core, no network) ───────────┐
 list.csv ──► │ roster.ts ──► Roster ──► table.ts (pseudonyms, KDBX store)         │
              │                              │                                      │
 file bytes ► │ package/ (safe ZIP, safe XML) ──► formats/{text,package,pdf-text}.ts │
              │        TextUnit[] ──► engine.ts (normalize, detect, attribute) ──►  │
              │        Match[] ──► formats/* rewrite ──► output bytes               │
              │ residual.ts: read the output again from its bytes ──► Residue[]     │
              │ report.ts ──► Report (confidential, never in the output)            │
              │ reidentify.ts: pseudonyms ──► names (texts and documents sent back) │
              └──────────────────────────────────────────────────────────────────────┘
 UI: ui/dialog.ts (a, b), ui/report.ts; later: ai/pseudonymised.ts (c)
```

Module rules:

- `src/pseudo/engine.ts`, `normalize.ts`, `roster.ts`, `reidentify.ts` and
  `residual.ts` are pure TypeScript: no DOM, no I/O. They are tested alone
  and can run in a worker.
- `src/pseudo/` imports nothing from `src/ai/`, `src/collab/`, `src/git/`,
  `src/webdav/`, `src/share/` and has no `fetch`. A static test enforces it
  (§11.3).

## 4. Integration points

### 4.1 (a) "Pseudonymise a copy" of the open document

- **Pros**: smallest interface; the user sees the document and can open the
  result next to it; it validates the engine and the report on a real case
  quickly.
- **Cons**: the application does not keep the bytes of the opened file
  (`OpenDocument` has none). Re-serialising the view (`view.save()`) goes
  through the model and loses parts (§2). The command must therefore read the
  file again from its source (open folder, recent files, WebDAV, git) when it
  is not modified. Otherwise it offers to choose the file, or to use the
  current state, saying that the parts the editor does not hold are absent
  (question Q4). It also handles one file at a time, which is tedious for a
  set of documents.

### 4.2 (b) A folder to an output folder

- **Pros**: the usual case (a set of 30 reports). Attribution and the
  common-word check use the whole set of documents (§5.6). Output file names
  are pseudonyms.
- **Cons**: needs the File System Access API to write a folder (Chromium).
  Elsewhere the output is a ZIP download. Needs progress, cancel and a
  responsive interface (§12). Needs the input/output guard (§11.4).

### 4.3 (c) Optional: a filter in the AI assistant

The feature is useful without the assistant; this point of integration is
an option for those who use it. The assistant sends the document only through tool results. A
*pseudonymised mode* of the assistant would:

| Direction | Where | What |
|-----------|-------|------|
| out | `systemPrompt()` (`agent.ts:128`) | the file name, pseudonymised |
| out | prompt typed by the user (`agent.ts:67`, `openai-agent.ts:154`) | pseudonymised (the user may type "summarise the report of Léa Martin") |
| out | each tool result, after `callTool()` | pseudonymised (`read_document`, `read_sheet`, `read_pdf`, `read_note`, `search_notes`, `list_pdf_annotations` with authors, contacts…) |
| out | tool descriptions (folder label, `folder-tools.ts:25`) | pseudonymised |
| in | streamed text (`onText`) | re-identified **for display only**; the history keeps what the model saw |
| in | tool arguments, before `callTool()` runs a **document** tool | re-identified, so that `replace_blocks` writes the real name into the document |
| in → out | arguments of a **remote MCP** tool | **not** re-identified: they leave the device |
| — | WebMCP (`webmcp.ts`) | an external agent: out of the filter (question Q9) |

The filter is passed to both agents as an option
(`filter?: PseudonymFilter`), so the change stays inside `src/ai/agent.ts`,
`src/ai/openai-agent.ts` and `src/ai/panel.ts`. It is tested with the
existing fakes (`fakeStream`, `fetchFn`): the recorded request bodies must
contain no name of the list.

- **Pros**: no file to handle. The user works on the real document and the
  AI never sees the names.
- **Cons**: the largest security surface. Every new tool, every error message
  that echoes an input (`tools.ts:458`, `openai-agent.ts:185`) and every new
  provider is a possible leak. Streaming splits pseudonyms across deltas, so
  the display must hold back a partial pseudonym. Images in the document are
  not sent today, but a future vision tool would bypass the filter. The
  output check (§8) cannot run on a conversation the way it runs on a file.

### 4.4 Recommendation

The feature ships as **one pull request with one commit** (§16), so this
section decides what that pull request contains rather than an order of
pull requests.

- **In**: the engine, the list, the table, (a), (b), re-identification of
  texts and documents, and the formats DOCX, ODT, ODS, ODP, XLSX, PPTX,
  Markdown/MDZ/text/CSV and PDF as text. These are all the Must and Should
  rows with phase 0.2.0.
- **Out**: (c) (PSEUDO-031, phase —). The feature does not need the
  assistant, and (c) changes the assistant's security boundary, which
  deserves a review of its own once the engine has been used on real
  documents. Also out: the rasterised PDF (PSEUDO-024) and the removal of
  picture metadata (PSEUDO-034), both *Could*.
- Inside the commit, the work is done in the order of §16 (tests first at
  each step): (a) before (b), because (b) calls the same pipeline and only
  adds folder I/O, the guard and progress.

## 5. Detection engine

### 5.1 Normalisation with an offset map (defect 1)

Documents are **not rewritten** in another normalisation form. Doing so would
change every accented character of the author's text. Detection runs on a
*folded* copy, and each match is mapped back to the original positions:

- the list is normalised to NFC when it is read (it is stored that way);
- `fold(text)` walks the original string code point by code point, applies
  NFD, drops combining marks (`\p{Mn}`), lower-cases (locale-independent),
  maps `’ ʼ ‘ ´ \`` to `'`, `‐ ‑ ‒ – —` to `-`, `NBSP`, `NNBSP` and other
  spaces to a space, and `œ æ ß` to `oe ae ss`;
- it returns `{ folded: string, toOriginal: Uint32Array }`
  (`toOriginal[i]` = index in the original of folded character `i`, plus the
  end). A match `[s, e)` in the folded text becomes
  `[toOriginal[s], toOriginal[e])` in the original, extended over trailing
  combining marks;
- the text the engine writes (pseudonyms, markers) is ASCII or NFC.

Tests: a list in NFD (macOS export) against documents in NFC, and the
reverse; a decomposed `é` across two `w:t` elements.

### 5.2 Text units and hard boundaries (defect 3)

Format adapters do not hand a flat string to the engine. They hand
**units**:

```ts
export interface TextUnit {
  /** Text as written (original normalisation); `\t` and `\n` are hard breaks. */
  text: string;
  /** For the report: part name and a readable place ("word/footer2.xml", "comment 3"). */
  where: Place;
  /** What kind of text it is. */
  role: 'body' | 'header' | 'footer' | 'note' | 'comment' | 'author' | 'meta'
      | 'alt' | 'field' | 'link' | 'name' | 'file-name' | 'other';
  /** Position in a table, so that a label can take the cell to its right or below. */
  cell?: { table: string; row: number; col: number };
}
```

One paragraph (`w:p`, `a:p`, `text:p`, `text:h`), one cell paragraph, one
shared string, one metadata value or one attribute is one unit. Tabs
(`w:tab`, `text:tab`) become `\t`, breaks (`w:br`, `w:cr`,
`text:line-break`) become `\n`, and `text:s` becomes its spaces. PDF lines
are rebuilt from the pdf.js items: `hasEOL`, or a change of baseline, ends a
line; a horizontal gap of more than 2 em becomes `\t`. **A labelled value
never crosses a unit, a `\n` or a `\t`.**

### 5.3 Forms of a name

Per person, with folded tokens (`Jean-Pierre` → `jean`, `pierre`;
`D'Alembert` → `d`, `alembert`; `Le Gall` → `le`, `gall`). Between the tokens
of a name, the engine accepts `[\s\-'_.]*` (so `Dalembert`, `D'Alembert`,
`D Alembert`, `LeGall` and `jean_pierre` match). Between first and last name
it accepts `[\s_.,;\-]+`. Word boundaries are Unicode
(`(?<![\p{L}\p{N}])`, `(?![\p{L}\p{N}])`), and `_` separates words (file
names such as `martin_lea_tp3.docx`).

| Form | Example | Kind |
|------|---------|------|
| First Last | Léa Martin | `full-name` |
| Last First, LAST, First | MARTIN Léa, Martin, Léa | `full-name` |
| Initial(s) Last | L. Martin, J.-P. D'Alembert, JP D'Alembert | `initial` |
| Last Initial(s) | Martin L., D'Alembert J.-P. | `initial` |
| Last name alone (option, on) | Martin | `last-name` |
| First name alone (option, off) | Léa | `first-name` |
| E-mail of the list, any e-mail | lea.martin@etu.example.org | `email` |
| French phone number | 06 39 98 00 01, +33 6 39 98 00 01 | `phone` |
| INE (10 digits + 1 letter, or 9 digits + 2 letters) | 1234567890A | `ine` |
| Number of the list | 21900123 | `number` |
| Login in a path | `C:\Users\lmartin\`, `/home/lmartin/` | `login` |
| Value after a label | Nom : Léa Martine (not in the list) | `labelled` |

### 5.4 Names that are also common words, short names, shared names, exclusions

These rules come from defects 4 and 5. Each one leads to a **note in the
report**, written before any file is processed.

- **Exclusions** (names of scientists and units: Pascal, Newton, Young,
  Poisson, Joule, Watt, Kelvin, Hooke, Euler, Fourier, Laplace, Coulomb,
  Ampère, Ohm, Volta, Weber, Hertz, Tesla, Henry, Gauss, Bode, Nyquist,
  Thévenin, Norton, Kirchhoff, Faraday, Lenz, Carnot, Bernoulli, Reynolds,
  Darcy, Mohr, Tresca, Navier, Stokes, Cauchy, d'Alembert…; editable by the
  user, kept in this browser). A last name in this list is **never** replaced
  alone, only in its full-name and initial forms and after a label.
- **Common words** (Masse, Petit, Blanc, Moulin, Force, Roux, Brun, Fort,
  Lebon, Marchand…). The name is in a built-in list of French words
  (`COMMON_WORDS_FR` in `src/pseudo/data/lists.ts`, about 150 entries), **or** it
  appears in lower case, not at the start of a sentence, somewhere in the
  processed documents (the corpus check). It is then replaced alone only when
  it is written with a capital **and** stands next to a first name, an
  initial or a label of that person. It never counts for attribution. The
  failure this prevents is "la ETU-079 vaut 2 kg".
- **Short names** (fewer than 3 letters: Li, Ng, Ba). They are matched only in
  full-name and initial forms and after labels, with a warning naming the
  people. They are never silently ignored.
- **Shared last names** (two Martin). A lone `Martin` becomes the shared
  marker (`[PERSONNE]`), never one of the two pseudonyms, and does not count
  for attribution.
- **Shared first names**: same rule for first names alone.

### 5.5 Labels

Labels are folded and editable. Default French and English list: `nom`,
`prénom`, `nom et prénom`, `nom(s)`, `auteur(s)`, `rédigé par`,
`réalisé par`, `présenté par`, `fait par`, `binôme`, `trinôme`, `groupe`,
`équipe`, `membres`, `contact`, `responsable`, `n°`, `numéro`, `INE`,
`e-mail`, `courriel`, `téléphone`, `name`, `author`, `written by`, `members`,
`contact`. The user adds the labels of their own field (roles, titles).

- **Same unit**: `label` + optional `(s)` + `:`, `-` or tab + value. The
  value runs to the end of the line, a `\t`, `;`, `|` or the end of the unit,
  and to at most 6 words.
- **Table**: a cell holding only a label takes the cell to its right if it
  is not empty, otherwise the cell below. This covers labels on the left and
  labels above.
- **Paragraph**: a paragraph holding only a label takes the next paragraph
  if it looks like names.
- **Looks like names**: words starting with a capital letter, with hyphens
  or apostrophes, no digit, separated by `,`, `/`, `&`, `et`, `and`. A value
  that does not look like names (`Nom : masse volumique ρ = 7850 kg/m³`) is
  **not** replaced; it is listed as *to check*. A labelled value that matches
  a person of the list gets that person's pseudonym. Otherwise it gets the
  marker `[NOM]`.

### 5.6 Attribution over the whole document (defect 2)

The engine scans **all units of a document at once**, plus its file name.
Each piece of evidence has a weight. Default weights:

| Evidence | Weight |
|----------|--------|
| labelled value | 5 |
| e-mail, number or INE of the list | 5 |
| file name | 4 |
| author metadata | 2 |
| full name | 2 |
| initial form | 1 |
| last name alone | 1 (0 for common words, shared and short names) |

- A person is attributed when their score is at least 4 and at least half
  of the best score. Several attributed people make a **group** (co-authors):
  the output is named `ETU-012_ETU-047.docx`.
- No one, or a tie between unexpected people, gives the status
  **to check** and a neutral name (`copy-003.docx`).
- In a batch, a corpus pass first computes the common-word statistics
  (§5.4).

### 5.7 API

```ts
// src/pseudo/engine.ts — pure, synchronous, no DOM
export interface Person {
  /** Stable key: folded "last|first|number". */
  key: string;
  lastName: string;      // NFC
  firstName: string;     // NFC
  email?: string;
  number?: string;
  pseudonym: string;     // "ETU-012"
}

export interface DetectorConfig {
  people: readonly Person[];
  lastNameAlone: boolean;          // default true
  firstNameAlone: boolean;         // default false
  exclusions: readonly string[];   // default: built-in list + user's
  commonWords: ReadonlySet<string>;// folded; default: built-in list
  labels: readonly string[];       // default: built-in list + user's
  markers: Markers;                // texts of [NOM], [PERSONNE], [COURRIEL]…, in the interface language
}

export type MatchKind = 'full-name' | 'initial' | 'last-name' | 'first-name' | 'email'
  | 'phone' | 'ine' | 'number' | 'login' | 'labelled';

export interface Match {
  unit: number;           // index in the units given to scan()
  start: number;          // in the original text of the unit
  end: number;
  kind: MatchKind;
  person?: string;        // Person.key
  replacement: string;    // pseudonym or marker
  certainty: 'sure' | 'check';
}

export interface Evidence { kind: MatchKind | 'file-name' | 'author'; unit: number; weight: number }
export interface Attribution {
  status: 'single' | 'group' | 'none' | 'ambiguous';
  people: readonly { key: string; score: number; evidence: readonly Evidence[] }[];
}

export interface RosterNote {
  kind: 'excluded' | 'common-word' | 'short' | 'shared-last' | 'shared-first' | 'pseudonym-like-text';
  people: readonly string[];
}

export interface CorpusStats { lowerCaseUses: ReadonlyMap<string, number> }

export interface Detector {
  readonly notes: readonly RosterNote[];
  scan(units: readonly TextUnit[], context?: { fileName?: string; corpus?: CorpusStats }): {
    matches: readonly Match[];   // sorted, non-overlapping; the longest match wins
    attribution: Attribution;
  };
}

export function createDetector(config: DetectorConfig): Detector;
export function corpusStats(texts: Iterable<string>, people: readonly Person[]): CorpusStats;
/** Apply the matches of one unit to its text. */
export function applyMatches(text: string, matches: readonly Match[]): string;
```

Format adapters (`src/pseudo/formats/`): a file is opened into units, the
units of the whole document are scanned at once (attribution sees
everything), then the file is written back with the edits.

```ts
// src/pseudo/formats/types.ts
export interface UnitEdit { unit: number; start: number; end: number; replacement: string }

export interface OpenedDocument {
  units: TextUnit[];
  toCheck: VisualCheck[];   // pictures, objects, macros, binary parts, scanned pages, attachments
  removed: string[];        // thumbnail, signatures, printer settings, rsid…
  outputExtension: string;  // ".docx", or ".txt" for a PDF
  write(edits: readonly UnitEdit[]): Promise<Uint8Array>;
}

// formats/package.ts — every OOXML and ODF package (and MDZ, LaTeX ZIP)
export function openPackage(bytes: Uint8Array, name: string, opts?: OpenOptions): Promise<OpenedDocument>;
// formats/text.ts — Markdown, text, CSV, LaTeX, source files
export function openText(bytes: Uint8Array, name: string): OpenedDocument;
// formats/pdf-text.ts — PDF to text (pdf.js loader injected, for the tests)
export function openPdfText(bytes: Uint8Array, name: string, load?: PdfLoader): Promise<OpenedDocument>;
```

## 6. Processing layer, per format

**Rule: packages are processed at the package level (ZIP + XML), never
through the model.** The two reasons are fidelity (the writers rebuild from
the model and drop what it does not hold) and completeness (the model does
not see most of the places where a name can be). The model is still used
for one thing: opening the output read-only in the application, so the user
can look at it.

A **fail-safe default** covers what this list forgets. An XML part not
handled by name gets the generic treatment: every text node and every
attribute value is scanned, and a match is replaced and reported. A binary
part not handled by name is listed as *to check visually*. Nothing is
skipped silently.

Paragraph rule for XML: a unit is the text of the nearest paragraph element
(`w:p`, `a:p`, `text:p`, `text:h`). The replacement goes into the first text
element of the match (its formatting wins) and the other elements of the
match are emptied. Elements are rewritten through the DOM, then serialised
with `XMLSerializer` with the original XML declaration kept.

| Format | Layer | Parts and places |
|--------|-------|------------------|
| **DOCX** (also `.dotx`) | package | `word/document.xml`; `header*.xml`, `footer*.xml` (all, not only default); `footnotes.xml`, `endnotes.xml`; `comments.xml`, `commentsExtended.xml`, `commentsIds.xml`, `commentsExtensible.xml` (text, `w:author`, `w:initials`); text boxes `w:txbxContent` in **both** `mc:Choice` and `mc:Fallback` (VML `v:textbox`); fields: `w:instrText` as units of their own, `w:fldSimple@w:instr`, cached results as text; `AUTHOR`, `USERNAME`, `USERINITIALS` fields turned into plain text so that Word does not fill them again; tracked changes `w:ins`, `w:del`, `w:moveFrom`, `w:moveTo`, `w:rPrChange`… (`w:author`), deleted text `w:delText`; `word/people.xml` (`w15:author`, `w15:presenceInfo@w15:userId`); `docProps/core.xml` (`dc:creator`, `cp:lastModifiedBy` → pseudonym if attributed, otherwise empty; `dc:title`, `dc:subject`, `dc:description`, `cp:keywords`, `cp:category`, `cp:contentStatus` → engine); `docProps/app.xml` (`Company`, `Manager` → empty; `TitlesOfParts`, `HyperlinkBase` → engine); `docProps/custom.xml` (names and values → engine); thumbnail `docProps/thumbnail.*` **removed**, with its relationship and content type; alternative texts `wp:docPr@descr/@title/@name`, `pic:cNvPr@descr/@title`; `customXml/item*.xml` (generic); `word/glossary/**` (generic, same rules as the body); `word/charts/chart*.xml` (titles `a:p`, caches `c:strCache/c:pt/c:v` as units) and their embedded workbook (processed recursively, §6.1); `word/diagrams/data*.xml` and `drawing*.xml` (SmartArt, both copies); all `*.rels` targets: `mailto:` → engine; `file:///` → user folder replaced (`C:/Users/[USER]/…`); attached template (`word/_rels/settings.xml.rels`); `word/settings.xml` (`w:docVars` → engine; `w:rsids` and every `w:rsid*` attribute removed when *linkable identifiers* is on); `_xmlsignatures/**` removed (a signature holds the signer's certificate, and it would be invalid anyway); `word/media/*`, `word/embeddings/*` (non-package), `vbaProject.bin` → *to check visually*, or removed by option. |
| **XLSX** | package | `xl/sharedStrings.xml` (`si`, rich runs); inline strings `is`; string results `c[t=str]/v`; string literals inside formulas `f`; sheet names (`workbook.xml` `sheet@name`), with references `'Name'!` rewritten in all formulas and `definedNames`; table names and column names (`xl/tables/*`); comments `xl/comments*.xml` (`authors/author`, text); threaded comments `xl/threadedComments/*` and `xl/persons/person.xml` (`displayName`, `userId`); pivot caches `pivotCacheDefinition*` (`sharedItems`) and `pivotCacheRecords*` (copies of the data!); headers and footers `headerFooter`; data validation `@prompt`, `@error`; `workbook.xml` `fileSharing@userName`; revision logs `xl/revisions/**` (`userName`); `xl/externalLinks/**` and `connections.xml` (paths, connection strings) → engine, and listed; drawings, charts, docProps as for DOCX. |
| **PPTX** | package | slides, notes slides, layouts, masters, notes and handout masters (footer placeholders); comments `ppt/comments/*` and `ppt/commentAuthors.xml` (`name`, `initials`); modern comments and `ppt/authors.xml`; `presentation.xml` (section names `p14:section@name`, custom shows); `ppt/tags/**`; shape names and alternative texts `p:cNvPr@name/@descr/@title`; charts, SmartArt, docProps, thumbnail, media as for DOCX. |
| **ODT, ODS, ODP** (and templates) | package (one ODF adapter) | `content.xml` and `styles.xml` (header, footer, `header-left`, `header-first` of every master page); paragraphs `text:p`, `text:h`, `text:s`, `text:tab`, `text:line-break`; notes `text:note`; annotations `office:annotation` (`dc:creator`, `meta:creator-initials`, `loext:sender-initials`, text); tracked changes `text:changed-region` (`office:change-info/dc:creator`, deleted text); fields `text:author-name`, `text:author-initials`, `text:initial-creator`, `text:sender-*` (name, e-mail, phone of the sender), `text:user-defined`, `text:user-field-decl@office:string-value`; frames: `draw:frame@draw:name`, `svg:title`, `svg:desc`, text boxes `draw:text-box`; ODS: cells, sheet names `table:table@table:name` (references rewritten), annotations, named ranges, data pilot caches; ODP: `presentation:notes`; `meta.xml` (`dc:creator`, `meta:initial-creator` → pseudonym or empty; `dc:title`, `dc:subject`, `dc:description`, `meta:keyword`, `meta:user-defined`, `meta:printed-by` → engine or empty); `settings.xml` (config items scanned; `PrinterName` and `PrinterSetup` removed); `Thumbnails/thumbnail.png` **removed**, with its `META-INF/manifest.xml` entry; embedded objects `Object N/` (`content.xml` of formulas, charts and embedded documents, processed recursively); `ObjectReplacements/*` (previews of objects) → *to check visually*; `META-INF/documentsignatures.xml` removed; `layout-cache` removed; `Pictures/*` → *to check visually*. |
| **MDZ** | package | `index.md` (text adapter), `manifest.json` (author fields → engine), other text files (text adapter), pictures → *to check visually*. |
| **Markdown, text, CSV, LaTeX, source files** | text | the whole file through `decodeText()`, BOM and line ends kept (`encodeText()`). Front matter, comments and code are text like any other. CSV: each cell is a unit (a separator never joins two cells into one value). |
| **PDF** | see §9 | |
| Pictures, KDBX, SQLite | not processed | listed as *not processed* in the report |

### 6.1 Nested packages

A DOCX may embed an XLSX (chart data), an ODT may embed an ODS, and so on.
Embedded OOXML and ODF packages are processed recursively by the same
adapters, at most 2 levels deep. Their uncompressed sizes count in the
limits of the outer file (§11.1). Other embedded objects (OLE binaries,
`.bin`) are *to check visually*, or removed by option.

### 6.2 Linkable identifiers

The pseudonym hides the name, but some identifiers allow **linking**
documents to each other or to a computer: Word `rsid` values (shared by
the documents edited in the same Word installation), `w15:userId`, the
attached template path (`C:\Users\login\…`) and printer names. This is one
of the three criteria of the WP29 opinion 05/2014. The option *remove
linkable identifiers* is on by default (PSEUDO-033).

## 7. Pseudonyms and the mapping table

### 7.1 Pseudonyms

- Form: `ETU-` + 3 digits (`ETU-001`..`ETU-999`), or 4 digits when the
  list has more than 450 people (the pool is at least twice the list). The
  prefix is a question (Q6).
- Drawing: the pool is shuffled with Fisher–Yates, using
  `crypto.getRandomValues` with **rejection sampling** (no modulo bias). The
  order of the pseudonyms therefore reveals nothing about the alphabetical
  order of the list.
- **Stability**: a person already present in the table (same key: folded
  last name, first name and number) keeps their pseudonym. New people take
  free numbers. A person who left the list keeps their number, which is never given
  to someone else.
- Collision: if the documents already contain text shaped like a pseudonym
  (`ETU-\d+`), the run warns before starting, because re-identification would
  be ambiguous.

Stability helps the user (the same `ETU-012` from one set of documents to
the next), but it lets the recipient link the documents of one person
across sets. The user can create a new table per set; this choice is
shown in the dialog (question Q7).

### 7.2 Content of the table

- the people: key, last name, first name, e-mail, number, pseudonym, date
  added;
- the files: original path, output name, date, attribution;
- the reports of the runs (they hold real names);
- the creation date and the **planned deletion date**;
- the version of the format.

### 7.3 Storage

| Option | Pros | Cons |
|--------|------|------|
| **KDBX 4 file** (`src/vault/kdbx.ts`), saved where the user chooses; one entry per person (custom fields), one group for files and reports, the deletion date in a field | encrypted (Argon2id), portable, readable by KeePassXC, reuses existing code, independent of this browser | a password to type each session; no attachments in our API (the reports go in as protected fields) |
| IndexedDB sealed by the application lock (`seal()`) | no password while the application is unlocked | **clear text if no lock is set** (`seal()` returns its input); tied to this browser and lost with it |
| Clear CSV | simple | forbidden: a clear file next to the output is exactly the incident to avoid |

**Recommendation**: the KDBX file is the reference. It can also be kept in
the browser **only while the application lock is set** (the same rule as
`pwo.vault.remember.*`, VAULT-002). Exporting the table in clear text is not
offered (question Q8).

### 7.4 Retention

- When the table is created, the user chooses a deletion date (default:
  one year later, question Q10).
- When a table whose date has passed is opened, the application says so and
  offers to delete it, or to postpone with a reason written in the table.
- **Delete** forgets the copy kept in the browser and tells the user that the
  KDBX file must be deleted where it is stored. The application cannot delete
  a file it did not create there. Even after deletion, the outputs are still
  not anonymous (§1).

## 8. Output check (residues)

After each file is produced, `residual.ts` reads **the output bytes again
from zero**, independently of the rewriting:

- It uses a **different, simpler matcher**: for each person, the folded
  last name, first name, e-mail and number as whole words, with no exclusion,
  common-word or form logic. It over-reports on purpose. Hits on excluded or
  common words are shown as *mentions* (information), the others as
  *residues*.
- It reads **all** content: every entry name of the package, every text node
  and attribute of every XML part (with entities decoded), the text of the
  text files, the strings of binary parts (UTF-8 and UTF-16LE runs of at
  least 3 letters, for EXIF or OLE metadata), and for a PDF the text of
  pdf.js plus the Info dictionary, XMP, annotations, fields, outline and
  attachment names.
- The output file name is checked too.

Status of a file, **never a bare "OK"**:

| Status | When |
|--------|------|
| **Residues (n)** (red) | at least one residue |
| **To check (n)** (orange) | no residue, but something was not analysed: pictures, objects, unknown binary parts, scanned pages, labelled values that did not look like names, attribution *none* or *ambiguous* |
| **No residue found by the automatic check** (grey, not green) | no residue and nothing to check; always followed by the reminder "an automatic check is not a guarantee: read the result before sending it" |

## 9. PDF

Removing a text from a PDF means removing its glyphs from the content
streams. A rectangle drawn over a text that is still in the file is
**forbidden**: the text can still be selected, copied and extracted.

| Option | How | Fidelity | Effort and risk |
|--------|-----|----------|-----------------|
| 1. Rewrite the text operators | Decode the content streams (pdf-lib), map glyph codes to Unicode through each font (`ToUnicode`, encodings, CID fonts), find the matches, remove the glyphs from `Tj`/`TJ`/`'`/`"` and fix the positioning; repeat in form XObjects, Type 3 fonts, annotation appearances; handle `ActualText`, hidden OCR layers and text drawn twice | best: the rest of the page stays as it was | **high**: a subset font has no glyphs for `ETU-012` (the pseudonym must be drawn with another font); a text split across operators or kerned in `TJ` arrays; no reliable way to prove that nothing is left except by extracting again. pdf.js maps glyphs internally but does not expose that mapping for rewriting. Months of work for a partial result. |
| 2. Rasterise the affected pages | Render each affected page with pdf.js (200 dpi), paint opaque masks with the pseudonym over the matched text boxes (positions from `getTextContent()`, widened), and build a **new** PDF with pdf-lib: unaffected pages copied, affected pages replaced by their picture (no text left on them); Info, XMP, outline, attachments, JavaScript and the form dropped; annotations of the copied pages rewritten or dropped | text on the affected pages no longer selectable; larger file; masks placed from item widths, so not exact | **medium**: correct removal by construction (the page is pixels), but the masks need a visual check and the AI then reads those pages only as pictures |
| 3. Extract and pseudonymise the text | pdf.js text (lines rebuilt, §5.2), plus annotation texts and authors, form field values, outline titles and attachment names, in a `.txt` (or `.md`) file with page markers; scanned pages are marked | no layout, no figures; this is what the AI reads anyway | **low**: same engine and same check as text files |

**Recommendation**: option 3 in the pull request (PSEUDO-023). Option 2 is a
*Could* (PSEUDO-024) for when the PDF itself has to be sent. Option 1 is
*Won't, this time*.

Common to all options:

- **Scanned pages**: a page with fewer than 20 characters of text whose
  operator list draws an image covering most of the page is reported as
  *scanned page, not processed* (no OCR). In option 3 its place in the text
  says so.
- **Annotations**: text (`Contents`) and author (`T`) go through the engine.
- **Form fields**: values go through the engine. Option 2 flattens the form
  first.
- **Attachments** (`EmbeddedFiles`): never copied; listed by name, and the
  name itself goes through the engine.
- **XMP and Info**: dropped (option 2) or not carried over (option 3).
- **Outline**: titles go through the engine (option 3) or are dropped
  (option 2).

## 10. Interface

### 10.1 Commands

- **File** menu (`fileTools`, `app.ts:1863+`):
  - *Pseudonymise a copy…* (a);
  - *Pseudonymise a folder…* (b), also in the folder panel;
  - *Re-identify…*: paste a text, or open a file sent back by the recipient; the
    result is a new, untitled document or a download.
- The command palette picks the buttons up by itself (UI-018). The search
  keywords (`data-keywords`, hidden) include "GDPR, RGPD, pseudonymise,
  anonymise", so that people who look for "anonymise" find the feature
  without the word being shown (question Q11).
- **Assistant panel** (c): a *Pseudonymised mode* switch with the table in
  use, a visible badge while it is on, and the consent dialog (AI-002)
  saying it is on and what it does not cover (pictures).
- **Options** of the window (kept for the next run): exclusions, labels,
  common words added by the user, and the switches. The lists hold no personal data and
  are kept in `localStorage` (`pwo.pseudo`).

### 10.2 Notice (disclaimer)

Shown before the first run, and again when its text changes (it is
versioned). It must be acknowledged with a check box before the first run.
It can be opened from every report, and a one-line summary is printed in
every report. Draft (to be checked by your DPO), French version:

> **Pseudonymisation — à lire avant usage**
>
> - Cet outil **pseudonymise** des documents (RGPD, art. 4(5)) : il
>   remplace les noms et identifiants des personnes de votre liste par des
>   pseudonymes. Les personnes **restent identifiables** : tant que la
>   table de correspondance existe — et même après — les documents produits
>   restent des **données personnelles** (le style, le contenu, la petite
>   taille d'une promotion permettent de reconnaître quelqu'un).
> - La détection est **automatique et incomplète** : les images, captures,
>   pages scannées, objets incorporés, et les noms absents de la liste
>   (sauf après « Nom : ») ne sont pas traités. **Relisez chaque résultat**
>   avant de le transmettre, en particulier les éléments « à vérifier ».
> - **Votre établissement reste responsable du traitement** : base légale,
>   information des personnes concernées, registre, éventuelle analyse d'impact,
>   contrat avec le destinataire (collègue extérieur, prestataire,
>   fournisseur d'IA) et transferts hors UE. Consultez votre délégué à la
>   protection des données (DPO).
> - La table de correspondance est **chiffrée** ; ne l'envoyez jamais,
>   conservez-la le temps nécessaire seulement, puis supprimez-la.
> - Si les documents sont confiés à une IA : une note ne doit pas être
>   décidée par une IA seule (RGPD, art. 22), et l'évaluation des acquis
>   d'apprentissage par une IA est un usage « à haut risque » du règlement
>   européen sur l'IA.
> - Logiciel fourni **sans garantie** (licence AGPL-3.0-or-later).
>
> ☐ J'ai lu ces informations

The acknowledgement (notice version and date) is kept in `localStorage`
(`pwo.pseudo.notice`).

### 10.3 Dialog

The dialog has five steps:

1. **List** (PSEUDO-004, PSEUDO-036..PSEUDO-039): a CSV or TSV file, an
   Excel workbook or an OpenDocument spreadsheet, or the open spreadsheet
   (as shown, not saved first). `src/pseudo/roster.ts` reads it into sheets
   of text cells (packages through the hardened reader first, then the
   application's XLSX and ODS readers; cached values of formulas, numbers
   without decimals). The user chooses the sheet (the first by default), the
   header row (the first of the first ten rows holding a known column name)
   or none, and the columns: last and first name in two columns, or the full
   name in one (`MARTIN Léa`, `Martin, Léa`; words in capitals are the last
   name, otherwise the order chosen); e-mail and number. A preview shows the
   first ten people as they will be read, the rows left out, and a warning
   when numbers read from number cells have different lengths (lost leading
   zeros). The columns chosen are remembered for the same headers
   (`pwo.pseudo.columns`: headers only). Databases are left for later
   (PSEUDO-040).
2. **Table**: open a KDBX file, or create one with its deletion date and
   password.
3. **Options**: last names alone (on), first names alone (off), pictures
   kept or removed, linkable identifiers removed (on), exclusions and labels.
4. **Files**: the open document (a), or the input and output folders (b).
5. **Run**: progress (file n of N, current part), **Cancel**, then the
   report.

### 10.4 Report

The report is a panel (not a file in the output). One row per file shows:

- original name → output name;
- attributed people, with pseudonym and real name (shown locally);
- the status (§8);
- when the row is expanded:
  - replacements by kind and place, each with a short extract (real names
    shown locally);
  - notes and warnings;
  - **To check visually**: each picture as a thumbnail taken from the
    **output** (a local `blob:` URL), with its place and alternative text;
    each embedded object, unknown binary part and scanned page, with a
    thumbnail when it can be drawn. Each item has a *checked* box. The run
    summary counts the items still to check;
  - removed parts (thumbnail, signatures, printer settings).

The report can be *opened in the application* (read-only, untitled). It is
kept **only in the table** (KDBX). A run never writes it next to the output.

## 11. Security

### 11.1 Untrusted packages

| Limit | Default | Note |
|-------|---------|------|
| input file | 50 MB | stricter than FILE-012 (200 MB) for opening; question Q5 |
| list of people (CSV, XLSX, ODS) | 20 MB, 5,000 rows | a workbook goes through the package checks first |
| ZIP entries | 10,000 | |
| uncompressed total | 300 MB, nested packages included | |
| one entry | 100 MB | |
| ratio of one entry | 100:1 (entries above 1 MB) | |
| nesting | 2 levels | |

- Sizes are counted on the **real output of decompression** (streaming
  `Unzip`/`UnzipInflate` of fflate, chunk by chunk), not on the sizes the
  headers declare. The run aborts as soon as a limit is passed.
- Entries are refused when they are encrypted, duplicated, or have a name
  with `..`, a leading `/`, `\`, a drive letter or NUL (zip-slip).
- **XML**: every part containing `<!DOCTYPE` or `<!ENTITY` is refused
  before parsing, because OOXML and ODF never need a DTD. Browsers do not
  load external entities, but they differ on expanding internal entities
  ("billion laughs"). One XML part may hold at most 50 MB of text. A parse
  error refuses the file.
- **PDF**: pdf.js with `enableXfa: false` and no scripting (pdf.js 6 has no
  `eval` path any more), at most 2,000 pages.
- A refused file produces **no partial output**. The report says why.
- Output names are built from pseudonyms (`checkName()`), never from input
  names.

### 11.2 Data in memory

The list, the table and the reports stay in memory only during the session.
They are forgotten when the dialog is closed and when the application locks
(`onLockChange`). Nothing goes into the recent files, the drafts, the
versions (FILE-025) or the backups.

### 11.3 No network

- **Static test**: no file under `src/pseudo/` contains `fetch`,
  `XMLHttpRequest`, `WebSocket`, `EventSource`, `RTCPeerConnection` or
  `sendBeacon`, or imports from `src/ai`, `src/collab`, `src/git`,
  `src/webdav`, `src/share`, `src/grist` or `src/devsync`.
- **Vitest**: the pipeline runs on every fixture with these APIs replaced by
  spies that throw; the test asserts they were not called.
- **Playwright**: during a run, every request that is not a static file of
  the application fails the test (`context.route('**/*')`). A second run
  happens after `context.setOffline(true)`.
- The CSP already restricts `connect-src`. The tests check the code, not the
  policy.

### 11.4 Input and output folders (defect 7)

- With the File System Access API, the output folder is chosen apart and
  compared with `isSameEntry()` and `resolve()`. It must be neither the
  input folder, nor inside it, nor contain it. Otherwise the run is refused
  with an explanation.
- The output folder must be empty, or be a previous output of the same table
  (a marker file holding no personal data).
- The inputs never include the list file, any `.kdbx`, or files whose name
  is a pseudonym of the table.
- Without the File System Access API (Firefox, Safari), and for read-only
  folders (FILE-027), the output is **one ZIP download**, so no overlap is
  possible.
- The table is never written to the output. An assertion compares every
  output with the table's bytes and file name.

## 12. Performance and workers

- Today all parsing runs on the main thread, and **`DOMParser` does not exist
  in workers**. Running the package adapters in a worker would mean writing
  our own small XML tokenizer: text, tags, attributes, CDATA and comments, no
  DTD. It would be about 300 lines to maintain, with the advantage that
  everything outside the rewritten text stays byte-for-byte identical.
- **Proposal**: in this pull request, the adapters run on the main thread
  with `DOMParser` and give control back between parts and between files
  (`yieldNow()`: `scheduler.yield()` where it exists, else `setTimeout(0)`),
  with progress and cancel (`AbortSignal`). The pure modules (engine,
  residual check) are written to run in a worker. A worker comes next if a
  measurement shows a part of more than 100 ms (question Q13). pdf.js
  already parses in its own worker.

## 13. Vocabulary

| Use | Never |
|-----|-------|
| pseudonymise, pseudonymisation, pseudonymised copy | anonymise, anonymisation, anonymous |
| pseudonym (`ETU-012`) | identifier, ID (ambiguous with the numbers of the list) |
| mapping table (fr: table de correspondance; zh: 对照表) | key (fr: clé) alone, which suggests a cryptographic key |
| re-identification (fr: ré-identification; zh: 重新识别) | de-anonymisation |
| zh: 假名化, 化名 | zh: 匿名, 匿名化 |

A test fails if any `pseudo.*` string in `en.ts`, `fr.ts` or `zh.ts`, or the
guide page, contains `anonym` or `匿名` (PSEUDO-001). Authors replaced in
metadata get the pseudonym or nothing, never "Anonymous" (unlike usual
tools).

## 14. Tests and synthetic test sets

### 14.1 Principles

- No real personal data. People, e-mails, numbers and phones are invented:
  e-mails use `example.org`, and phone numbers are in the ranges reserved by
  ARCEP for fiction (`06 39 98 xx xx`).
- Packages are generated in code, as the repository already does.
  `tests/pseudo-fixtures.ts` builds every file **with a manifest of the
  expected occurrences**: part, place, kind, person. A test can then prove
  that every planted name was found (completeness) and that no decoy was
  touched (precision).
- The same module, run with `node tests/pseudo-fixtures.ts <folder>`,
  writes the files to a folder, to open them in Word and LibreOffice by hand.

### 14.2 Content

| Set | Content |
|-----|---------|
| Lists | `;` UTF-8; `,` UTF-8 with BOM; tab Windows-1252; **NFD** (macOS export); English headers (`last_name`, `first_name`, `mail`, `student_id`); invalid lists (missing `prenom`, empty, duplicate person, a line with too many fields) |
| People | 16 invented people covering the cases: shared last name (two Martin), compound first name and particle with apostrophe (Jean-Pierre D'Alembert, also a scientist), particle (Maëlle Le Gall), common words (Masse, Petit, Blanc, Moulin, Force), short (Li, Ng, Ba), scientist names (Pascal Young, Zoé Poisson), accents (Anaïs Lefèvre, Noé Bérénger) |
| DOCX | one occurrence planted in **each** place of the DOCX row of §6, in several forms, plus decoys: "la masse vaut 2 kg", "module de Young", "loi de Poisson", "100 Pa (pascal)", a header table "Nom \| Binôme" with the values to the right and below, "Nom :" followed by a tab and technical text, text already shaped like `ETU-123` |
| ODT, ODS, ODP | same principle, places of the ODF row |
| XLSX, PPTX | same principle, places of their rows |
| Markdown, text, CSV | front matter, body, code block, CSV cells |
| PDF | text page, page with names split across items, annotation with author, form field, attachment, Info and XMP, outline, **picture-only page** (scan) |
| Packages that must be refused | zip bomb (high ratio), lying size in the headers, too many entries, `../` entry, part with `<!DOCTYPE>` and entities |

### 14.3 Defects that must not come back

| # | Defect | Requirement | Test |
|---|--------|-------------|------|
| 1 | list in NFD not found, status "OK" | PSEUDO-006, PSEUDO-026 | `PSEUDO-006 finds a decomposed name (NFD list, NFC document and reverse)`; `PSEUDO-026 reports residues, never OK, when the engine misses a name` |
| 2 | attribution counter reset on each detection call | PSEUDO-014 | `PSEUDO-014 attributes a DOCX whose name appears once in the header and once in the body` |
| 3 | labelled value overflowing (no breaks in PDF, tabs as spaces in DOCX) | PSEUDO-008 | `PSEUDO-008 stops a labelled value at a tab, a line end and a cell`; same with a PDF line |
| 4 | names that are common words replaced everywhere, wrong attribution | PSEUDO-011 | `PSEUDO-011 keeps "la masse vaut 2 kg" and does not attribute on it` |
| 5 | names of fewer than 3 letters silently ignored | PSEUDO-012 | `PSEUDO-012 matches "Wei Li" and warns about short names` |
| 6 | metadata and DOCX parts forgotten | PSEUDO-018 | `PSEUDO-018 removes every planted occurrence of the DOCX set` (manifest) |
| 7 | output folder inside the input folder | PSEUDO-029 | `PSEUDO-029 refuses an output folder inside the input folder, and the reverse` |
| 8 | XML parser not hardened, no ZIP limits | PSEUDO-032 | `PSEUDO-032 refuses a zip bomb, a lying size, a DOCTYPE, a ../ entry` |

## 15. Dependencies

**None added.** The feature uses fflate (streaming `Unzip`), `DOMParser`
and `XMLSerializer`, pdf.js, pdf-lib, kdbxweb and hash-wasm (already used by
the vault), and `crypto.getRandomValues`. If the XML work moves to a worker
(§12), the tokenizer is written in the project rather than added as a
dependency.

## 16. Delivery: one pull request, one commit

The whole feature is **one pull request holding one commit**,
`feat: pseudonymise documents before sharing them (PSEUDO-001..PSEUDO-033)`,
with the trailer `Assisted-by: AI` and the title prefix `[AI]`. The
requirement rows, this note, the guide page, the tests, the code, the
strings in three languages and the CHANGELOG line are in that commit
(spec-driven: the rows go with the code). `just check` and `just e2e` pass
before it is made.

The steps below are the order of the work inside that commit. Each one
starts with its failing tests, so the branch can be reviewed step by step
in draft before the history is squashed into the single commit (question
Q21).

| Step | Topic | Files | Tests (requirement in the title) |
|------|-------|-------|------------------------------------|
| 1 | Hardened package reading | `src/pseudo/limits.ts`, `package/zip.ts`, `package/xml.ts` | `tests/pseudo.package.test.ts` (PSEUDO-032) |
| 2 | Folding with offset map, detection engine, lists | `src/pseudo/normalize.ts`, `engine.ts`, `data/lists.ts` | `tests/pseudo.engine.test.ts` (PSEUDO-006..014) |
| 3 | List of people | `src/pseudo/roster.ts` | `tests/pseudo.roster.test.ts` (PSEUDO-004, 005) |
| 4 | Pseudonyms and mapping table | `src/pseudo/table.ts` | `tests/pseudo.table.test.ts` (PSEUDO-015..017) |
| 5 | Re-identification | `src/pseudo/reidentify.ts`, `pipeline.ts` (`reidentifyFile`) | `tests/pseudo.reidentify.test.ts`, `tests/pseudo.formats.test.ts` (PSEUDO-030) |
| 6 | Text files, output check, pipeline | `src/pseudo/formats/text.ts`, `residual.ts`, `pipeline.ts` | `tests/pseudo.formats.test.ts` (PSEUDO-022, 026) |
| 7 | OOXML and ODF packages | `src/pseudo/formats/package.ts` | `tests/pseudo.formats.test.ts` (PSEUDO-018..021, 025, 033) |
| 8 | PDF as text | `src/pseudo/formats/pdf-text.ts` | `tests/pseudo.pdf.test.ts` (PSEUDO-023) |
| 9 | No network | — | `tests/pseudo.network.test.ts` (PSEUDO-003) |
| 10 | Notice, window, report, re-identification, folders | `src/pseudo/settings.ts`, `folders.ts`, `ui/notice.ts`, `ui/dialog.ts`, `ui/report.ts`, `ui/reidentify.ts`, `src/app/app.ts`, `src/app/styles.css`, `src/i18n/*.ts` | `tests/pseudo.ui.test.ts` (PSEUDO-001, 002, 016, 029), `e2e/pseudo.spec.ts` (PSEUDO-002, 003, 027..030) |
| 11 | Documentation | `docs/guide/pseudonymisation.md`, sidebar, `docs/architecture.md`, `CHANGELOG.md`, `ROADMAP.md`, `README.md`, `justfile` (`just pseudo-fixtures`) | `just docs` without warnings |

Later, each in a pull request of its own: (c) the assistant's pseudonymised
mode (PSEUDO-031), the rasterised PDF (PSEUDO-024), the removal of picture
metadata (PSEUDO-034), and the hardened readers used by the rest of the
application (question Q12).

## 17. Open questions

**Blocking** (no safe default):

- **Q1**: `docs/requirements.md` is generated from `specs/spec.md`, which is
  not in this working copy. Will you copy the PSEUDO rows into it, or should
  `docs/requirements.md` be edited directly from now on? Running
  `just sync-spec` before that would erase them.
- **Q2**: who validates the notice (§10.2), and should it mention GDPR
  art. 22 and the AI Act? Following PSEUDO-001 it never writes the word
  "anonymisation", not even to say what the feature is not; is that what
  you want, or should the notice be the one exception? This blocks step 10 only.
- **Q8**: is the KDBX file, kept in the browser only under the application
  lock, the right home for the table? Is there no clear-text export at all?
  This blocks step 4.

**With a default** (the default is applied unless you say otherwise):

| # | Question | Default |
|---|----------|---------|
| Q3 | Content of the single pull request | all Must and Should rows of phase 0.2.0, without the assistant (§4.4) |
| Q4 | Source of (a) when the open document has changed or has no source | read the source again if unchanged; otherwise ask: choose the file, or use the current state (saying what is absent) |
| Q5 | Input limit | 50 MB for this feature (FILE-012 keeps 200 MB for opening) |
| Q6 | Pseudonym prefix: `ETU-` (from your examples) is tied to one use; a neutral default such as `P-`? | chosen when a table is created, then fixed for that table; default `ETU-` until you decide |
| Q7 | One table per group of people or per set of documents | per group; the dialog explains the trade-off |
| Q9 | WebMCP while the assistant is in pseudonymised mode | the same filter wraps the WebMCP tools |
| Q10 | Default deletion date of a table | one year after its creation |
| Q11 | Hidden search keyword "anonymise" in the palette | yes, never shown |
| Q12 | Use the hardened ZIP/XML readers in the rest of the application | yes, in a separate `fix(security):` pull request after this one |
| Q13 | Worker | main thread with yielding; worker only after a measurement |
| Q14 | Language of the markers (`[NOM]`, `[COURRIEL]`…) | interface language at run time |
| Q15 | Authors who are not in the list (the user's own name in comments, other people) | every author or creator field is emptied or given the pseudonym |
| Q16 | Pictures | kept and listed as *to check*; *remove pictures* is an option |
| Q17 | Phase of the PSEUDO rows | 0.2.0 for Must/Should, — for Could/Won't |
| Q18 | Base branch | the work starts from `main`; this note was written on a branch from `feat/mcp-client` (AI-010..AI-014 not yet in `main`) and is moved onto `main` |
| Q19 | Naming of an output with several attributed people | `ETU-012_ETU-047.docx` |
| Q20 | SPDX headers | the repository declares licences in `REUSE.toml` (`path = "**"`), not in file headers; new files follow that |
| Q21 | Review before the single commit | a draft pull request whose steps are squashed into one commit before merging |
| Q22 | The local search index of the documentation is at 486 kB with the guide page, near the 500 kB limit that makes `just docs` fail (this note is left out of it with `search: false`) | raise `chunkSizeWarningLimit` in the documentation build when the next page passes it |
