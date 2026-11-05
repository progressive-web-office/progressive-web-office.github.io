# Roadmap

Development phases are **milestones**. Following Semantic Versioning for
initial development, phases 0 to 12 are `0.0.1` to `0.0.13` in the
changelog; phase 13 is the first minor release, `0.1.0`.

| Phase | Milestone | Scope | Status |
|-------|-----------|-------|--------|
| 0 | 0.0.1 | Foundations: TypeScript/Vite scaffold, PWA shell (manifest, service worker, offline), start screen, open/drop, format detection, docs + `llms.txt`, `justfile`, governance files | ✅ |
| 1 | 0.0.2 | Text documents: `.docx`, `.odt`, `.md`, `.mdz` (wflixu/mdz 1.1.0 compatible) read/edit/write, WYSIWYG editor, images, links, plain ZIP → MDZ import | ✅ |
| 2 | 0.0.3 | Spreadsheets: `.xlsx`, `.ods`, `.csv` read/edit/write, formula engine, multiple sheets, insert/delete rows & columns | ✅ |
| 3 | 0.0.4 | PDF: viewer (navigation, zoom, text selection), form filling, handwritten signatures | ✅ |
| 4 | 0.0.5 | Presentations: `.pptx`, `.odp` read/edit/write, slide sorter, slideshow | ✅ |
| 5 | 0.0.6 | Polish: recent files, autosave drafts, end-to-end tests | ✅ |
| 6 | 0.0.7 | Mathematical equations: MathLive editor, `$…$` in Markdown/MDZ, MathML in ODT, OMML in DOCX | ✅ |
| 7 | 0.0.8 | Internationalisation: English, French, Simplified Chinese | ✅ |
| 8 | 0.0.9 | Printing: page setup, print preview, per-kind print layouts | ✅ |
| 9 | 0.0.10 | LaTeX: `.tex` export (ZIP with images), import, `$…$` typing, equations in sheets and slides | ✅ |
| 10 | 0.0.11 | Git repositories: GitHub and GitLab browse, open, commit | ✅ |
| 11 | 0.0.12 | Device-to-device exchange with QRShare (Web Share, share target) | ✅ |
| 12 | 0.0.13 | AI assistant (Claude) with document tools; WebMCP tools for external agents | ✅ |
| 13 | 0.1.0 | QRShare app handoff (send and receive files between the two apps in the browser); light/dark/system theme; document properties and Markdown front matter; Mermaid diagrams; sandboxed Python/JavaScript code cells; Grist connector; choice of AI provider (Claude, OpenAI, Mistral, Albert, Ollama, OpenAI-compatible); Nextcloud / WebDAV; spreadsheet charts; real-time collaboration (documents, spreadsheets) with presence and shared versions; ProseMirror word processor (find/replace, character and paragraph formatting, page breaks, footnotes, table of contents, header/footer, tables with merged cells, captions and cross-references, citations and bibliography, master documents); folder mode (side panel, search across documents, links between documents) | ✅ |

## Planned

Ideas not yet scheduled into a milestone, grouped by theme. Order within a
group is not a commitment.

### Spreadsheet

- ✅ Cell formatting (SHEET-014: bold, italic, underline, colours, fills,
  borders, alignment) and freeze panes (SHEET-017); next: fonts and sizes,
  merged cells
- ✅ Sort (SHEET-016) and autofilter (SHEET-018), fill handle (SHEET-027),
  data validation (SHEET-028), conditional formatting (SHEET-029)
- More functions (financial, engineering, array formulas)
- Executable notebooks: code cells (Python/JavaScript) that read and write
  the cells of an open workbook

### Forms

- ✅ Design PDF forms by drawing their fields (FORM-001); compile the answers
  of filled copies into a spreadsheet (FORM-002)
- ✅ Form fields in the word processor: text, check box, drop-down list, kept
  in ODT, DOCX, Markdown and HTML (FORM-003); compiling the answers of
  OpenDocument, Word and Markdown forms; answers sent to a Grist table
  (FORM-004)
- Next: word processor form fields exported to a PDF form directly; option
  buttons and dates in documents; an online form (a web page) whose answers
  come back as files

