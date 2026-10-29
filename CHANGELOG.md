# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Roadmap phases are `0.0.x` milestones (see `ROADMAP.md`).

## [Unreleased]

### Added

- The installed application offers "New document", "New spreadsheet" and "New
  presentation" from its icon (long press or right click), and its manifest
  gives its language, direction, orientation and screenshots (desktop and
  phone), for the install dialog of the browsers and the stores (PLT-009,
  PLT-003).

### Changed

- The kind of an interaction with a contact is free: besides meeting, call,
  e-mail and message, type your own (`🍽 Lunch`), an emoji first if you
  like; the kinds already used are offered again, and agents may use them
  too (CONTACT-006, CONTACT-007).

- Daily notes are filed by year and month (`Daily notes/2026/10/2026-10-05.md`)
  and events by year, month and day (`Events/2026/10/05/2026-10-05
  Kick-off.md`); an event moved to another day takes its note to that day's
  folder, under the same name (FOLDER-027, CAL-001).

- The repository is now `progressive-web-office/progressive-web-office.github.io`
  and the application is published at the root of
  <https://progressive-web-office.github.io/>, its documentation at `/docs/`:
  the About window, the links of the documentation, the README and the
  policies point there. The brand files (logo, icons, banners, brand guide)
  are in `public/brand/`, published at `/brand/`.
  The former address `…github.io/progressive-web-office/` leads to the new
  one, links to documents included; the documents of the browser stay, the
  site being the same.

- **A new logo and new application icons**: three fanned sheets — the
  document, the spreadsheet and the presentation — on a square navy icon,
  also in the header of the application, on its start screen and in the
  documentation; a **Brand** page in the documentation (files, colours,
  type, usage).
- A **trademark policy** (`TRADEMARKS.md`) for the names *Progressive Web
  Office* and *PWO* and the logo: the AGPL-3.0 covers the code, not the
  marks (its section 7(e)); forks use another name and logo. Noted in the
  README, the Brand page and the About window.
- The tagline says what the application does today — documents,
  spreadsheets, presentations, PDF, drawings, notes and live code — and
  that files stay on the device **unless you choose** to share, sync or
  collaborate (no longer "nothing leaves your device").
- The project moved to the **progressive-web-office** organisation: the
  source is at <https://github.com/progressive-web-office/progressive-web-office>
  and the application at
  <https://progressive-web-office.github.io/progressive-web-office/>.
- **Templates and examples**: every template shows its emoji (they were
  declared but not drawn), a template kept as a file shows the one of its
  type (📄 text, 📊 spreadsheet, 📽️ presentation, 📝 Markdown…), and every
  tab has its own (📄 Text documents, 📊 Spreadsheets, 📽️ Presentations,
  🎨 Drawings, 💡 Examples, ⭐ My templates, 🗃️ a repository, ☁️ a cloud
  folder).

### Security

- **Sync my devices**: a device is now added by a **one-time invitation**
  (a QR code valid 5 minutes, for one device) **accepted on a paired
  device** after comparing four emojis; the QR code no longer holds the key
  of the documents, which is sent only to the device accepted, encrypted for
  a public key of its own (DEVSYNC-006). The guide explains the limits (the key kept in each
  browser, a lost device, what the relays see).

### Fixed

- A message of the application was partly hidden under the folder panel.

- The properties of a note lost a key holding a space (`see also:`): it
  was taken as part of the property before it (NOTE-001).

- A folder of thousands of notes froze the browser (FOLDER-025): each note
  opened read every note of the folder again, one after the other, and
  searched every note for each link — 17 s with the page frozen, two
  minutes in all, for 3,000 notes. The notes are now indexed once, in steps
  that leave the page responsive (the progress shown), only what changed is
  read again, links are found by name at once, and the backlinks show the
  words around each link.

- Synchronising one's devices along a chain (DEVSYNC-013): when the laptop
  met the phone, then the phone the tablet with the laptop off, the tablet
  did not know the laptop; worse, depending on which device started, a
  change could be overwritten by an older version or a deleted document come
  back, because a device merged with each other device against what it had
  agreed with the last one. Each device now keeps what it agreed with each
  other device, deletions carry the content deleted, and the devices pass on
  the devices they know (*last seen …, according to Phone*).

- Review mode, page by page: two pages side by side were pushed to the
  right and cut off, and the rulers were drawn over them at a wrong scale.
  The pages are now centred, without rulers, and have the paper and the
  margins of the document (A4…) instead of always US Letter.

- Merged cells of a table holding a code cell were lost in the exports.

