---
description: Source layout and design of Progressive Web Office.
---

# Architecture

Progressive Web Office is a dependency-light TypeScript application built with Vite.
All parsing and serialisation is done in the browser.

```
src/
  core/       format detection, ZIP (fflate) and XML (DOMParser) helpers
  app/        application shell, DOM helpers, PWA integration
  storage/    file open/save
  document/   rich-text model, DOCX/ODT/Markdown/MDZ readers & writers,
              model <-> DOM bridge, WYSIWYG editor
  sheet/      workbook model, formula engine, XLSX/ODS/CSV readers & writers,
              virtualized grid editor
  slides/     presentation model, PPTX/ODP readers & writers, slide editor,
              slideshow
  pdf/        pdf.js viewer, form/signature saving (pdf-lib), signature pad
  math/       MathLive loader, equation dialog, MathML/OMML/LaTeX converters
  diagram/    Mermaid loader, SVG/PNG rendering, diagram dialog and templates
  code/       code cells: sandbox document and worker, runner, dialogs,
              completion and TypeScript language service, reactive cells
              (dependency graph, its Mermaid view), widgets (widgets/:
              anywidget host, view frames, Python bridge, packages)
  review/     review mode shared by PDF files and text documents
  settings/   settings window
  fs/         storage-independent file system and file explorer
  folder/     folder panel, search, linked notes
  collab/     real-time collaboration (Yjs, WebRTC, Nostr relays)
  share/      QRShare hand-off and received-file checks
  lock/       lock of the application: passkeys (WebAuthn PRF), keys, sealing
  vault/      vaults of passwords: KDBX 4 (kdbxweb, Argon2 by hash-wasm), TOTP
  datamodel/  data models: conceptual, logical, SQL
  sqlite/     SQLite databases as documents (SQLite in the code sandbox)
  pseudo/     pseudonymisation of documents before sharing: hardened ZIP/XML
              reading, detection engine, package/text/PDF adapters, output
              check, mapping table (KDBX), re-identification, its window
schemas/      JSON Schemas (MDZ manifest)
e2e/          Playwright end-to-end tests
```

## Text documents

All text formats are converted to and from one **format-neutral model**
(`src/document/model.ts`): a list of blocks (paragraphs with a style,
alignment and optional list level; tables; rules) made of runs (text with
bold/italic/underline/strike/code/link flags, or images referencing
content-addressed resources).

```
.docx ─┐                         ┌─> .docx
.odt  ─┼─> RichDocument <──> DOM ┼─> .odt
.md   ─┤      (model)   editor   ├─> .md
.mdz  ─┘                         └─> .mdz
```

The editor is a `contenteditable` page. Its DOM is converted back to the model
by `domToBlocks()`, which only understands the supported subset — the same
function sanitises pasted HTML.

## Shell and views

`App` (`src/app/app.ts`) owns the header, the start screen, the status bar and
the open/save flow. Each document family is handled by an **editor view**
implementing the `EditorView` interface (`src/app/views.ts`). Views are loaded
with dynamic `import()` so that, for example, the PDF engine is only
downloaded when a PDF is opened.

## Format detection

`detectFormat()` inspects the content first:

1. `%PDF-` signature → PDF
2. ZIP signature → OpenDocument `mimetype` entry, MDZ layout
   (`index.md` + `manifest.json`) or OOXML `[Content_Types].xml`
3. otherwise the extension is used for text formats (`.csv`, `.tsv`, `.md`)

## Security

- No document content is sent over the network, except to the git hosting
  API the user explicitly connected (and commits to).
- A strict Content-Security-Policy is injected in production builds
  (no inline scripts, no remote scripts; HTTPS `fetch` only for user-chosen
  APIs).
- Git access tokens live in `localStorage` only, are sent only to their own
  API URL and are removed with **Forget**.
- The AI assistant sends document content to Anthropic only after explicit
  consent; its API key is used for the current session only (never stored)
  unless the user chooses to save it in the browser. The SDK is loaded lazily, only when the assistant is used.