### Code cells

- ✅ Completion as you type, with the TypeScript language service for
  JavaScript and TypeScript (CODE-011, CODE-012); hiding the code of cells
  (CODE-013)
- ✅ Reactive cells (CODE-014): dependencies between cells from the names
  they define and use, out-of-date marks or automatic runs, no hidden state;
  the dependency graph shown next to the document (CODE-015)
- ✅ anywidget widgets (CODE-016) from Python and JavaScript cells, each in
  an isolated frame, reactive with `pwo.ui`, packages installed from a URL,
  a `wheel.txt` list or the package index; examples with the anywidget
  instruments; next: the other ipywidgets controls, widgets alive again in
  a reopened document after a run
- ✅ Code files run in the code viewer (CODE-017); Lua, SQL, C/C++ and R
  with runtimes downloaded after asking (CODE-018); a folder is a project:
  modules, headers and data files of the folder, entry point and options in
  `pwo.toml` (CODE-019); next: cells of a document importing the files of
  its folder
- Computer algebra in cells (Giac compiled to WebAssembly)

### Word processor

- ✅ Named paragraph styles beyond headings (DOC-053); next: character styles
- ✅ Page numbering styles (DOC-029, 0.1.0)
- ✅ Templates and examples, the user's own templates in the browser, the
  template file formats (FILE-018 to FILE-020), templates kept in a folder
  (FOLDER-020)
- Master documents, next steps: numbering and table of contents running
  across sub-documents while editing, cross-references to targets in other
  sub-documents
- ✅ Mail merge: a document combined with a CSV file or a workbook gives N
  documents or one document to print (DOC-036)
- Grammar checking with LanguageTool (public or self-hosted instance)
- ✅ Comparison of two versions of a document, as tracked changes (DOC-052)
- ✅ Review mode: text documents shown as pages like PDF files, page by page
  or scrolled, the same shortcuts (k/j…), comments, full screen without
  distractions (REVIEW-001 to REVIEW-004); next: clickable outline, read
  aloud (Web Speech)

### Files

- ✅ ZIP archives opened as folders, nested archives included (FILE-021);
  source and text files in a code editor (FILE-022); pictures (FILE-023)
- ✅ PDF annotations: highlights and notes (PDF-018)
- ✅ Review comments on lines of source files (FILE-024)

### Writing aids

- ✅ Typography as you type (DOC-031) and text transforms (DOC-032)
- ✅ Readability (DOC-033), writing goals and statistics with a focus timer
  (DOC-034), focus and typewriter modes (DOC-035)
- ✅ Completion of links (`[[`) and tags (`#`) in the notes of a folder
  (FOLDER-021)
- ✅ Snippets with fields (`${1:title}`, date, clipboard) inserted from a list
  or with `;;` (DOC-037); next: autocompletion of citations (`@`) and emoji
- Citation styles from CSL files (APA, Chicago, ISO 690…) and a reference
  library kept in sync with Zotero (Better BibTeX export)

### Notes and knowledge

- ✅ Tags (`#tag` and front matter keywords): a tag panel with counts,
  renaming across the folder, search by tag (FOLDER-017), colours
  (FOLDER-023)
- ✅ Related notes (shared tags and links) beside the open note (FOLDER-019)
- ✅ A graph of the links between the notes of a folder (FOLDER-018)
- ✅ Note identifiers (timestamps) and links by identifier (FOLDER-024)
- ✅ Folders of thousands of notes indexed in the background, only the
  changed notes read again (FOLDER-025)
- ✅ Properties of a note: its front matter as a card — tags, links, dates,
  yes/no, numbers — to change, to read, or as YAML (NOTE-001)

A knowledge base kept in plain Markdown files, on the device, readable by
any other tool. Planned, the most useful first:

**Links and navigation**

- Autocompletion of `[[` with the names and aliases of the notes, and of
  `[[Note#` with its headings; links to a heading and to a paragraph
  (`[[Note#^id]]`)
- Embedded notes `![[Note]]`, a section `![[Note#Heading]]`, an image at a
  width `![[image.png|300]]`, a page of a PDF — read-only, without loops
