# Settings

**⚙** in the header (or *settings* in the command palette,
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) opens the settings window. The
settings are grouped by category; every change is kept in this browser at
once.

## General

- **Language** of the interface (English, French, Chinese).
- **🔒 Exam mode…**: lock this browser for a test (see [Exam mode](./exam.md)).
- **Theme**: as the system, light or dark.
- **Your name**: it signs your comments, PDF annotations and tracked
  changes, and shows you to the other participants of a collaboration (and
  of a synchronisation without a network). Without one, it is asked once,
  the first time it is needed; renaming yourself in a collaboration changes
  it too.
- **Toolbars**: *compact* (the default) keeps the most used tools in sight
  and groups the others in menus; *full* shows every tool, as before. It
  applies to the next document opened.
- **New files in**: OpenDocument (open standard) or Microsoft Office
  formats, for new documents and the format offered first when saving.
- **Remember the repositories and servers used** (on by default): they are
  listed on the start screen to open them again in one click. Turning it
  off forgets them. See [Git repositories](./git#repositories-used-and-where-documents-come-from).
- **Keep where documents come from** (on by default): a document opened from
  or saved to a repository or a server keeps its address, so that **Save**
  writes it back there when it is opened again.

## Reading and review

How PDF files and text documents in [review mode](./review) are shown when
they open:

- **Pages side by side**: 1, 2, 3, 4 or 6;
- **Zoom**: actual size (100 %, the default), fit the width or the whole
  page — every file opens at this zoom; a zoom changed in the toolbar is
  for the file open only;
- **Page layout**: scrolling, or page by page without scrolling;
- **Remember the last choice made in the toolbar**: when it is on, the pages
  side by side and the page layout chosen in the toolbar become the default
  for the next file; turn it off to open every file with the settings above;
- **Review mode for every file**: PDF files and text documents open in
  [review mode](./review), until it is left (*Edit*) in any of them — the
  same switch as the *Review mode* button of the documents and PDF files.

For example, to read two whole pages side by side, page by page: 2 pages,
*Whole page*, *Page by page*.

## Writing

- **Typography as you type**: curly quotes, dashes, ellipsis and French
  no-break spaces (for the documents opened next).
- **When a code cell runs**: what happens to the cells using it —
  marked as out of date (the default), run too, or nothing (the classic
  notebook, cells run in the order of the document). See
  [reactive cells](./code#reactive-cells).

## Collaboration

How the participants of a [real-time collaboration](./collaboration) find
each other and connect: **relays** (Nostr, one `wss://` address per line;
empty: a list of well-known public relays, all used at once) and a **TURN server** with its user name and password,
for networks that block direct connections between browsers. They are used by
the next sessions. The password is kept in this browser like the other
settings.

## Printing

The defaults of the print preview: paper, orientation and margins.

The settings stay in this browser: they are not sent anywhere, and another
browser or device has its own.