- AI tools validate every model-provided input before running; WebMCP tool
  calls that modify a document need the user's approval.
- The UI is built with DOM APIs (no `innerHTML` with untrusted content).
- The pseudonymisation (`src/pseudo/`, [design note](design/pseudonymisation.md))
  makes no network request (a test checks its sources and spies on the
  network APIs), reads untrusted packages with its own limits (zip bombs,
  lying sizes, entry names, document type declarations refused) and keeps the
  mapping table only encrypted.

## Spreadsheets

A workbook is a list of sheets holding **sparse** cells (`Map` keyed by
`row,col`). A cell stores a literal value and optionally a formula in Excel A1
syntax; ODS formulas are translated from/to OpenFormula on read/write.

The formula engine (`src/sheet/formula.ts`, `src/sheet/engine.ts`) tokenizes
and parses formulas into an AST, evaluates them lazily with a per-cell cache
(invalidated on edit) and detects circular references. Reference rewriting
(copy translation, row/column insertion and deletion) works on the token
stream so that string literals are never altered.

The grid only renders the visible rows (plus overscan) between two spacer
rows, so large sheets stay responsive.

## PDF

Rendering uses **pdf.js** (`pdfjs-dist`, legacy build for broader browser
support) in a Web Worker. A Vite plugin serves and emits pdf.js runtime assets
(CMaps, standard fonts, ICC profiles, WebAssembly decoders) under `pdfjs/` so
that nothing is fetched from a CDN.