- A preview of the linked note when hovering a link
- Outline of the note: its headings, to jump to and to move sections
- Bookmarks of notes, headings and searches, in groups
- Links that stay readable in other Markdown tools (reference definitions
  at the end of the note), as an option

**Backlinks**

- ✅ Backlinks at the bottom of the note or beside it, sorted by name or
  date, with or without context, folded (FOLDER-026); next: the whole
  paragraph as context, a filter
- ✅ Unlinked mentions (the name or an alias written without a link), each
  made a link in one click (FOLDER-026)

**Graph**

- An interactive graph drawn by the browser (not a diagram): zoom, pan,
  click to open, thousands of notes
- The graph of the open note with a depth (1 to 5); the whole folder
- Filters (a search, tags as nodes, attachments, orphans, links to missing
  notes) and groups coloured by a search (`tag:#project`, `path:journal`)

**Properties and views**

- ~~The notes queried in SQL — tables of notes, properties, tags, links and
  tasks — from a SQL cell of a note or a `.sql` file of the folder~~
  (NOTE-002, done)
- One type per property for the whole folder; a list of all properties with
  their use, renamed everywhere at once
- Search operators: `tag:`, `path:`, `file:`, `line:`, `section:`,
  `task:`, `[status:done]`, `OR`, `-`, `/regex/`; a live search written in a
  note
- ~~Views of notes kept as a file (YAML) — a table whose cells change the
  properties, cards, a board by status — filtered and sorted~~ (NOTE-003,
  done)
- Views: a list, a calendar by date, groups in the table, totals, formulas
  computed without running code, a view shown inside a note
- Properties linking notes to each other, and totals over them

**Daily notes and calendar**

- ✅ Today's note opened (created when missing), named `YYYY-MM-DD` by
  default, the format, the folder and the template chosen; a format with `/`
  makes sub-folders (FOLDER-027)
- ✅ A month calendar beside the notes: a dot for each day with a note, a
  click opens or creates it (FOLDER-027); next: previous and next day
- ✅ A calendar of events kept as notes — month, week, day and agenda,
  dragged to move, repeating, linked from the daily notes — and iCalendar
  files (CAL-001..CAL-005)
- ✅ Contacts kept as notes — searched, linked from the notes and the
  events, birthdays in the calendar — and vCard files (CONTACT-001..004)
- ✅ Calendars and address books of CalDAV / CardDAV servers (Nextcloud…)
  kept in step with the notes, both ways, conflicts kept as copies
  (CAL-006, CONTACT-005)
- Weekly, monthly, quarterly and yearly notes, each with its format, folder
  and template
- Dates written in words (`@today`, `@next friday`) made links to their day

**Templates**

- A folder of templates; a template inserted or used for each new note, for
  a folder, for the daily notes
- Fields: `{{title}}`, `{{date}}`, `{{time}}`, `{{date:YYYY-MM-DD}}`,
  `{{date+7d}}`, the cursor, a value asked; the template's properties merged
  into the note's — never code run

**Tasks and boards**

- Every `- [ ]` of the folder in one list, ticked in place, by note
- Due, scheduled and done dates, priority, recurrence; lists of tasks written
  as a query in a note
- A board of cards kept as Markdown (headings for columns, items for cards),
  or a view of notes by their `status`
- A day planner: tasks with times on a timeline

**More**

- A canvas: notes, texts, files and groups placed and linked on a board,
  saved in an open JSON format
- A hand-drawn whiteboard kept in the folder
- Flashcards written in the notes (`question::answer`), reviewed at spaced
  intervals, the schedule kept in the front matter
- A mind map of the headings and lists of a note
- Editing lists as an outline (move, indent, fold with the keyboard)
- A tidy-up of notes: front matter, headings and spacing made regular
- Import of notes exported by other applications (HTML, Markdown, ENEX)
- Related notes found by meaning, computed on the device only
- Nothing of these runs code from a note: extensions stay content packs and
  sandboxed plugins (see Plugins)

### Databases

- ~~A SQLite file (`.sqlite`, `.db`) opened as a document: its tables, their
  rows changed in a grid, SQL run~~ (DB-001, done); next: queries kept in
  the database, sorting and filtering the grid, import of CSV into a table