- A document saved in the browser could not be found again: it now appears
  in the recent files (reopened from the browser's storage, as it is now),
  and the start screen has an **🗄️ In this browser** card (FILE-031).

- **Sync my devices**: a device renamed is shown under its new name on the
  other devices at once (when online), not only at their next meeting
  (DEVSYNC-008).
- **Sync my devices** says what it synchronises — the documents kept in
  the browser, not the recent files of the disk — how many, and opens them.
  A document saved as a file was never synchronised: once a device is
  paired, **Save** asks whether to keep it in the browser (synchronised) or
  as a file, and **Add recent documents…** copies recent ones among the
  synchronised documents (DEVSYNC-007).
- **The width of the columns of a spreadsheet** can be changed: dragged at
  the edge of a column header (a double click fits the content), or typed
  (**Column width…**) for the columns selected; an empty column keeps its
  width in an ODS file (SHEET-026).
- **Sync my devices**: on the paired device, the request of the new device
  (its name and four emojis) came below the invitation, out of sight; it now
  comes at the top of the window, scrolled into view, Accept focused (and a
  short vibration on a phone).
- **A spinner for every long operation** (UI-019): saving and exporting,
  opening the template gallery on a folder, the lists of Git, WebDAV,
  Grist and Zotero, a template source, searching a folder, the graph of the
  notes, backups and restores, the assistant preparing its answer, a mail
  merge, the first search and the print of a PDF, the print preview, the
  synchronisation of devices and the wait for QRShare. A status text of work
  in progress (ending with “…”) now always turns a spinner before it.

- QRShare did not recognise the pairing QR code of **Sync my devices**
  (`pwo-sync:…`, not a link): the invitation is now a link to the
  application, which opens ready to pair. The command palette has *Sync my
  devices now*, *Add a device: show an invitation QR code* and *Pair this
  device: scan an invitation QR code*.
- **Sync my devices**: an invitation opened on a device already paired was
  ignored behind a small message, and **Sync now** then seemed to do
  nothing; the device now offers to join the invitation instead, Sync now
  says what it does under the button, the invitation explains what to do on
  the new device, which is named before pairing (a phone gets its model as
  first name when the browser tells it).
- **Sync my devices**: devices that could not connect directly (a phone on a
  mobile network and a computer on Wi-Fi…) never met, the synchronisation
  never falling back on the relays as collaboration does; it now does after
  about ten seconds. The window shows the network (relays reached, direct or
  through the relays) and a fingerprint of the pairing, the same on every
  device paired together.

- A private repository added as a source of templates (**Templates and
  examples → ＋ Source…**) could not be read without an account of its site:
  it now asks for a token allowed to read it, checked on the repository
  (FILE-030).
- The "Instrument panel" example failed in Python: the marimo stand-in of
  the sandbox raised `NotImplementedError` when a library probed
  `marimo._runtime` (it now raises `ImportError`, as for a missing module).
- Code cells running side by side no longer open several "Download code
  for this document?" windows at once, one hiding the other: the question
  is asked once per site, one at a time (CODE-016).

### Added

- A token per repository (GIT-018): of several accounts of the same site
  (fine-grained tokens, tokens of a project), a repository opened by its
  address is opened with the one that has access to it — the one used last
  for it, else the first that may write in it — and the choice is
  remembered.
- Reminders of events (NOTIF-001): a reminder chosen in the window of an
  event (alarms of imported or synchronised calendars kept), notified once
  by the system and in the application while it is open, a click opening
  the event; turned on, with the reminder of new events, in **Settings →
  General**.
- Vaults of passwords (VAULT-001..VAULT-004): a `.kdbx` file — the open
  format of the password managers of every system — opens as a document:
  groups, entries, passwords shown only when asked and copied to the
  clipboard for 30 seconds, one-time codes (TOTP), a password generator, a
  check against known breaches by k-anonymity after consent; opened by its
  master password, or by the lock of the application; saved in the same
  format. *New password vault…* makes one.
- Locking the application (LOCK-001..LOCK-005): with a passkey (or a
  passphrase), set in **Settings → Security**; nothing is shown before it
  is opened, and what the browser keeps — documents, recent files, drafts,
  versions, templates, accounts and their passwords — is encrypted with a
  key the passkey's secret opens, a recovery key shown once opening it too;
  locked again after a delay without use.
- SQLite databases as documents (DB-001): a `.sqlite` / `.db` file opens
  with its tables, rows changed in a grid, its structure, and SQL to run
  (a `.sql` file too, such as the SQL of a data model); saved back as a
  SQLite file. *New SQLite database* makes an empty one. **Conceptual
  data model** reads the conceptual model back from the tables (DB-005).
- Data models (DB-002..DB-004): a `.mcd` file holds a conceptual model
  written as text — entities, identifiers, associations and their
  cardinalities — drawn as a diagram as it is typed; the logical model is
  derived from it (primary and foreign keys), and the SQL of the tables for
  SQLite, PostgreSQL or MySQL, saved as a `.sql` file to run. *New data
  model…* in the command palette starts from an example.
- Views of the notes (NOTE-003): a `.view.yaml` file of the folder shows
  notes as a table, cards or a board of columns by a property, filtered and
  sorted; a cell changed or a card moved writes the property into the note.
  *New view of notes…* in the command palette makes one; its format is a
  JSON Schema (`notes-view-1.schema.json`).
- *Home* in the command palette goes back to the start screen (UI-024).
- The notes of the folder queried in SQL (NOTE-002): from a SQL cell of a
  note or a `.sql` file of the folder, the tables `notes`, `props`, `tags`,
  `links` and `tasks`, and `prop(path, key)` — the people of an
  organisation, the tasks still to do, the notes linking to another.
- The interactions with a contact (CONTACT-006): its card shows the events
  it attends and the daily notes and notes naming it, dated, with when you
  first met and were last in touch; **Add an interaction** writes a meeting,
  a call, an e-mail or a message as a line of the daily note of its day.
- Tools for AI agents over the calendar and the contacts (CAL-007,
  CONTACT-007): an agent reading your e-mail can note the interactions, keep
  the contacts and create events.
- A daily note begins with its date as a title, in the words of your
  language and region or in a format you set (FOLDER-027).

- The calendars and address books of a CalDAV / CardDAV server (Nextcloud…)
  kept in step with the event and contact notes, both ways (CAL-006,
  CONTACT-005): found from a Nextcloud / WebDAV account, synchronised when
  asked and when the calendar or the contacts open; what the server holds
  besides the fields of the notes (reminders, photos…) is kept, and an item
  changed on both sides is kept as a copy tagged #conflict.

- Contacts (CONTACT-001..CONTACT-004): people kept as notes of `People`
  (e-mails, phones, organisation, birthday…), searched by name, e-mail,
  organisation or tag; the card of a contact shows the events it attends
  and the notes linking to it, its birthdays are in the calendar, and vCard
  files are imported and exported.

- A calendar (CAL-001..CAL-005): the events of a folder, each a note of
  `Events` with its fields in the front matter, shown by month, week, day
  or agenda, coloured by calendar; created with a click on a day or an hour,
  moved by dragging, changed in a window (repeat, location, attendees as
  links to their notes); the date of a day opens its daily note, which lists
  the events of the day. iCalendar files imported and exported.

- Code cells in any language (CODE-020): Bash, PowerShell, Julia, the most
  used languages of the TIOBE index (Java, C#, Visual Basic, Rust, Fortran,
  Go, Delphi, PHP, assembly, Ada, Swift, COBOL…) and formats such as JSON,
  YAML or LaTeX — shown in colour and written with completion, without Run;
  kept in Markdown as ```` ```bash {cell} ````.

- How PWO and DigitalSignalix work together (docs/digitalsignalix.md): one
  format for PWO plugins and the apps of the screens, sending slides to the
  screens, provenance, the exports planned (PLUG-009, PLUG-010,
  PRES-017..PRES-022, SIGN-001..SIGN-005). The formats are published as JSON
  Schemas (draft 2020-12) at `https://progressive-web-office.github.io/schemas/`:
  `plugin-manifest-1`, `plugin-registry-1`, `plugin-message-1` and
  `provenance-1`, the examples of the documentation tested against them.

- Daily notes from a calendar (FOLDER-027): the month of the folder with a
  dot on each day that has its note, a click opening or creating it, and
  📅 for today's note — named `YYYY-MM-DD` by default in `Daily notes`,
  with a front matter of properties (timestamp, year, type, tags #daily…),
  or in the format, the folder and from the template you set; also *Calendar of the notes* and
  *Today's note* in the command palette, even with no folder open.

- Backlinks at the bottom of the note's page (FOLDER-026), or in the side
  panel: sorted by name or latest changed, with or without the words around
  each link, folded; and the unlinked mentions of the note — its name or an
  alias written without a link — each made a link in one click.

- **Go to file…** (FILE-032, `Ctrl+Shift+O` or the command palette): a
  document kept in the browser, or of the folder open, opened by typing part
  of its name or of its folder; the latest first, each under its folders —
  their start and end always shown, the middle cut when the path is long.

- The front matter of a Markdown note shown as a card of properties above its
  page (NOTE-001): tags as coloured chips, `[[links]]` to follow, dates,
  yes/no and numbers, each changed in place and written back in its order;
  or shown to read only, or as YAML to change at once.

- **Dark paper** for documents (UI-023): *View › Paper of documents* (or
  the settings) shows a text document as the theme of the application (by
  default), on white paper, or as light text on dark paper for reading at
  night — the colours of the text kept recognisable, pictures, drawings and
  diagrams in their own colours. On screen only: printing, the PDF and the
  files keep the document's colours.

- **PDF typeset in the browser** (PDF-020): *Save as › PDF (.pdf), typeset*
  writes a text document as a PDF at once, without the print dialog — by
  Typst, compiled to WebAssembly and downloaded once (about 11 MB, after you
  agree) then kept offline. Fonts embedded (with the widths of Calibri,
  Arial, Times New Roman, Courier New and Cambria), selectable text, working
  links and cross-references; the page, header and footer, tables,
  pictures, footnotes, equations, table of contents, columns, code cells
  and bibliography kept. The document never leaves the device.

- Three more examples of the anywidget instruments, one per family:
  **Automation panel** (a PID loop tuned with knobs, its step response and
  faceplate; a PackML state machine driving a stack light), **Flight
  instruments** (the basic six) and **Car dashboard** (speedometer, rev
  counter, gear, gauges, tell-tales). **Instrument panel** gains a process
  line (pump, valve, mixer, stack light); the *Interactive widgets* example
  points to all four.

- Rulers shown or hidden **each on its own** (DOC-054): *View › Horizontal
  ruler*, *View › Vertical ruler*, the command palette or the settings. The
  **unit of measure** (mm, cm, inches, points) is the one of the page size:
  chosen in the page setup, the View menu or the settings, it is used by the
  page setup, the paragraph indents and the rulers' graduations.

- Named paragraph styles (DOC-053): **🅰 Styles…** makes a style from the
  look of a paragraph (font, size, colour, bold, italic, alignment,
  spacing, indents, line spacing), changes, renames and deletes it; the
  styles of the document are in the list of paragraph styles, and changing
  one changes every paragraph using it. Saved and read back as the named
  styles of OpenDocument and Word (those made in LibreOffice or Word are
  read too), and shared in real-time collaboration.

- Backups made by themselves while the application is open (BACKUP-006),
  to a folder or a Nextcloud / WebDAV account, as often as every hour.

- Templates synchronised between one's devices (DEVSYNC-012): saved,
  changed or deleted on one device, they follow on the others, as files of
  the folder `Templates` of the synchronised documents.

- Drawings and paintings zoom with the wheel where the pointer is, pan with
  the middle button, and on touch screens pinch and pan with two fingers;
  a component of a schematic is dragged from anywhere inside it, not only
  from its lines (DRAW-018, DRAW-019).

- A guide page, [Where are my documents?](docs/guide/where.md), comparing
  files, browser storage, sending, collaboration, Git, the cloud,
  synchronising devices and backups, with what to choose; linked from the
  start screen.

- Documents of this browser and history of synchronisations (DEVSYNC-011):
  each document with its state on the other devices (✅ the same, ⬆️ only
  here, ⬇️ there and not here yet), the trash, and a timestamped history of
  the synchronisations; **🔁 Sync** is now a button of its own in the header,
  marked while another device is online. Button icons are now shown.

- Step response and poles and zeros (TEACH-006), next to the Bode and
  Nyquist plots: final value, overshoot, rise and settling times, open loop
  or closed loop with unity feedback.

- Exam mode (TEACH-005): **🔒 Exam mode…** in the settings locks this browser
  for a test — no network, no AI, no pasting from outside, a log of leaving
  the window — until the teacher's code is typed. A deterrent, not a lockdown
  browser: the guide says how to combine it with a kiosk.

- Bode and Nyquist plots (TEACH-004): **📈** draws the frequency response of
  a transfer function such as `K/(s(1+s)^2)`, with its gain and phase
  margins, and inserts the plots as SVG pictures.

- Quiz export (TEACH-003): **📝 Export the quiz…** saves the questions of a
  document — answers as ticked check boxes, short answers as text fields —
  as Moodle XML, GIFT or an Auto Multiple Choice (AMC) LaTeX source.

- Comparing two versions of a document (DOC-052): **⇆ Compare with another
  version…** turns the differences with another file (older or newer, any
  text format) into tracked changes, word by word, to accept or reject.
  Accepting a deleted paragraph now removes the paragraph too.

- Revoking one device only (DEVSYNC-010): **⛔ Revoke** next to a device makes
  a new key and gives it, encrypted for each, to the other devices online
  that accept; the revoked device no longer synchronises.

- The trash of synchronised documents in a window (DEVSYNC-009): **🗑 Open
  the trash** in *Sync my devices* lists deleted and replaced documents by
  day, to restore one (the other devices get it back) or delete it for good.

- Slide layouts and alignment guides (PRES-015, PRES-016): **+ Layout ▾**
  adds a section header, two contents, comparison, title only or blank
  slide; dragged shapes snap to the edges and centres of the other shapes
  and of the slide, with guide lines (Alt to place freely).

- Presenter view (PRES-014): **🎤** starts the slideshow with a console in a
  second window — current and next slide, speaker notes, timer and clock —
  moving with the slideshow; alone in the window to rehearse when pop-ups
  are blocked.

- Conditional formatting in spreadsheets (SHEET-029): **🎨 Conditional
  formatting…** colours cells compared with a value, containing a text,
  duplicated or unique, above or below the average, among the highest or
  lowest, on a colour scale or with data bars; kept in XLSX and ODS files.

- Data validation in spreadsheets (SHEET-028): **☑ Data validation…** limits
  cells to a list of values (picked from a drop-down, or with Alt+Down),
  whole numbers, numbers, dates or texts of some length; a message while the
  cell is selected; a wrong value refused, asked about or only told; values
  not accepted marked with a red corner; kept in XLSX and ODS files.

- The fill handle of spreadsheets (SHEET-027): drag the corner of the
  selection to continue a series — numbers, dates, "Item 1", days, months,
  formulas with their references moved — double-click it to fill down as
  far as the data beside, or press Ctrl+D / Ctrl+R to copy down or right.

- Every built-in template can now be made from the interface: a button to
  rename a sheet (✎), a **+ Title** button for title slides, and in the
  document Insert group a line break (↵) and a grid of special characters
  (Ω, searched by name) (DOC-051). CONTRIBUTING asks that a new template
  only use what the interface can make.

- **Lines of drawings**: arrows at either end and right angles changed on
  a line already drawn, and **bends** — a double click on the line adds one,
  drag it to move it, a double click removes it — for the loops of a GRAFCET
  or a flowchart (DRAW-017).
- **Layers in the painting editor** (DRAW-013..DRAW-016): painted and
  vector layers — shown or hidden, see-through, reordered, merged, renamed —
  where lines, rectangles, ellipses and texts stay shapes to move and
  restyle; pictures imported as layers; a background of a colour,
  transparent or a picture; crop to the selection, quarter turns, any angle,
  flips, a layer turned; gradients (linear, radial, conic, every hue) and a
  grid; transparency kept and shown. A picture with layers is saved as
  **OpenRaster** (`.ora`, read by GIMP, Krita, MyPaint), with a flattened
  PNG on demand. A new example: **Poster in layers**.
- **The properties of the fields of a PDF form** (FORM-005): drawing a
  field, or choosing *Field properties…* on any field, opens a window like
  that of PDF form applications — tooltip, required, read only, value by
  default, choices (another value allowed, sorted), maximum number of
  characters, one box per character, alignment, size of the text, and a
  format: number, whole number, date, e-mail, phone, or a regular expression
  with its message, tried in the window. Written in the file as PDF readers
  read them (with the standard JavaScript actions), and checked while filling
  the form here.

- **Moving notice** (BACKUP-006): the application moves to
  <https://progressive-web-office.github.io/progressive-web-office/>. At the
  former address, the start screen announces the new one and offers a
  backup, to restore there: the browser keeps documents per site.
- A **plugins proposal** (docs: *Plugins (proposal)*, PLUG-001..PLUG-008):
  content packs first, then sandboxed code plugins, distributed through a
  registry of Git repositories.
- **Templates in your own repository or cloud** (FILE-030): a Git repository
  (or a folder of one) or a Nextcloud / WebDAV folder added to the gallery
  with **＋ Source…**; its documents are templates, in their own tab, read
  when chosen; a template opens as a new document.
- **Drawings and pictures in the template gallery** (FILE-018): an
  electrical circuit, a ladder diagram, a Grafcet, a pneumatic circuit and a
  flowchart, editable at once; graph paper, a colour wheel and a pixel-art
  canvas made by the application (CC0), ready to paint.
- **IEC 61131-3 graphical languages** in the drawing editor (DRAW-012):
  ladder diagram (rails, contacts, coils), function block diagram (TON,
  TOF, TP, CTU, CTD, CTUD, R_TRIG, F_TRIG, SR, RS, arithmetic and comparison
  blocks, a generic block) and sequential function chart / Grafcet (steps,
  transitions, actions, AND / OR divergences and convergences, jumps).
- **Fields changed with a click** (DOC-050): what a field shows, the format
  of a date or a time (short, medium, long, full, ISO), today's or a fixed
  date, with a preview; kept in Markdown (`{date:full=2025-12-24}`),
  OpenDocument and Word.
- **Commits made by the application in a Git working copy** (GIT-017), with
  isomorphic-git, in the browser: Save offers a commit (message, files),
  the ⎇ branch menu commits the document or all the changes and shows the
  local history of a document (compare, open, restore as a new commit);
  the repository's own author name is used. New runtime dependencies:
  `isomorphic-git` (MIT) and `buffer` (MIT, the Node Buffer it needs),
  loaded only when a working copy is opened.
- **Gitea and Forgejo** (GIT-016): Codeberg, self-hosted and local-network
  forges, as GitHub and GitLab — accounts with a token, addresses
  (`…/src/branch/main/…`) understood, open, commit, branches, pull requests,
  history, collaborators, a repository as a folder.
- **Git working copies on disk** (GIT-014): a folder that is a Git working
  copy shows its branch in the folder panel; documents are saved in place
  for your own Git tool to version.
- **New documents in a folder or a repository** (GIT-015): the folder panel
  creates a text document, a spreadsheet, a presentation or a drawing in the
  format family chosen — in a repository opened as a folder, as a commit.
- **Repositories and servers used** (FILE-028): the repositories opened or
  committed to and the WebDAV / Nextcloud folders used are listed on the
  start screen, to open them again in one click (a repository even for
  reading without an account) or forget them, one by one or all at once;
  remembering can be turned off in the settings.
- **Where a document comes from** (FILE-029): a document opened from or
  saved to a repository or a server keeps its address — with its recent
  entry, and in its properties (*Source*) for OpenDocument, Microsoft Office
  and MDZ files — so that, opened again from the recent files or from a copy,
  **Save** writes it back to the same place; **✕ Detach** unties it; a
  setting turns it off.
- **Netlist and bill of materials** of electrical schematics (DRAW-009): a
  SPICE netlist (nets joined at T junctions, earth as 0, named terminals,
  SPICE values and default models) and a CSV bill of materials grouped by
  component and value.
- **Bitmap painting** (DRAW-008): pencil, brush, eraser, fill bucket, lines,
  rectangles and ellipses (filled or not), text, colour picker, selection
  moved with the mouse or the arrows, copy, cut and paste, canvas resized,
  undo and zoom — for a new picture or any PNG, JPEG or WebP picture.
- The start screen offers **New drawing or schematic** (.svg) and **New
  painting** (.png); SVG and bitmap pictures opened in the application have
  **Edit the drawing** and **Paint on the picture** buttons and are saved
  back; text documents insert a new painting or paint on their pictures.
- **Drawings and schematics** (DRAW-001..DRAW-007, DRAW-011): a vector
  drawing editor for text documents — rectangles, ellipses, lines, arrows,
  freehand, text; colours, thickness, dashes; grid and snapping; select,
  move, align, bring to front, duplicate, undo — with **symbol libraries**:
  electrical and electronic (IEC 60617), logic gates (IEC and ANSI), block
  diagrams, pneumatic and hydraulic (ISO 1219), flowcharts (ISO 5807).
  Wires snap to the pins, are drawn in right angles, stay connected when a
  symbol moves, turns or is mirrored, and get junction dots; symbols are
  numbered (R1, C1, Q1…) and their values written with units (`4k7` →
  `4.7 kΩ`). Drawings are saved as SVG that open again editable (a double
  click), as are SVG pictures made elsewhere; export as SVG or PNG; a list of
  named objects and keyboard moves for accessibility. Drawings go on slides
  too; Word documents get a PNG version beside the SVG (read back as SVG),
  LaTeX projects a PNG for `\includegraphics`.
- **Physical quantities and dimensional analysis** in spreadsheets
  (UNIT-001..UNIT-004): type `12 mm`, `3.5 kN`, `9.81 m/s²`; formulas compute
  with the units (`12 mm + 3 m` → `3012 mm`, `2 kN × 0.5 m` → `1 kN·m`) and
  refuse what makes no sense (`#UNIT!` for a length plus a time); SUM, MIN,
  MAX… of quantities; `CONVERT` as in Excel, `QTY` and `UNIT`; *Number format
  › Unit…* converts cells; units kept in XLSX, ODS and CSV, shown by other
  spreadsheets.
- **History of a document in its repository** (VER-002, VER-003): the
  commits that changed it, each compared with the one before or with the
  document as it is now, opened, or restored by a new commit; **comparison
  of versions** (VER-001): lines added, removed, changed word by word, or the
  cells changed in a workbook — also for the versions kept in the browser.
- Documentation of Git accounts rewritten: what needs a token, creating a
  personal access token forge by forge (GitHub fine-grained and classic,
  organisations and SSO, GitHub Enterprise, gitlab.com scopes and roles,
  project access tokens, self-managed GitLab), and what to do when something
  goes wrong; the token help in the application links to it.
- Git repositories (GIT-013): their visibility (🌐 public, 🔒 private, 🏢
  internal) and what it means, your role and whether you can save there,
  and the collaborators with their roles; a file opened from a repository
  shows the repository as a folder with its tree, and **📁 Open the
  repository as a folder** opens it without a file.
- **Syncing my devices** (DEVSYNC-001..DEVSYNC-005): the documents kept in
  the browser copied between one's own devices, peer to peer and end-to-end
  encrypted, paired with a secret code or a QR code; warnings first
  (synchronisation is not a backup, a deletion reaches every device, not for
  collaboration); conflicts kept twice, deletions and replaced versions to a
  trash kept 30 days; synchronising on demand or by itself; a new code
  revokes the other devices.
- **Backups** of what the browser keeps (BACKUP-001..BACKUP-005): its
  storage's files, recent files, drafts, templates and versions, in dated
  archives encrypted with a password (AES-GCM, PBKDF2), downloaded or written
  to a folder or a Nextcloud / WebDAV account, kept for 7 days then weekly
  for 8 weeks; reminders every day, week or month; **💾** in the header shows
  how old the last backup is; restoring all or file by file, next to the
  existing files unless they are replaced. The difference with
  synchronisation and the 3-2-1 rule explained.
- Colours for print (COLOR-001, COLOR-002): a colour dialog (**⋯** next to
  the colours of documents, spreadsheets and presentations) with swatches,
  recent colours and the hexadecimal, RGB and CMYK values; a warning for
  screen colours a printer cannot print, with the printable one, and for
  more than 300 % of ink; *View › Print colours (CMYK preview)*. LaTeX keeps
  text colours and highlights (xcolor), CMYK included on import.
- Text in **columns** (DOC-049), for newsletters and school newspapers:
  ▥ *Columns…* sets the selected paragraphs in two to six columns, with
  their gap and an optional line between them, changed again or removed
  from the context menu; **column breaks** (Ctrl+Shift+Enter). Kept in
  ODT (sections with columns), DOCX (continuous sections), LaTeX
  (`multicols`) and Markdown (`::: {.columns}` fenced divs), on screen and
  in print. A **Newspaper** template.
- Zotero (BIB-010): search the Zotero library from ❝ and cite what is
  found (its sources join the document's, with their citation keys), or
  import a whole collection from 📚 — with an API key kept only in this
  browser, its creation explained step by step.
- A **scientific article** template (BIB-011): A4 with 2.5 cm margins,
  authors and affiliations, abstract, keywords, numbered equation, captioned
  table, citations and references.
- Typography after TeX (DOC-048): paragraphs broken as a whole, balanced
  headings, hyphenation in the document's language (*View › Hyphenation*),
  kerning and ligatures, no widows or orphans on paper; **small capitals**
  (Ctrl+Shift+K), kept as `\textsc`, `[…]{.smallcaps}` and in ODT/DOCX.
- Graduated rulers around the page (DOC-047): the horizontal one, in cm
  (inches in the United States) from the paper's edge, with margins and
  paragraph indents to drag or move with the arrow keys; the vertical one
  with the end of each page's text marked. *View › Rulers* hides them.
- The page of a document (DOC-046): paper, orientation and margins, set in
  **Page setup** (formerly *Header and footer*) and kept in ODT, DOCX, LaTeX
  (`geometry`) and Markdown (`papersize`, `geometry`). The page on screen is
  the page on paper — its width, its margins, a line where each page's text
  ends — so that a vertical spring visibly reaches the foot of the page and a
  page break starts the next one; printing uses the document's paper.
- Springs and spaces open a dialog by a double click: a spring's **share of
  the free space in percent** (worked out as a weight from the other springs
  of its page or line), a space's height in cm, mm, pt or **% of the page
  height** (`\vspace{0.3\textheight}`, kept in ODT and DOCX) (DOC-042).
- What templates use can be changed again (DOC-045): what a field shows,
  the depth of a table of contents, paragraph spacing from the context menu,
  any number format code of a cell (*Other format…*, and the current one
  shown), the background of a slide and the vertical alignment of a text box.
- Pictures of a document can be retouched (IMG-001): crop, turn, mirror,
  brightness and contrast, size, and **blur a region** (a face, a name)
  before sharing; nothing changes until applied, and it can be undone.
  Arrows, highlights and text can be drawn on it (IMG-004).
- Editing modes (DOC-044): visual editing, the **source** of a Markdown or
  LaTeX file in colour beside a live preview, and **reading** (no toolbar,
  nothing changed by mistake); the mode is remembered per kind of document.
- Spreadsheets: about 90 more functions — `IFS`, `SWITCH`, `COUNTIFS`,
  `SUMIFS`, `AVERAGEIFS`, `MAXIFS`, `INDEX`, `MATCH`, `XLOOKUP`, `TEXTJOIN`,
  `SUBSTITUTE`, `FIND`, `LARGE`, `RANK`, `PERCENTILE`, `EDATE`, `DATEDIF`,
  `NETWORKDAYS`… — written under the names Excel and LibreOffice expect
  (SHEET-025).
- Links containing a document can be protected by a password: the document
  and its name are encrypted in the link (AES-GCM, PBKDF2), the password
  asked when it is opened (SHARE-014).
- Git: the repository and branch in the header of a document opened from a
  repository start a new branch for the next commits, or open a pull / merge
  request to the default branch (GIT-007).
- TextBundle packages (`.textpack`) open as text documents: `text.md` with its
  pictures, the other Markdown files of `assets/` left aside (MD-011).
- PDF: the signature can be remembered on this device, only when the box is
  ticked, then placed in one click or forgotten (PDF-014).
- Git: open or save by pasting a repository address (`https://github.com/owner/name`,
  links to a branch, folder or file, GitLab groups, self-hosted sites, SSH
  clone addresses); the service, repository, branch and path are deduced and
  the matching account used, or the add-account form opened pre-filled (GIT-008).
  **Open a folder** accepts a repository address too (FOLDER-007).
- Forms in the word processor (FORM-003): text, check box and drop-down list
  fields, named and optionally required, filled where they stand; kept as
  OpenDocument input/drop-down fields, Word content controls, Markdown
  bracketed spans (`[answer]{.input name="…"}`) and HTML controls.
- Compiling form answers also reads ODT, DOCX and Markdown forms, and can
  send the answers to a Grist table — created with typed columns, or
  completed, files never sent twice (FORM-004).
- Git: step-by-step help to create a personal access token with the least
  rights, linking to the token page of the site (GIT-009).
- Git: saving to a repository proposes a text format Git can compare
  (`.md`, `.tex`, `.csv`) before binary ones, with a Format list and an
  explanation; binary formats stay available (GIT-010).
- Forms (FORM-001, FORM-002): **design a PDF form** by drawing its fields on
  the pages — text, paragraph, check box, drop-down list, option buttons —
  named, required or not, renamed or removed; saved as real AcroForm fields.
  **Compile form answers** gathers the filled copies (picked, or the PDF
  files of the open folder) into a new spreadsheet: one row per file, one
  column per field.

- Command palette in sight and complete (UI-022): a **⌘ Commands** button
  in the header and a round button on a phone (the palette then full screen);
  the commands folded in the toolbars' menus (Insert, Share…) and those of
  the context menu (fields, springs, table) are listed too, as
  "Category: Action", and with nothing typed the palette lists them all by
  category.

- Springs and spaces (DOC-042), as in LaTeX: vertical springs (`\vfill`)
  share the free height of the page, horizontal springs (`\hfill`) the free
  width of a line, in proportion to their weight; fixed vertical spaces
  (`\vspace{2cm}`). Inserted from the Insert menu or the context menu, or
  typed as in LaTeX; worked out again before printing; kept in Markdown and
  LaTeX as such, in OpenDocument and Word as the space last shown (marked by
  their styles, so that they come back as springs).

- Fields (DOC-041): date of the day, time, page number, number of pages,
  title, author and file name, computed when the document is shown, printed
  or opened; written as real fields in OpenDocument and Word, as `{date}`…
  in Markdown and `\today`, `\thepage`… in LaTeX, and read back from all of
  them. Inserted from the Insert menu or the context menu; a field can be
  replaced by its value. The letter template is dated by a field.

- Context menu in documents (UI-021): a right click, a long press on a touch
  screen or the ⋮ Actions button shows what can be done there: cut, copy,
  paste; open, edit or remove a link; rows and columns of a table; run, edit,
  hide or delete a code cell; insert a code cell, a table of the size picked
  in a grid, a picture, an equation, a link, a note, a comment. On a phone it
  is a sheet at the bottom of the screen. Typing ```` ```lua ```` (or another
  language) then Enter starts a code cell in that language.

- Projects (CODE-019): a code file opened from a folder runs with the other
  files of its project (its folder, or the folder above holding `pwo.toml`,
  `pyproject.toml`, `package.json`…): Python and Lua modules, JavaScript and
  TypeScript imports, C/C++ sources and headers compiled together, R
  `source()`, SQL `.read`/`.open`, and the data files, read from the working
  folder. `pwo.toml` may name the entry point, its arguments, the compiler
  options and sources, and a standard input. C/C++ programs now read files.

- A *Languages* example (FILE-018): a small program in Python, JavaScript,
  Lua, SQL, C, C++ and R, ready to run.

- Lua, SQL, C, C++ and R (CODE-018): `.lua`, `.sql`, `.c`, `.cpp` and `.R`
  files and cells run with a runtime downloaded the first time, after the
  user agreed: wasmoon, sql.js and Clang/LLD (YoWASP) from the npm CDN,
  checked against their SHA-256 and kept for offline use; webR in a sandbox
  of its own that may only reach the webR sites, plots included.

- marimo notebooks (DOC-039): a marimo `.py` file opens as a document (text
  cells, reactive Python cells), runs here with a small `marimo` stand-in, and
  saves back as marimo reads it. A Python file importing a package missing
  offline offers to download it and run again.

- KaimonSlate notebooks (DOC-038): a `.jl` file of `#%%` cells opens as a
  document (text cells, Julia code cells with their headers) and saves back
  unchanged where it was not edited.

- Running source files (CODE-017): a `.py`, `.js` or `.ts` file opened in the
  code viewer runs (whole or selection) in the code-cell sandbox, with its
  output, errors and figures below the code.

- Dropping several files or a folder (FILE-027) opens them together in the
  folder panel (a dropped folder is writable where the browser allows it),
  the first document shown; before, only the first file opened.

- Snippets (DOC-037): `;;name` or *Text › Snippets…* inserts Markdown with
  fields (date, time, title, clipboard) and places to type visited with Tab;
  built-in, personal and folder (`Snippets/`) snippets.

- Mail merge (DOC-036): `{{Field}}` placeholders filled from the rows of a
  CSV, TSV or workbook, giving one file per row (ZIP or the open folder) or
  one document with a page per row.

- Markdown extras (MD-019): `==highlight==`, and callouts (`> [!NOTE] Title`)
  drawn as coloured boxes and kept as written.

- Note identifiers (FOLDER-024): new notes named and marked with the date and
  time, and `[[202410031530]]` links by identifier. The file explorer can
  offer several kinds of new files.

- Tags shown as tags in the notes of a folder, with colours chosen in the
  folder panel (FOLDER-023).

- Branches and pull requests for a Git repository opened as a folder
  (FOLDER-022): work on a new branch, open another one, and propose the
  changes of a branch as a GitHub pull request or a GitLab merge request.

- Completion in the notes of a folder (FOLDER-021): `[[` lists the notes to
  link to, `#` the tags already used.

- Templates kept in a folder (FOLDER-020): the documents of its `Templates`
  folder are offered first in the template gallery, and *Save as template…*
  can keep a new one there instead of in the browser.

- Related notes beside the open note: sharing its tags or linked with it
  (FOLDER-019).

- Tags of the notes of a folder (FOLDER-017): front matter `tags` /
  `keywords` and `#tags`, counted in the panel, searched with `#tag`,
  renamed in every note; a graph of the links between the notes (FOLDER-018).

- Git repositories as folders (FOLDER-007): *Open a folder* lists the GitHub
  and GitLab accounts; a branch of a repository opens in the explorer, each
  change (saving, creating, renaming, moving, deleting) being one commit; the
  tree is read in one request; a file changed meanwhile is not overwritten.

- The start screen offers the last five folders opened, not only the last
  one (FOLDER-015); the explorer collapses all its folders and shows the
  open document on request (FOLDER-016).

- File explorer: context menu (right click, Menu key, Shift+F10) with every
  action on the selection (FOLDER-013); copy, cut and paste with Ctrl+C/X/V
  and duplicate (FOLDER-012); download a file, or folders and several
  entries as a ZIP archive, and copy their paths (FOLDER-014).

- Example *Instrument panel* (CODE-016, FILE-018): the anywidget instruments
  installed from their published wheels, knobs and a switch driving a tank, a
  gauge, a thermometer, a LED and a display.

- Example *Interactive widgets* (CODE-016, FILE-018): a reactive Python
  slider (anywidget) driving a plot, and a widget written in a JavaScript
  cell.

- Widgets in code cells (CODE-016): anywidget widgets from Python (anywidget,
  ipywidgets, comm and psygnal bundled; ipywidgets boxes, grid and layouts)
  and from JavaScript cells (`widget`, `display`, `ui`, `importWidget`), each
  in an isolated frame, synchronised both ways; `pwo.ui` re-runs the cells
  using a widget when it changes; `pwo.install` installs wheels from a URL, a
  `wheel.txt` list or the package index after the user allowed the site;
  widgets are kept as pictures when saving and printing. Works with the
  anywidget instruments.

- Dependency graph of the code cells (CODE-015): *View › Dependencies of the
  cells* or 🔀 on a cell shows the cells, coloured by state, and the names
  linking them; a click goes to the cell; also given as a list.

- Reactive code cells (CODE-014): cells run in the order of the names they
  define and use; changing or running a cell marks the cells using it as out
  of date (or runs them, as chosen in *Settings › Writing*); JavaScript cells
  share their top-level names like Python cells; a name defined in several
  cells and cycles are reported; names no cell defines any more are removed.

- File explorer: size and date of each file, sorting by name, date, size or
  type (remembered), files found by name in the folder search (FOLDER-008);
  keyboard navigation in the tree (FOLDER-009); importing files and folders
  of the device by drag and drop or with 📥 (FOLDER-010); selecting several
  entries to delete or move them together, and undoing the last deletion
  (FOLDER-011).

- The code of a cell can be hidden (one cell, or every cell from the View
  menu): only its output is shown, printed and exported; Markdown keeps it
  with `{run hide}`.
- The TypeScript language service for TypeScript and JavaScript files and
  JavaScript cells: typed completions with documentation, errors underlined,
  types under the pointer; loaded on first use, then kept offline.
- Code completion: in code cells (now a real code editor with highlighting,
  indentation and closing brackets) and in source files — keywords,
  built-ins, names of the code, JavaScript/TypeScript standard objects; in
  Python cells, once Python has run, the interpreter's names (variables of
  earlier cells, module members) with signatures and documentation.
- A spinner while waiting: the collaboration looking for the others or
  receiving the document, a code cell running, a long operation.
- Real-time collaboration between devices that cannot connect directly (a
  company network and mobile data, for example): after 15 seconds alone,
  the session also goes through the relays, encrypted with the secret of the
  invitation.
- What QRShare or the share sheet hands over is checked before it opens: a
  file the app opens, whose content is what its name says, shown with where
  it comes from (QRShare address, name, size, format) and opened only when
  confirmed.
- *Receive from another device* opens QRShare's scanner that recognises a
  static QR code (an invitation link) as well as animated ones.
- The collaboration bar tells where the connection is (relays unreachable,
  looking for the others, receiving the document) and what to check after 20
  seconds alone; relays and a TURN server can be set in the settings;
  participants introduce themselves and another app or version is flagged.
- A click on the name of the open file renames it, keeping its extension;
  in a folder or an archive the file is renamed there.
- Settings window (⚙), by category: general (language, theme, your name,
  formats of new files), reading and review (pages side by side, zoom,
  page by page, open PDF files or documents in review mode, remember the
  toolbar's last choice or not), writing and printing.
- The About window names the author.
- Review mode for PDF files too (📖 Review mode, Ctrl+Alt+R, or *correction*
  in the command palette): highlight and note tools named, form tools
  hidden, the annotations panel shown with how to annotate.
- The command palette shows the keyboard shortcut of each command that has
  one, and lists the review mode (also for read-only documents) and the
  review actions with their keys; it is wider, in three columns (command,
  shortcut, place). The review mode is also found by keywords in any
  language (*correction*, *relecture*, *proofreading*…).
- Examples with plots: a lab report with Python cells (fit with error bars,
  damped oscillations, Bode plot, histogram, field map, SymPy) whose output
  and figures are already drawn, and a workbook of measurements with line
  and scatter charts.
- Spreadsheet functions: `EXP`, `LN`, `LOG`, `LOG10`, trigonometric and
  hyperbolic functions, `DEGREES`, `RADIANS`, `SIGN`, `SUMSQ`, `VAR`,
  `VARP`, `STDEV`, `STDEVP`, `SLOPE`, `INTERCEPT`, `RSQ`, `CORREL`.
- Review mode for text documents (📖 Review mode, first in the toolbar, or
  Ctrl+Alt+R): the document shown as
  pages like a PDF file, read-only but open to comments, with the review bar
  of the PDF viewer.
- Page by page reading without scrolling (one spread at a time) for PDF files
  and reviewed documents, keyboard shortcuts to turn the pages (k/j, Space,
  Page Up/Down…), zoom, comment and go from comment to comment, and a full
  screen without distractions (f).
- Cell formatting in spreadsheets: bold, italic, underline, text and fill
  colours, borders and alignment, kept in Excel and OpenDocument files and
  printed. The budget, grade book and invoice templates use it.
- PDF viewer: fit the whole page (its height) and show 2 or more pages
  side by side; find text in the pages (Ctrl+F); highlight text and add
  notes, saved as standard PDF annotations, with a panel listing the
  annotations of the file.
- Pictures inserted in a document ask for their alternative text (or mark
  them as decorative) and an optional numbered caption; a double click edits
  the alternative text.
- Accessibility check of text documents: pictures, headings, tables, links,
  contrast, title and language, with a way to each issue.
- Versions: each save keeps a copy in the browser (the last 30), listed
  under 🕘 History to open, download or name.
- View menu of text documents: readability of each paragraph, focus mode,
  typewriter mode, a word goal with daily statistics and a focus timer.
- Typography as you type (curly quotes per language, dashes, ellipsis,
  French no-break spaces) and a Text menu of transforms: quotes, spacing,
  invisible characters, joining lines pasted from a PDF, case.
- Command palette (Ctrl+Shift+P): find any button or menu entry of the
  screen by typing part of its name.
- Random variants of exercise sheets: values drawn in the text
  (`{{R=rand(10..20)}}`), computed results (`{{=R*2}}`), N sheets and answer
  keys in a ZIP with a CSV of the values.
- Exercise sheets and answer keys from one document: mark paragraphs as
  solutions, hide them, and save the sheet without them; kept in Word,
  OpenDocument and Markdown (`::: solution`) files.
- Tracked changes in text documents: record insertions and deletions with
  their author, accept or reject them one by one or all at once; kept in
  Word, OpenDocument and Markdown (CriticMarkup) files.
- Comments in text documents: comment the selection or the word at the
  cursor (Ctrl+Alt+M), reply, resolve and delete, with the threads beside
  the page. Comments are kept in Word (with replies and resolved state),
  OpenDocument (LibreOffice annotations) and Markdown (CriticMarkup) files.
- ZIP archives open as a folder in the side panel: documents, source files
  and pictures open from it, archives inside the archive are folders too,
  other files can be downloaded, and the archive can be downloaded with its
  changes. Files are decompressed only when opened.
- Text and source files (C, C++, Python, Java, JavaScript, R, MATLAB, SQL
  and many more) open in a code editor with syntax colouring, line numbers,
  folding and search, built on CodeMirror. They are saved under their own
  name, keeping their line ends.
- Review comments on lines of source files, written in the code as comments
  of its language (`# REVIEW(Prof): …`) and listed in a panel.
- Pictures open in a viewer, fitted to the window or at their own size.
- Autofilter in spreadsheets: ▾ buttons in the headings of a table to choose
  the values shown in each column; the filter and the rows it hides are kept
  in Excel and OpenDocument files.

### Changed

- The template gallery shows **one kind at a time** behind tabs, with a
  search through all the templates and examples.
- The version shows the date of the build as Semantic Versioning build
  metadata: `v0.1.0+20261004 (1a2b3c4)` — the date tells how recent a build
  is and is ignored when versions are compared.
- Larger files: up to **200 MB** (was 50 MB; ZIP archives still 1 GB), and
  recent files keep a copy up to 100 MB (was 25 MB).

- The start screen offers **Templates and examples** first, on a card twice
  as wide.
- Compact toolbars (UI-020): the word processor and the header keep the
  most used tools in sight and group the others in menus (Format,
  Paragraph, Insert, Review, Teaching, Document; File, Share); *Settings ›
  Toolbars › Full* shows every tool.


- Documentation, source code and About are buttons under the title of the
  start screen; in the toolbar, **?** opens the documentation and **ℹ**
  the About window.

- Documentation site: a visual identity matching the application (its icon
  as logo and favicon, its blue and the colours of documents, spreadsheets
  and presentations, light and dark), a home page with feature icons and
  up-to-date screenshots.

- The lab template keeps each name in one cell (CODE-014).

- The review mode is one switch for every file, also in the settings.
- One name for the user, asked once: comments, annotations, tracked
  changes and collaboration use it (no more random collaboration name
  signing comments).

### Fixed

- Rulers: arrow keys pressed quickly on a margin or indent handle could lose
  steps (each one moved from the position the ruler was last drawn at).
- The scientific article template lost the backslashes of its LaTeX: its
  equation showed `ytnfty left(…)`, `τ` and `y∞` were broken, and the
  affiliations ran into the corresponding author; the references had two
  titles. Every template is now checked for lost backslashes.
- The end of each page's text is marked in the margins instead of a line
  drawn across the text, which looked like struck-through words.
- Git: choosing another repository (by its address or the list) no longer
  leaves the files of the previous one on screen when it fails to load —
  saving could then go to a repository other than the one shown.
- Git: an empty repository, just created, opens without error and takes a
  first document on its default branch (GIT-011); a token can be added — and
  is remembered in this browser — from a repository opened without one, and
  saving into it asks for the token instead of only refusing (GIT-012).
- On a phone, the round ⌘ Commands button (and the busy and update notices)
  stay above the on-screen keyboard instead of being hidden behind it (UI-022).
- Git: a pasted repository address is understood at once (no need to press
  *Go*), and what was understood is shown (service, owner, repository,
  branch, path) with the fields filled in; a public repository opens without
  any token, a private one asks for an account with its form filled in
  (GIT-008).
- Python completion in a code cell: when the interpreter was still loading
  jedi, the first completions answered too late and the list never opened;
  a late answer now opens it, if the cursor has not moved (CODE-011).
- Names in the templates follow the usage: SURNAME First name in school and
  university documents (a team listed one member per line), First name
  SURNAME elsewhere (minutes, French letters).

- Completing a Python cell with the interpreter's names could show nothing
  the first time: loading jedi took longer than a keystroke waits. It is
  loaded as soon as the editor of a cell opens.

- The button leaving the review mode is now where the one entering it is,
  first in the bar.

- The letter template wrote each address on a single line: every line of an
  address is now on its own line, and the letter is laid out as is usual in
  its language (in French: recipient, place and date and signature from
  9 cm, subject and enclosures, indented paragraphs; in English: block
  style), with space between the blocks.

- Code in colours again in the editor of a cell (the token colours were
  defined for the code viewer only), and now also in the cells shown in the
  document; completion of keywords, usual functions and words of the code
  for Lua, R, C/C++ and SQL, in cells and in the code viewer.

- A name changed in the settings during a collaboration was not shown to
  the others; the name is now asked in a window of the page instead of the
  browser's prompt, which froze the page and could drop the connection.
- Devices of a real-time collaboration could fail to find each other, even
  on the same network: the few relays picked by the connection library
  included some that no longer pass messages on. A list of well-known relays
  is now used, all at once; relays refusing the messages are reported.
- A file renamed in the app kept its old name in the recent files and lost
  its versions; the recent files now also keep the content saved last.
- Tracked changes typed or deleted across a second boundary were split
  into several changes: they now join the neighbouring change of the same
  author.
- The review bar of text documents was shown outside the review mode.
- Pictures linked from a Markdown note opened from a folder or an archive
  (relative paths with spaces or accents, `<img>` tags, `![[name]]` embeds)
  are shown, kept as links when the note is saved back and included in the
  MDZ, Word and OpenDocument exports.
- *Save as* after opening a folder no longer writes the new file into the
  folder.
- The offer to reopen the last folder on the start screen can be removed.
- Frozen numeric cells scrolled away with the sheet.
- The "Working…" indicator could stay on screen after opening a ZIP
  archive.

## [0.1.0] - 2026-10-02

First minor release: everything since 0.0.13, summed up in the README.

### Added

- Slide size and orientation in presentations: 16:9, 4:3, A4 or Letter,
  landscape or portrait; shapes and text follow, and printing uses the
  orientation of the slides.
- A *Race signs* template: start, arrows, kilometre marks, water station and
  finish in very large letters, one A4 page each.
- Template files: `.ott`, `.ots`, `.otp`, `.dotx`, `.xltx` and `.potx` open as
  new, untitled documents (saving never changes the template), and *Save
  as… › Save as template file* writes them.
- Templates and examples (🧩 on the start screen): letter, report, meeting
  minutes, exercise sheet, budget, grade book, invoice and talk, plus an
  example document touring the word processor, in English or French; your
  own templates saved from any document (*Save as template…*) and kept in
  the browser.
- Freeze panes in spreadsheets (❄): the rows above and the columns left of
  the active cell stay in view; kept in Excel and OpenDocument files.
- Sort a spreadsheet range (⇅ *Sort…*) by a column, ascending or
  descending, with a header row detected and kept in place.
- Page numbering styles in text documents: `1, 2, 3`, roman numerals or
  letters, a chosen first number, no header and footer on a title page, and
  ready-made footers (`1`, `1/10`, `- 1 -`, `Page 1 of 10`). Printed, and
  kept in Word, OpenDocument, LaTeX and Markdown files.
- The About window lists the open-source components of the build with
  their exact versions, licences and project pages; **Copy details**
  includes the versions in the report.
- Any font size can be typed (1 to 999 pt) in text documents and
  presentations; the usual sizes are suggested, and the arrow keys step
  through them and beyond (by 20 % past the largest). In a presentation, a
  size typed while editing a text box applies to the selected text.
- Synchronise a text document without a network (🔄 *Sync by QR*): two
  devices, one of them never connected, merge their changes character by
  character through QR codes shown and scanned with QRShare (three short
  passes, or one to send the whole document), or through files of codes.
  Devices introduce themselves with a signed key and a fingerprint; changes
  are summarised before being applied, checked on a copy first, and logged.
- QRShare handoff protocol version 2, when QRShare announces it: the app
  can ask for a send mode (animated QR codes without the choice screen) and
  get a received file back in its own window, from QRShare's origin only.
- A document identifier (UUID) kept in DOCX (`dc:identifier`), ODT (a
  user-defined property) and Markdown front matter (`identifier`), for the
  offline synchronisation of a document between devices. It is not shown in
  the properties dialog.
- Documents that are not small text are handed to QRShare inside the browser
  (QRShare app handoff protocol), without a download; QRShare can hand received
  files back to Progressive Web Office, which accepts them only from the
  configured QRShare. Support is read from QRShare's web app manifest: an
  older QRShare gets the download and its "Prepare a transfer" screen right
  away, instead of a screen saying that no data was provided.
- "Share with another app…" in the send dialog opens the system share sheet.
- Light / dark / system theme: a toolbar button cycles between following the
  device setting, light and dark; the choice is remembered.
- Character and paragraph formatting in text documents: font, size, text
  colour, highlight, clear formatting (Ctrl+Space), indent / outdent
  (Ctrl+] / Ctrl+[), line spacing, and a paragraph spacing dialog (left and
  first-line indents, space before and after). Kept in DOCX and ODT, and
  read from them as direct formatting only.
- Header and footer in text documents (▤): left, centre and right parts
  with page number, page count, title and date fields; shown around the
  page, printed on every page (CSS page margin boxes), kept in DOCX, ODT,
  LaTeX (fancyhdr) and Markdown front matter, shared in collaboration.
- Tables in text documents: a table bar (shown while the cursor is in a
  table) inserts and deletes rows and columns, merges and splits cells,
  toggles a header row (repeated on each printed page) and deletes the
  table. Merged cells and header rows are kept in DOCX, ODT, HTML and LaTeX
  (`\multicolumn` / `\multirow`); Markdown tables are read with their header
  row.
- Captions and cross-references in text documents: 🏷 numbers figures,
  tables and equations (Caption style, numbers in document order), ↪ inserts
  a reference to a figure, table, equation or heading that follows
  renumbering and shows `??` when its target is deleted. Kept as SEQ/REF
  fields and bookmarks in DOCX, sequences and bookmark references in ODT,
  `\captionof` / `equation` / `\label` / `\ref` / `\eqref` / `\nameref` in
  LaTeX, and anchors, links and `\tag` in Markdown; read back from Word,
  LibreOffice and LaTeX files (`figure` and `table` floats included).
- Citations and bibliography in text documents: 📚 imports BibTeX sources
  (or pasted entries) and sets numbered or author-year citations, ❝ cites
  one or more sources with a page, and the list of references follows the
  citations. Kept as Word sources with CITATION and BIBLIOGRAPHY fields,
  OpenDocument bibliography marks and index, LaTeX `\cite` / `\citep` with
  `references.bib` (also embedded in the `.tex` with `filecontents`), and
  pandoc citations with `references:` in Markdown; read back from these
  formats, from Zotero and Mendeley citations in Word files and from
  `thebibliography`.
- Folder mode: *Open a folder* lists the documents of a local folder in a
  side panel; Save writes back into the folder (Chromium; read-only
  elsewhere), *Search the folder* finds a word in all its documents and opens
  them at the match, Ctrl+click follows relative links between documents,
  and the folder is offered again on the start screen.
- Master documents: 📄 includes a sub-document of the folder, *Assemble…*
  saves the master document with its sub-documents as one file, numbering,
  cross-references and bibliography running on across chapters. Kept as
  OpenDocument linked sections (`.odm` opens too), Word sub-documents, LaTeX
  `\include` and Markdown `{{#include …}}`.
- File explorer in the folder panel: new document, new folder, rename (F2),
  delete (Del) and move by drag and drop, the open document following a
  rename or a move; sub-folders load when opened. It is built on `src/fs/`,
  a storage-independent module (a `StorageProvider` interface with local
  folder, browser storage (OPFS), read-only folder and memory providers, and
  a framework-free explorer component) meant to be shared with other apps.
- *Open a folder* offers a folder of the device, the browser's own storage
  (kept across visits, available offline and shared with QRShare) or a
  Nextcloud / WebDAV account, which the explorer manages too (folders
  created, files renamed, moved and deleted on the server).
- Read-only documents: 🔓 shows the open document, spreadsheet or
  presentation read-only (toolbars hidden, no changes, Save refused) with a
  banner offering Edit and Edit a copy; documents of a read-only folder
  always open read-only, editable only as a copy.
- Linked Markdown notes in folders: `[[note]]`, `[[note#heading]]` and
  `[[note|text]]` links (Ctrl+click, by name or front matter alias, a missing
  note created on demand), `![[picture]]` embeds and pictures of the folder
  shown in notes, backlinks in the folder panel, and links updated when a
  note is renamed. The explorer's selection follows the open document.
- Links to a document on a server: 🔗 checks a web address and makes a link
  (and QR code) that opens the document read-only, optionally pinned to that
  version by its SHA-256 fingerprint, a changed file being refused.
- Table of contents in text documents (§): generated from the headings,
  updated as you type, entries jump to their heading. Written as Word's TOC
  field (recomputed with page numbers when Word opens the file), an ODF
  table of contents, `[[_TOC_]]` in Markdown and `\tableofcontents` in
  LaTeX, and read back from all of them.
- Footnotes in text documents (¹, Ctrl+Alt+F): numbered automatically,
  listed under the page and printed at the end, edited in simple Markdown
  (formatting, links, equations, paragraphs). Kept in DOCX, ODT, Markdown
  (`[^1]`, and `^[…]` on import) and LaTeX (`\footnote`); LaTeX footnotes
  used to be imported as text in brackets.
- Page breaks in text documents (⤓, Ctrl+Enter), shown as a labelled
  dashed line and starting a new page when printing; kept in DOCX (also
  read when inside a paragraph or set as "page break before"), ODT,
  Markdown (`\newpage`) and LaTeX. LaTeX import also reads full-width
  `\rule` lines as horizontal rules.
- Find and replace in text documents (🔍, Ctrl+F / Ctrl+H): highlighted
  matches with a count, match case, whole words, regular expressions with
  `$1` groups, replace one or all in a single undoable step.
- About window (**?** in the toolbar, *About* on the start screen): version,
  git commit and build date, licence, installed / offline status, a QR code
  of the app address to open it on another device (click it to show it full
  screen, easier to scan), links to the
  documentation, source code, changelog, requirements and problem reports,
  and *Copy details* for a bug report. The version and short git commit
  (e.g. `v0.0.13 (6cae6fc)`) are also shown next to the name in the toolbar
  and on the start screen, as in QRShare.
- Real-time collaboration on text documents and spreadsheets (👥): an
  invitation link opens the same document for others; edits are merged per
  cell or paragraph, peer to peer (WebRTC, end-to-end encrypted, introduced
  through public Nostr relays), with no server storing the document. The bar
  shows who is here — compound names like *Swift Crimson Falcon* in a matching
  colour — and where each person works; shared named versions with author and
  date can be restored for everyone; every participant keeps the document and
  history on their device, so a reload rejoins the session. The engine is the
  `@scelles/collab` package shared with QRShare. The invitation can be sent
  as a QR code (also full screen, for a projector), copied, through the
  system share sheet, by email, or with QRShare (QR code, nearby devices,
  offline transfer).

- Document properties (ⓘ in the text editor): title, author, date, subject,
  description, keywords, language and licence, read and written in Word and
  PowerPoint/Excel core properties, OpenDocument `meta.xml`, the MDZ manifest,
  LaTeX (title page and PDF properties) and the YAML front matter of Markdown
  files, whose other keys are preserved. The original creation date is kept
  instead of being reset on every save.
- Mermaid diagrams in text documents (⧉, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>):
  flowcharts, sequence, class, state, entity-relationship, Gantt, pie and mind
  map diagrams, edited in a dialog with templates and a live preview, rendered
  offline in strict security mode. Stored as ```` ```mermaid ```` blocks in
  Markdown and MDZ, and as PNG pictures carrying their source in Word,
  OpenDocument and LaTeX projects, so they stay editable after a round trip.
- PDF forms: **Save as… → Flattened PDF – fields locked** writes a copy
  (`…-flattened.pdf`) whose answers can no longer be changed, while **Save**
  keeps the fields editable for later changes.
- Code cells in text documents (**{ }** in the toolbar): Python (Pyodide,
  with numpy, matplotlib and the other Pyodide packages) and JavaScript, run on
  request in an isolated sandbox with no network access and no access to the
  application, your files or your keys. A confirmation explains this before
  the first run; ■ stops a cell at any time. Printed output, errors and
  matplotlib figures are kept in the document, as `{run}` / `{output}` blocks in
  Markdown and MDZ, and as code and pictures in Word, OpenDocument and LaTeX.
  The Python runtime is served by the application and, like the packages
  (downloaded from the Pyodide CDN on first use), kept for offline use.
- **Spreadsheet charts** (📊): columns, bars, lines, pie and scatter, from the
  selection or the data block around the active cell, with a live preview.
  Charts update with the data, can be moved, resized, edited, deleted and
  copied as an image (to paste into a document or a slide), are printed, and
  are saved as native charts in XLSX and ODS. The AI assistant can add charts.
- **Nextcloud / WebDAV** (start screen, and **☁** to save any document): open
  and save files on Nextcloud, ownCloud or any WebDAV server. Saving never
  overwrites a file changed by someone else meanwhile: a copy is offered
  instead. Accounts (app password) stay in this browser; the guide explains the
  CORS setup of the server.
- **Choice of AI provider** for the assistant (⚙): Anthropic (Claude), OpenAI,
  Mistral AI, Albert (API de l’État), a local Ollama server, or any server
  offering the OpenAI chat completions API (LM Studio, vLLM, OpenRouter…).
  Each provider keeps its own key, model and address; all get the same
  document tools, confirmations and undo. Local servers on `localhost` are
  allowed over HTTP.
- **Links containing a document** (📲 → *Copy link*): a short document is
  compressed into the address itself (after the `#`, never sent to a server);
  opening the link rebuilds the document. Text documents travel as Markdown.
- **Open from Grist** (start screen): open a document of a (self-hosted)
  Grist server as a workbook, one sheet per table; **Save** sends the changed
  cells, new rows and, after confirmation, deleted rows back to Grist, then
  reloads the document. Accounts (server address and API key) stay in this
  browser. The guide explains the CORS setup of the server.
- The start screen links to the documentation, and the documentation has an
  **Open the app** link (navigation bar and home page).
- MDZ manifest schema: optional `subject`, `description`, `keywords`,
  `language` and `license` fields.

- Integration tests against a real QRShare build (`just e2e-qrshare`, and a
  dedicated CI job): the document sent to QRShare's transfer chooser is
  checked byte for byte, encoded as a static QR code and decoded back; the
  "Prepare a transfer" and receive screens are checked too.

### Changed

- The start screen cards have icons (📝 document, 📊 spreadsheet, 📽️
  presentation, 📂 open, 🗂️ repository, 📲 receive, ☁️ cloud, 🗃️ Grist);
  they are decorative and do not change the buttons' names for screen
  readers.

- New text editor engine (ProseMirror) instead of the browser's editing
  commands: the document is edited as a structure through transactions, so
  editing behaves the same in every browser, undo/redo is reliable, and
  collaboration merges precisely. Typing `# `, `## `, `- `, `1. `, `> ` or
  ` ``` ` at the start of a line creates a heading, list, quote or code
  block; Tab / Shift+Tab indent list items or move between table cells;
  Enter on an empty list item leaves the list; Shift+Enter inserts a line
  break; Ctrl+Alt+1…3 apply heading styles. Pasted content from other
  applications keeps headings, lists and formatting and drops the rest.
  Toolbar buttons keep the focus in the document, and a key pressed right
  after moving the caret acts at the new position.

- Open formats first: new documents, spreadsheets and presentations are
  created as OpenDocument files (`.odt`, `.ods`, `.odp`) instead of
  Microsoft Office ones, and *Save as* lists the open format first. "New
  files in" on the start screen switches to Microsoft Office formats; an
  opened file still keeps its format.

- PDF forms: the little-noticed **Flatten** checkbox of the PDF toolbar is
  replaced by the "Flattened PDF" entry of **Save as…**.
- Recent files show the date and time they were last opened, in the interface
  language (previously only the date, in the browser's language).
- The project is now licensed under the GNU Affero General Public License
  v3.0 or later (previously MIT); the start screen links to the source code.
- Clearer wording for saving the AI assistant's API key.

### Fixed

- Phones: the header keeps one line (Save, and the other actions in a “⋯”
  menu) and editing toolbars one row that scrolls sideways, instead of
  covering most of the screen above the keyboard.
- Side panels (assistant, folder) no longer cover the second line of the
  header when it wraps on narrow windows.

- Equation editor on phones and tablets: MathLive's virtual keyboard was shown
  behind the modal dialog and could not be used; it now opens above it, docked
  at the bottom of the screen.

## [0.0.13] - 2026-10-01

### Added

- AI assistant panel powered by Claude (bring your own Anthropic API key):
  reads and edits text documents (Markdown blocks, find/replace, LaTeX
  equations), spreadsheets (values and formulas, sheets) and presentations
  (slide text, new slides, text boxes) through validated tools, with
  streaming answers and the list of actions taken.
- Explicit consent before any content is sent, showing provider and model;
  the API key is used for the current session only unless the user saves it
  in the browser; configurable model and effort; automatic server-side
  fallback when a request is declined.
- "Undo the assistant's changes" after each request (plus step-by-step undo
  in spreadsheets and presentations).
- WebMCP: the same tools are registered for in-browser AI agents
  (`document.modelContext` / `navigator.modelContext`), with user approval
  for every modification.

## [0.0.12] - 2026-10-01

### Added

- "Send to another device" with [QRShare](https://github.com/s-celles/QRShare):
  small text documents open directly in QRShare's send screen, other files go
  through the system share sheet, or are downloaded while QRShare's
  "Prepare a transfer" screen opens. Transfer policy (air-gapped only, prefer
  air-gapped, any) and QRShare address are configurable and remembered.
- "Receive from another device" opens QRShare's receive screen.
- Web Share Target: files (and text) shared from QRShare or any other app open
  directly in the installed application.

## [0.0.11] - 2026-10-01

### Added

- Git repositories: connect GitHub (github.com or Enterprise) and GitLab
  (gitlab.com or self-hosted) accounts with a personal access token kept in
  this browser only, browse repositories, branches and folders, and open any
  supported file.
- Saving a document opened from a repository commits it to the same path and
  branch, with an editable Conventional Commits message and optional new
  branch; any document can be committed to a chosen repository location.
- Conflict protection: when the file changed in the repository, the commit is
  refused and the document can be saved on a new branch or as a copy.

### Changed

- The Content-Security-Policy allows HTTPS connections (`connect-src https:`)
  for git hosting and AI provider APIs.

## [0.0.10] - 2026-10-01

### Added

- LaTeX export: a compilable `article` (`.tex`), or a ZIP project with
  `main.tex` and an `images/` folder when the document contains pictures.
  Works with pdfLaTeX, XeLaTeX and LuaLaTeX (Chinese text uses `xeCJK`).
- LaTeX import of `.tex` files and ZIP projects (main file detection,
  `\input`/`\include`, `\includegraphics` without extension): sectioning,
  formatting, lists, tables, links, quotes, verbatim, inline and display
  equations (`equation`, `align`...), title and author, accents and TeX
  ligatures. Unsupported commands and environments stay visible as source.
- Typing `$…$` (or `$$…$$`) in a text document creates an equation.
- Equations written as `$…$` in spreadsheet cells and slide text boxes are
  rendered with MathLive (on screen, in slideshows and when printing).

## [0.0.9] - 2026-10-01

### Added

- Print preview with paper size (A4, Letter, A3, A5), orientation and
  margins, remembered between sessions; printing happens from an isolated
  frame so the application interface is never printed.
- Print layouts: paginated documents (headings kept with their paragraph,
  tables/images/equations not split), spreadsheets (current or all sheets,
  grid lines, row/column headings repeated on each page) and presentations
  (1, 2, 4 or 6 slides per page, optional speaker notes).
- "Save as PDF" guidance in the preview.

## [0.0.8] - 2026-10-01

### Added

- Interface translated into French and Simplified Chinese (English remains
  the reference), with automatic detection from the browser, a language
  selector on the start screen, persistence and `<html lang>` updates.
- Catalog completeness and placeholder consistency tests; end-to-end tests in
  French and Chinese.
- Specification of milestones 0.0.8-0.0.13 (i18n, printing, LaTeX, git,
  QRShare, AI assistant); LaTeX equations become a Must requirement.

## [0.0.7] - 2026-10-01

### Added

- Mathematical equations in text documents: insert and edit them with a
  MathLive math field (keyboard, virtual keyboard, LaTeX source), inline or
  display, rendered offline with bundled fonts.
- Markdown/MDZ `$…$` and `$$…$$` support (pandoc-style delimiter rules).
- ODT: equations embedded as MathML formula objects with a LaTeX
  annotation; DOCX: equations written and read as Office Math (OMML).
- MathML → LaTeX, MathML → OMML and OMML → LaTeX converters.

### Changed

- Saving a text document is asynchronous (equations are converted first).

## [0.0.6] - 2026-10-01

### Added

- Recent files on the start screen, stored in IndexedDB (reopen, remove,
  clear).
- Autosaved drafts every 30 seconds while a document has unsaved changes,
  with a restore banner on the start screen.
- End-to-end tests for recent files, offline start-up (service worker) and
  the web app manifest.

### Fixed

- Buttons with an empty visible label now always get an accessible name.

## [0.0.5] - 2026-10-01

### Added

- Presentations: open, edit and save PowerPoint (`.pptx`) and OpenDocument
  (`.odp`) files, with conversion between them.
- PPTX reader with placeholder geometry inheritance (layout, master), group
  transforms, theme colours, bullets, pictures, backgrounds and speaker notes;
  minimal conformant PPTX writer (master, layout, theme, notes master).
- ODP reader/writer with graphic, text, paragraph and list styles.
- Slide editor: thumbnails, add/duplicate/move/delete slides, text boxes,
  rectangles, ellipses and images, drag/resize/keyboard moves, in-place text
  editing with bold/italic/underline, font size, colour, alignment and
  bullets, fill colour, stacking order, undo/redo, speaker notes, printing.
- Full-screen slideshow with keyboard, click and right-click navigation.
- Rich-text runs carry an optional font size and colour.

## [0.0.4] - 2026-10-01

### Added

- PDF viewer (pdf.js): lazy page rendering, navigation, zoom and fit to
  width, selectable text layer, offline fonts/CMaps/decoders.
- PDF form filling: text fields, checkboxes, radio buttons, drop-down and
  list boxes, saved with regenerated appearances; optional flattening.
- Handwritten signatures: drawing pad (mouse, touch, stylus with pressure)
  or image import, placed, moved (pointer or keyboard) and resized on the
  page, embedded as images when saving; free text stamps.
- Encrypted and XFA PDFs are shown read-only with an explanation.

### Changed

- Editor views may save asynchronously.

## [0.0.3] - 2026-10-01

### Added

- Spreadsheets: open, edit and save Excel (`.xlsx`), OpenDocument (`.ods`)
  and CSV/TSV files, with conversion between them.
- Formula engine: A1 references, ranges, whole columns/rows, cross-sheet
  references, operators with Excel precedence, 45 functions, error values
  and circular reference detection, automatic recalculation.
- Grid editor: virtualized rows, formula bar, keyboard navigation,
  selection statistics, undo/redo, copy/cut/paste as tab-separated text,
  number formats, AutoSum, sheet tabs (add, rename, delete), row/column
  insertion and deletion with reference updates, printing of the used range.
- OpenFormula translation for ODS, shared formulas and `_xlfn.` prefixes
  for XLSX, number formats and column widths in both formats.
- CSV: delimiter detection, Windows-1252 fallback, no formula creation on
  import (CSV injection protection).
- Requirements for mathematical equations (MathLive) planned as 0.0.7.

## [0.0.2] - 2026-10-01

### Added

- Text documents: open, edit and save Word (`.docx`), OpenDocument Text
  (`.odt`), Markdown (`.md`) and MDZ (`.mdz`) files, with conversion between
  them ("Save as").
- Format-neutral rich-text model: headings, bold/italic/underline/strike,
  inline code, links, nested lists, tables, quotes, code blocks, rules and
  embedded images.
- WYSIWYG editor: toolbar, keyboard shortcuts, paragraph styles, lists,
  alignment, links, images (insert, paste, drop), tables, word count.
- Paste sanitisation to the supported subset (no scripts, handlers or
  unsafe URLs).
- MDZ support compatible with the wflixu/mdz specification v1.1.0, a JSON
  Schema for the manifest (published with the docs), and import of plain ZIP
  archives of Markdown files (entry document chosen by the user when
  ambiguous).
- End-to-end smoke tests with Playwright; CI workflow and GitHub Pages
  deployment of the app and documentation.
- Public requirements specification (EARS + MoSCoW) in the documentation.

### Changed

- The application is named Progressive Web Office (short name PWO).

## [0.0.1] - 2026-10-01

### Added

- Project scaffold: TypeScript (strict), Vite, Vitest (jsdom), VitePress docs.
- Progressive Web App: web app manifest, offline service worker (Workbox),
  update prompt, File Handling API registration and launch queue.
- Application shell: start screen (new document / spreadsheet / presentation,
  open file), drag & drop, keyboard shortcuts (Ctrl+O, Ctrl+S), status bar,
  unsaved-changes warning, light/dark theme, progress indicator.
- Content-based format detection for DOCX, ODT, Markdown, MDZ (and plain ZIP
  of Markdown), XLSX, ODS, CSV/TSV, PPTX, ODP and PDF, with a 50 MB size limit.
- Content-Security-Policy injected in production builds.
- `justfile` entry points, documentation with generated `llms.txt` and
  `llms-full.txt`.
- Governance: MIT license, security policy (GHSA), Contributor Covenant 3.0.

[Unreleased]: https://github.com/progressive-web-office/progressive-web-office.github.io/compare/main...HEAD
[0.0.9]: https://github.com/progressive-web-office/progressive-web-office.github.io/commits/main
[0.0.8]: https://github.com/progressive-web-office/progressive-web-office.github.io/commits/main
[0.0.7]: https://github.com/progressive-web-office/progressive-web-office.github.io/commits/main
[0.0.6]: https://github.com/progressive-web-office/progressive-web-office.github.io/commits/main
[0.0.5]: https://github.com/progressive-web-office/progressive-web-office.github.io/commits/main
[0.0.4]: https://github.com/progressive-web-office/progressive-web-office.github.io/commits/main
[0.0.3]: https://github.com/progressive-web-office/progressive-web-office.github.io/commits/main
[0.0.2]: https://github.com/progressive-web-office/progressive-web-office.github.io/commits/main
[0.0.1]: https://github.com/progressive-web-office/progressive-web-office.github.io/commits/main