**Typeset PDF** (PDF-020): `writeTypst()` (`src/document/typst-writer.ts`)
writes a text document as [Typst](https://typst.app) source — every run of
text a Typst string, so nothing in it is markup; equations converted from
LaTeX by `tex2typst`; numbers, cross-references and citations written as the
editor shows them, cross-references linked to `metadata` labels. The Typst
compiler (`@myriaddreamin/typst-ts-web-compiler`, WebAssembly) runs in a
module worker (`src/pdf/typst.worker.ts`): only its 60 kB JavaScript glue is
bundled; the WebAssembly (about 11 MB compressed) and the fonts come from
`cdn.jsdelivr.net` once the user agrees, each checked against the SHA-256
pinned in `src/pdf/typst-hashes.ts` before it is used or kept in the
`pwo-typst` cache (offline afterwards). An equation Typst refuses is tested
alone and written as its LaTeX. The document itself never leaves the device.

Forms and signatures are handled by **pdf-lib** (`@pdfme/pdf-lib`, a
maintained fork): `inspectPdf()` lists AcroForm fields with their widget
rectangles in PDF coordinates; the viewer overlays HTML controls converted with
the pdf.js viewport. `applyEdits()` writes field values (regenerating
appearances), optional flattening, signature images and free text.

## Presentations

A presentation is a list of slides holding absolutely positioned **shapes**
(text, rectangle, ellipse, image) in CSS pixels. Text reuses the rich-text
paragraph model (with run font size and colour), so the same DOM bridge powers
in-place text editing.

The PPTX reader resolves placeholder geometry through the slide → layout →
master chain and theme colours; the writer emits a minimal package (one master,
one blank layout, a theme, and a notes master when needed). The ODP
reader/writer maps shapes to `draw:frame`/`draw:rect`/`draw:ellipse` with
deduplicated automatic styles.

## Equations

Equations are `MathRun`s holding LaTeX. MathLive is imported lazily — only
when a document contains or inserts an equation — and provides rendering, the
`<math-field>` editor and LaTeX → MathML conversion. `src/math/convert.ts`
converts MathML → OMML (Word) and OMML/MathML → LaTeX, so that the model stays
LaTeX-based while each format gets its native representation. Rendered
MathLive markup is sanitised before insertion (no links, scripts or event
handlers).

## Diagrams

Diagrams are `DiagramRun`s holding Mermaid source. Mermaid is imported lazily
(`src/diagram/mermaid.ts`) and configured in strict security mode without
HTML labels, so its SVG has no `foreignObject`: the editor shows it as an
`<img>` (a `data:` URL, isolated from the page) and exports rasterise it on a
canvas. `writeDocumentAsync` renders each distinct source to PNG before
writing DOCX, ODT or a LaTeX project; `src/document/diagram.ts` then replaces
diagrams by pictures titled `mermaid` whose alternative text is the source
(or by the source as text when rendering failed), and the DOCX/ODT readers
turn such pictures back into diagrams. Markdown and MDZ keep ```` ```mermaid ````
fences.

## Code cells

Code cells (`CodeCellRun`: code, language, last output) are run by
`src/code/runner.ts` in a sandbox built to withstand untrusted documents:

- an `<iframe sandbox="allow-scripts">` whose `srcdoc` gives it an **opaque
  origin** — no access to the application's DOM, `localStorage`, IndexedDB,
  service worker or cookies. Its own Content-Security-Policy
  (`default-src 'none'`, scripts only from its inline bootstrap — allowed by
  hash — and `blob:` URLs, `connect-src blob: data:`) adds to the policy it
  inherits from the application, so it **cannot reach the network**;
- inside it, a **worker** (classic: opaque-origin documents cannot start
  module workers from `blob:` URLs) that runs the code, so that the
  application stays responsive and **■ Stop** simply destroys the iframe;
- the only channel is `postMessage`. The worker asks the runner for the files
  of the Python runtime; the runner serves the five Pyodide core files from
  the application (`pyodide/`, cached by the service worker on first use) and
  package wheels listed in Pyodide's lock file from the Pyodide CDN (cached
  too). Pyodide checks each wheel against the SHA-256 of the lock file.

Python cells share one interpreter per open document; matplotlib uses the
Agg backend and open figures are returned as PNG files after each run. Code
never runs when a document is opened: the first run in a document asks for
confirmation.

### Reactive cells

`src/code/reactive.ts` builds the dependency graph of the cells from the
names each one defines and uses: Python cells are read by Python's own
`symtable` in the sandbox, JavaScript cells by the TypeScript language
service (top-level declarations, and names the checker cannot resolve). It
reports names defined in several cells and cycles, orders the cells to run
(their out-of-date ancestors, then the cells asked for, then — in automatic
mode — what depends on them) and the cells to mark out of date. JavaScript
cells share their top-level names through a scope object of the worker: each
cell is rewritten to read the names it uses from it and to publish the ones
it defines. Out-of-date marks are positions kept by a ProseMirror plugin
(`src/document/pm/cell-state.ts`), mapped through the edits and not saved.
`src/code/dag.ts` turns the graph into a Mermaid flowchart for the panel of
`src/code/dag-panel.ts`.

### Widgets

`src/code/widgets/` makes the application an anywidget (AFM) host:

- **Python**: the bundled wheels of `public/python/` (anywidget, ipywidgets,
  comm, psygnal; checked against `wheels.json`) are unpacked in Pyodide when
  a cell mentions widgets; `pwo_widgets.py` replaces `comm.create_comm` so
  that every widget channel is sent to the application, gives `display`, and
  the `pwo` module (`ui`, `install`);
- **JavaScript**: the worker provides `widget`, `display`, `ui` and
  `importWidget`, with the same channel messages;
- **`host.ts`** keeps the models' state between the sandbox and the views and
  relays changes both ways; a frame may only change the models it was given;
- **views**: each widget is drawn in an `<iframe sandbox="allow-scripts">` of
  its own (opaque origin) whose policy forbids the network; its only script
  is `view-runtime.js`, allowed by hash in its policy and in the
  application's (`vite.config.ts`). It implements the AFM lifecycle
  (initialize once, render per view, abort signals, composition through
  `anywidget:` / `IPY_MODEL_` references), the ipywidgets boxes, grid,
  layout, label and HTML, sizes the frame and draws the PNG picture of the
  view kept with the document;
- **downloads** (`packages.ts`): wheels and modules from a URL, a
  `wheel.txt` list or the Python package index are fetched by the
  application, after the user allowed the site, and kept in the Cache
  Storage for offline use.