- Forms to enter rows, reports made from a document template
- ~~Data modelling as taught, with three levels kept in step: the
  conceptual model written as text beside its diagram, the logical model
  derived from it, the SQL of the tables for SQLite, PostgreSQL or MySQL~~
  (DB-002..DB-004, done)
- Data modelling, next: entities placed by hand on the diagram, weak
  entities (relative identification), inheritance, the SQL applied at once
  to a SQLite file
- ~~The reverse: the conceptual model read back from an existing SQLite
  file~~ (DB-005, done)
- Exercises of modelling with their solution (Teaching)

### Communication

- Messages, files and calls on the Matrix protocol, end-to-end encrypted
  (MSG-001..006): rooms and direct messages, files shared from the
  documents, a contact's Matrix address on its card, an event's room and
  call, a message kept as a line of the daily note, rooms summed up by the
  assistant; other networks reached through the bridges of the user's
  server rather than a client per protocol; calls and video between two
  peer to peer, group calls through the media server of the user's server
- ✅ Reminders of events notified while the application is open (NOTIF-001,
  NOTIF-004); next: notifications (NOTIF-002, NOTIF-003): new messages
  while the application is open, the number unread on its icon; when it is
  closed, Web Push through the user's own server (its push gateway, or a
  push server of the user's), the content fetched and decrypted on the
  device, never in the push

### Working on several documents

- Document tabs and a split view: two documents side by side (a copy and
  its answer key, a source and its translation), pinned tabs
- ✅ Markdown extras: highlight `==text==`, callouts (`> [!NOTE]`) (MD-019);
  next: attributes (`{#id .class}`), unnumbered headings

### Review and collaboration

- ✅ Comments in text documents (REV-001 to REV-004: DOCX, ODT, Markdown);
  ✅ track changes (REV-005); next: comments and changes shared in
  real-time sessions, comments on spreadsheet cells, formatting changes
- ✅ Asynchronous collaboration without a network for text documents
  (COLLAB-008, 0.1.0): character-level merge through passes of animated QR
  codes with QRShare, signed frames, trusted devices, an import log
- Offline synchronisation of spreadsheets, images sent once by SHA-256
  (blob frames), the Yjs history embedded in ODT and DOCX files
- Self-hostable PWO server, for when the current approach (WebRTC, Nostr
  relays, links carrying the document) does not work — networks blocking
  WebRTC and WebSockets to public relays, documents too large for a link,
  recipients offline at the same time:
  - server code in the repository (`server/`), small, without a database
    (files on disk), with a Docker image and a deployment guide;
  - real-time collaboration through the server (WebSocket, with HTTP
    long-polling as a fallback), as one more way next to direct and relays;
  - sharing a document by link: uploaded end-to-end encrypted, the key
    staying in the link fragment, so the server never reads it; expiry
    date, download limit, deletion by the sender;
  - asynchronous collaboration: the shared document (Yjs updates) kept
    encrypted on the server, so that people need not be online together;
  - the server address in the settings (none by default), quotas and
    limits on the server side

### Typography and page (TeX's best ideas, WYSIWYG)

- ✅ The page of the document: paper, orientation, margins, kept in every
  format, the page on screen as on paper (DOC-046)
- ✅ Graduated rulers, horizontal and vertical, in cm or inches: margins and
  indents shown and dragged, page boundaries (DOC-047); next: tab stops on
  the ruler
- ✅ Typographic quality as in TeX: hyphenation by language, line breaking
  over the whole paragraph, widows and orphans, ligatures, kerning, small
  capitals (DOC-048), non-breaking spaces of the language (DOC-031); next:
  microtypography (protrusion, font expansion), old-style figures, a
  baseline grid
- True pages in the editor (the text cut into sheets), footnotes at the foot
  of their page, floats (figures placed at the top or bottom of a page)

### Scientific writing

- ✅ An article template: title, authors and affiliations, abstract,
  keywords, sections, equations, tables, citations, references (BIB-011)
- ✅ Zotero: search the library and cite from it (Web API, a key kept in this
  browser), import a collection as the document's references (BIB-010);
  next: group libraries, the Zotero desktop picker
- Citation styles from CSL files; cross-references, numbering and the list of
  references as in LaTeX; export to journal templates

### Desktop publishing

- ✅ Text in columns (two to six, gap, rule between), column breaks, kept in
  OpenDocument, Word, LaTeX and Markdown; a newspaper template (DOC-049)
- Frames placed on the page, text flowing from one frame to the next,
  pictures with text around them, master pages
- ✅ Colours for print: RGB and CMYK (values typed in either), colours a
  printer cannot print, total ink, a print preview of the colours
  (COLOR-001, COLOR-002); next: spot colours, ICC profiles, PDF/X, CMYK kept
  in files

### Devices and safety of the documents

- ✅ Synchronisation between one's own devices, peer to peer and end-to-end
  encrypted (paired devices, revocable): the documents of the browser found
  on every device — with clear warnings: synchronisation is not a backup, a
  document deleted on one device is deleted on all (a trash kept 30 days)
  (DEVSYNC-001..005), the trash in the window (DEVSYNC-009), revoking one
  device only (DEVSYNC-010), templates synchronised (DEVSYNC-012); recent
  files stay on their device (copies would change apart)
- ✅ Real backups, distinct from synchronisation: dated, encrypted archives of
  all the documents kept in the browser, to a folder or a WebDAV / Nextcloud
  account, with reminders, kept for days and weeks, restored file by file or
  all at once; the last backup's date always visible (BACKUP-001..005);
  automatic backups while the application
  is open (BACKUP-006); next: a Git repository as a destination
- ✅ A vault of passwords kept as a KDBX file — the open format read by the
  password managers of every system, which fill the passwords in other
  sites and apps — opened as a document, unlocked by the passkey of the
  device, its one-time codes (TOTP) and a generator of passwords, kept in
  the folder, on a server or synchronised peer to peer between one's own
  devices (VAULT-001..004); next: shown in a page of its own, without
  plugins nor code (VAULT-005), passphrases generated, attachments
- ✅ Locking the application with a passkey or a passphrase
  (LOCK-001..005): nothing of what the browser keeps shown before it is
  opened; the documents of its storage, recent files, drafts, versions,
  templates and accounts encrypted with a key the passkey's secret opens,
  a recovery key shown once opening it too; locked again after a delay;
  next: the names of the files and the offline copies of shared documents
  encrypted too (LOCK-006), the backups opened by the passkey as well as by
  their password

### Images and drawing

- ✅ Minimal photo editing: crop, turn, mirror, resize, brightness /
  contrast, blur a region (IMG-001), arrows, text and highlights (IMG-004);
  next: editing picture files and slide pictures
- ✅ Vector drawing (DRAW-001..DRAW-004): shapes, lines and arrows, freehand,
  text, grid and snapping, connectors that follow the shapes; saved as SVG
  (editable again), exported as PNG
- ✅ Schematics (DRAW-005, DRAW-006): symbol libraries — electrical and
  electronic (IEC 60617), logic gates, control block diagrams, pneumatic and
  hydraulic (ISO 1219), flowcharts (ISO 5807) — pins on the grid, orthogonal
  wires that stay connected, junction dots, references (R1, C1…) and values
  with units; netlist (SPICE) and bill of materials (DRAW-009)
- ✅ Drawings inserted in text documents and slides, editable in place, with
  a PNG version for DOCX and LaTeX (DRAW-007); next: PNG version in PPTX
- ✅ Bitmap painting (DRAW-008): pencil, brush, eraser, fill, shapes, text,
  selection, canvas size — for a new picture or any picture
- ✅ Drawing and painting editors in the whole window, tools folding away,
  full screen, with the command palette (DRAW-022)
- OpenDocument drawings (.odg), draw.io diagrams (DRAW-010)
- ✅ Caption images easily: a caption and alt text when inserting or pasting
  a picture (IMG-003), and an accessibility check (DOC-030)

### Presentations

- ✅ Presenter view (PRES-014), layouts (PRES-016), alignment guides
  (PRES-015); next: master slides, bullets of one's own

### Teaching

- ✅ Exercise sheets and answer keys from one document (TEACH-001)
- ✅ Random variants (TEACH-002): parameterised values give each student a
  different version, with its computed answer key
- ✅ Quiz export to Moodle XML, GIFT and AMC (Auto Multiple Choice) (TEACH-003)
- Hand out and collect work in class over QRShare / peer-to-peer
  collaboration, without a learning platform
- ✅ Bode / Nyquist plots from a transfer function, with the margins
  (TEACH-004), step response and poles, open or closed loop (TEACH-006);
  block diagrams are drawn with the symbols of the drawing editor
- ✅ Exam mode: no network, no AI, no outside paste, a log, ended with the
  teacher's code (TEACH-005); next: a kiosk build for Safe Exam Browser

### PDF and trust

- ✅ Whole-page zoom and 2 or more pages side by side (PDF-016)
- ✅ Direct PDF export of text documents, typeset by Typst in the browser (PDF-020); next: PDF/A and tagged (accessible) PDF, spreadsheets and presentations
- Local electronic signatures and signature verification (WebCrypto,
  basic PAdES)
- ✅ Text search in PDF (PDF-017)
- ✅ Text boxes, arrows and shapes drawn on a PDF page with the vector drawing
  editor, saved as vector annotations editable again (PDF-021), with bold,
  italic, sizes and colours on parts of a text (DRAW-020); drawings and
  schematics downloaded as vector PDF (DRAW-021); signatures and texts of the
  page brought into the drawing; next: the
  PDF's own text edited in place, more fonts for other scripts

### Files and fidelity

- Real-file corpus (Word and LibreOffice documents) with an automatic
  fidelity report in CI; preserve unknown content on save
- ✅ File explorer: a storage-independent module (`src/fs/`, a
  `StorageProvider` interface: list, read, write, mkdir, move, remove) with
  providers for local folders (File System Access API), the browser's
  private storage (OPFS), WebDAV / Nextcloud and Git repositories; create,
  rename, move and delete files and folders; sizes, dates and sorting,
  keyboard navigation, importing files of the device, multiple selection and
  undoing a deletion; a context menu, copy / cut / paste, duplicate,
  downloads (folders as ZIP), several recent folders;
  designed to be extracted as a library shared with QRShare
- ✅ Git repositories (GitHub, GitLab) as folders of the file explorer, each
  change being a commit (FOLDER-007); new branches and pull / merge requests
  from a branch (FOLDER-022)
- ✅ Gitea and Forgejo forges — Codeberg, self-hosted, local network (GIT-016)
- ✅ Git working copies on disk: branch shown (GIT-014), new documents made
  in folders and repositories (GIT-015), commits made by the application
  itself with isomorphic-git, local history, compare and restore (GIT-017);
  next: branches, pull and push to a remote from a working copy
- ✅ Repositories and servers used remembered, documents keeping where they
  come from (FILE-028, FILE-029)
- ✅ Read-only opening: open any document read-only (viewing without
  accidental edits, files from a read-only folder or link), with a visible
  banner and "Edit a copy"
- ✅ Note vaults: a folder of linked Markdown notes with YAML front matter
  (tags, aliases, any key kept), `[[wiki links]]`, `[[note#heading]]`,
  `[[note|alias]]`, `![[embeds]]`, backlinks, and links that follow renames
- Crash recovery from an operation log in IndexedDB, beyond autosave
- Upstream MDZ collaboration

### Plugins (proposal, see docs/plugins.md)

- Content packs without code: templates, symbol libraries, snippets,
  palettes (PLUG-001); a registry of plugins in a Git repository of a
  dedicated organisation, installed at pinned versions, offline (PLUG-002..
  PLUG-004)
- Sandboxed code plugins with declared permissions: commands, importers and
  exporters, panels (PLUG-005..PLUG-008); optional parts of the core moved
  behind the same API

### Cross-cutting

- Phones: a contextual toolbar docked above the keyboard (the essential
  buttons for the selection, the rest under "More"), toolbars that can be
  hidden, and a full-screen writing mode

- ✅ Templates (FILE-018 to FILE-020), command palette (UI-018), local
  version history (FILE-025)
- ✅ Accessibility checker for text documents (DOC-030)
