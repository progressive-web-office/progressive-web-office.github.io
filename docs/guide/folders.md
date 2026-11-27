# Folders and master documents

## Working on a folder

**Open a folder** (start screen) asks where the documents are. You can also
**drop a folder**, or several files, anywhere in the window: a dropped
folder opens as itself — and can be written where the browser allows it
(Chrome, Edge), read-only elsewhere — and several files open together as a
read-only folder, *Dropped files (n)*; the first document is shown.

**Open a folder** (start screen) asks where the documents are:

- **a folder of this device**;
- **browser storage**: a space kept by the browser for this site, with
  nothing to choose or allow, available offline and to the other apps of the
  same site (QRShare); clearing the site's data erases it;
- a **Nextcloud / WebDAV** account added with ☁ (see
  [Nextcloud / WebDAV](./cloud.md));
- a **Git repository** (GitHub, GitLab) of an account added with
  **Open from repository…** (see [Git repositories](./git.md)): choose the
  repository and the branch.

It then opens it as a project: its
documents are listed in a panel on the left, by sub-folder (a sub-folder
opens when you click it), under the folder itself — the first entry of the
tree, which folds the whole tree and whose right-click menu acts on the
whole folder (new file, import, download, **Pseudonymise…**, see
[Pseudonymisation](./pseudonymisation.md)). Click a document to open it; 📁
in the header shows or hides the panel.

The panel's toolbar manages the folder:

| Button | Action |
|--------|--------|
| ＋ | new Markdown note, in the selected folder, opened right away |
| 📝 📊 📽️ | new text document, spreadsheet or presentation (OpenDocument or Microsoft Office, as chosen in the settings), opened right away; a new drawing (.svg) is in the right-click menu |
| 📁＋ | new folder |
| 📥 | import files of this device into the selected folder |
| ✎ | rename the selected file or folder (<kbd>F2</kbd>) |
| 🗑 | delete the selected files and folders, after confirmation (<kbd>Del</kbd>) |
| ↻ | reload the folder |
| ⊟ | collapse all the folders |
| ◎ | show the open document in the tree |
| *Sort by* | order by name, date (newest first), size (largest first) or type; folders stay first, and the choice is remembered |

Each file shows its size and the date it was last changed (the full date in
its tooltip).

Drag a file or folder onto another folder (or onto the empty space below the
tree, for the top of the folder) to move it. The open document follows when
it is renamed or moved.

**Importing files**: drop files or folders from the desktop onto the tree
(onto a folder, or onto a file to import next to it), or use 📥. A name
already taken gets a number (`notes 2.md`).

**Context menu**: a right click on an entry (or the <kbd>Menu</kbd> key, or
<kbd>Shift</kbd>+<kbd>F10</kbd>) lists what can be done with it: open,
rename, duplicate, copy, cut, paste, download, copy the path, delete; on the
empty space below the tree, new document, new folder, import and paste.

**Copy, cut and paste**: <kbd>Ctrl</kbd>+<kbd>C</kbd>,
<kbd>Ctrl</kbd>+<kbd>X</kbd> then <kbd>Ctrl</kbd>+<kbd>V</kbd> in the tree
(or the context menu) copy or move the selected files and folders into the
selected folder; a name already taken gets a number. *Duplicate* makes a copy
next to the original (`plan 2.md`).

**Download**: a file is downloaded as it is; a folder, or several entries,
as a ZIP archive.

**Several at once**: <kbd>Ctrl</kbd>+click (<kbd>⌘</kbd>+click on macOS)
adds or removes an entry, <kbd>Shift</kbd>+click selects a range,
<kbd>Ctrl</kbd>+<kbd>A</kbd> selects every entry shown. Deleting or dragging
then acts on all of them.

**Undoing a deletion**: after a deletion, *Undo* (or <kbd>Ctrl</kbd>+<kbd>Z</kbd>
in the tree) puts the files back. Deletions larger than 64 MB cannot be
undone; the confirmation says so.

**Keyboard**: in the tree, <kbd>↑</kbd> <kbd>↓</kbd> move,
<kbd>Home</kbd> <kbd>End</kbd> go to the first and last entry,
<kbd>→</kbd> opens a folder (then goes into it), <kbd>←</kbd> closes it (or
goes to its parent), <kbd>Enter</kbd> opens a document,
<kbd>Shift</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> extends the selection.

- **Save** writes the document back into the folder, in place. *Save as*
  writes a new file wherever you choose (it is not added to the folder);
  the document then follows that new file.
- **Search the folder** first lists the files whose **name** contains the
  words, then looks for them in all its documents at once (Markdown, LaTeX,
  text, BibTeX, Word, OpenDocument), ignoring case and accents. Click a
  result to open the document at the first match.
- **Links between documents**: a link to another file of the folder
  (`[chapter 1](chapters/one.md)`, a relative link in a Word or OpenDocument
  file) opens that document with <kbd>Ctrl</kbd>+click
  (<kbd>⌘</kbd>+click on macOS). Links to web pages open in a new tab.
- The folders are remembered: the start screen offers to reopen the last
  five folders of the device (the browser asks again for permission). The ✕
  next to one forgets it; the folder itself is not touched.

Chromium-based browsers (Chrome, Edge, Opera…) read and write the folder in
place. Other browsers open it **read-only**: documents can be read and
searched, and Save downloads a copy.

Hidden folders (`.git`…) and `node_modules` are left out.

## Linked notes

A folder of Markdown notes works as a set of linked notes:

- `[[Note]]` links to the note `Note.md` (in the same folder first, then
  anywhere in the folder, then by one of its `aliases:` in the front matter);
  `[[Note#Heading]]` goes to a heading, `[[Note#^id]]` to a block,
  `[[Note|shown text]]` shows another text. <kbd>Ctrl</kbd>+click follows the link; a link to a note that does
  not exist yet offers to create it.
- Typing `[[` lists the notes of the folder, those whose name starts with
  what you type first; typing `#` and a letter lists the tags already used.
  <kbd>↑</kbd>/<kbd>↓</kbd> choose, <kbd>Enter</kbd> or <kbd>Tab</kbd>
  insert, <kbd>Esc</kbd> closes the list. After `[[Note#` the headings of
  that note are listed, after `[[Note#^` its paragraphs (`[[#` and `[[#^` for
  the note itself); a paragraph that has no identifier yet gets one, written
  at its end (`^x1y2z3`), when you choose it.
- **Note identifiers**: **🆔** in the explorer (or *New note with an
  identifier* in its menu) creates a note named after the date and time,
  `202410031530 Untitled.md`, with `id: 202410031530` in its front matter.
  `[[202410031530]]` links to it whatever its title becomes: a link made of
  8 to 14 digits goes to the note whose name starts with them, or whose front
  matter has that `id`.
- **Embeds**: `![[picture.png]]` shows a picture of the folder. `![[Note]]`
  shows that note in place, read-only — `![[Note#Heading]]` the section under
  the heading, `![[Note#^id]]` the block — with **↗** to open it; embeds alone
  on their line inside it are shown too, up to three levels, and a note
  already shown is not shown again. `![[file.pdf]]` shows the first page of
  the PDF file (`![[file.pdf#page=3]]` another page), and audio and video
  files (`mp3`, `wav`, `ogg`, `m4a`, `flac`, `webm`, `mp4`, `mov`) are
  played in the note.
- **☰ Outline** (in the *Document* menu of the toolbar) shows the headings
  of the document beside it; a click goes to a heading, and the heading of
  the part shown is marked.
- Under the page of the open note, **Linked from** lists the notes linking
  to it (backlinks), each with the words around the link, then the
  **related notes**: those sharing its tags or linked with it either way,
  the closest first, with the shared tags (FOLDER-026).
- **Find unlinked mentions** lists the notes writing its name — or one of
  its aliases — without a link; **Link** makes the first such mention in
  that note a link (`[[Note|as written]]`).
- **⚙** sets where the backlinks are shown (*at the bottom of the page* or
  *in the side panel*), their order (*by name* or *latest changed first*),
  the words around each link, and the unlinked mentions; **▾ Linked from**
  folds them. The settings are kept for the next notes.
- Renaming or moving a note in the panel updates the `[[links]]` to it in
  the other notes, and their relative Markdown links (`[text](Folder/Note.md)`,
  encoded or not).
- The YAML front matter of each note (tags, aliases, any key) is kept as it
  is.

### Properties of a note

The front matter of a Markdown note is shown above its page as a card of
**properties** (NOTE-001): tags as coloured chips, `[[links]]` and web
addresses as links to follow, dates, yes/no boxes and numbers.

- **Edit** changes a value in place; a value holding a link shows the link,
  and its pencil ✎ changes it. *Add a property* (or **View › Add a
  property…**) adds one with its type; the ✕ of a row removes it. The front
  matter is written back in its order, the other lines as they were.
- **Read** shows the values only, drawn: links, chips, dates in words.
- **YAML** shows the whole front matter as text, to change at once — taken
  back when you leave the field.

The way chosen is kept for the next notes; **View › Properties of the note**
hides the card.

### Daily notes and calendar

The **📅 Calendar** section of the folder panel shows the month (FOLDER-027):
a dot under each day that has its note; a click opens it, or creates it;
**‹ ›** change the month, **Today** comes back. **📅** in the panel's header
opens **today's note**, created when there is none.

With no folder open, the command palette (`Ctrl+Shift+P`) has **Calendar of
the notes** and **Today's note**: they open the documents kept in the
browser as the folder, then the calendar or today's note.

**⚙** sets:

::: v-pre

- **Name** — the format of the date, `YYYY/MM/YYYY-MM-DD` by default: a
  folder per year and per month (`Daily notes/2026/10/2026-10-05.md`), the
  note named after its day. `YYYY` year, `MM` month, `DD` day,
  `ddd`/`dddd` weekday, `MMMM` month name, `ww` week, `[text]` written as it
  is; each `/` makes a folder — `YYYY-MM-DD` puts them all in one.
- **Folder** — where the daily notes go, `Daily notes` by default (empty for
  the root of the folder).
- **Template** — a note copied into each new daily note, its fields filled:
  `{{title}}`, `{{date}}`, `{{date:dddd D MMMM}}`, `{{time}}`, `{{heading}}`
  (the date as a title, see below). Without one,
  a daily note gets the properties built in — `timestamp` (the day, at the
  time it is created), `year` (`[[2026]]`), `MOC`, `type`
  (`[[Daily note]]`), `title`, `description`, `tags` (`#daily`), `see
  also`, `previously`, `events`, `references`, `subsequently`. **Create the
  template, to change it** writes them as `Templates/Daily note.md` and uses
  that note from then on; its note begins with `date:` and the date as its
  title (`# Monday, October 5, 2026`).
- **Title** — how that date is written: in full, long or medium words of
  your language and region (*Monday, October 5, 2026* / *lundi 5 octobre
  2026*), as `YYYY-MM-DD`, or in a format of your own.

:::

### Tags

**Tags** (below the tree) lists the tags of the notes, the most used first
with the number of notes: the `tags` (or `keywords`) of their front matter,
and `#tags` written in the text (`#todo`, nested `#course/semester-1`; not
in code, links, headings or colours like `#fff`). Click a tag, or search
`#tag`, to list its notes. **✎** renames a tag in every note of the folder.

In the notes of the folder, `#tags` are shown as tags. The round button next
to a tag gives it a colour (red, orange, yellow, green, teal, blue, purple,
grey), used in the list and in the notes; colours are kept in this browser,
for each folder.

### Views of notes: table, cards, board

A **view** shows notes of the folder side by side (NOTE-003): the projects
with their status and due date, the people of an organisation, the books
read. *New view of notes…* in the command palette makes one; it is a file
of the folder, `Projects.view.yaml`, opened like a document:

- **Table**: one note per row, its properties as columns. Click a column's
  name to sort by it (again for the largest first); double-click a cell — or
  <kbd>Enter</kbd> on it — to change the property **in the note itself**.
- **Cards**: one card per note.
- **Board**: one column per value of a property (*Columns by*: `status`…).
  Drag a card to another column, or choose its column in the list of the
  card: the note's property follows. **＋ New note** in a column makes a note
  in that column.
- **Properties shown…** chooses the columns; **Edit the view** shows the
  file, to write its filters.

```yaml
title: Projects
from: Projects
where:
  - type = Project
  - status != archived
  - due <= 2026-12-31
columns: [name, status, due, lead, tasks]
sort: [due]
layout: board
group: status
groups: [todo, doing, done]
```

- `from`: the folder of the notes, and where notes made from the view go.
- `where`, one filter per line, all holding: `key = value`, `!=`, `<`,
  `<=`, `>`, `>=`, `key contains text`, `has key`, `!has key`, `#tag`,
  `!#tag`; `today` is today's date, and `[[links]]` compare by the name of
  the note (`lead = Ada Lovelace`). Filters are comparisons, never code.
- `columns`: the properties, and `name`, `path`, `folder`, `modified`,
  `tags`, `tasks` (done / total).
- `sort`: `-` first for the largest first; notes without the value last.
- `groups`: the columns of the board, in this order, even when empty.

A note made from the view takes what its `=` filters ask for (`type:
Project`), and the column it was made in. The view keeps only how to show
the notes: they stay the only source. The format is described by a
[JSON Schema](https://progressive-web-office.github.io/schemas/notes-view-1.schema.json).

### Bases (`.base` files)

A `.base` file of the folder is a view of its notes written in YAML: open it
from the folder panel. Its **views** are shown as tabs — a **table** or
**cards** — with the columns of `order`, the headers of `properties`
(`displayName`), sections by the value of `groupBy`, the sort of `sort` and
the `limit` of the view.

```yaml
filters:
  and:
    - file.hasTag("project")
    - file.inFolder("Projects")
formulas:
  ttc: price * 1.2
  late: if(due < today(), "late", "")
properties:
  formula.ttc:
    displayName: Price incl. tax
views:
  - type: table
    name: Open
    filters:
      not:
        - status == "done"
    order: [file.name, status, due, formula.ttc, formula.late]
    sort:
      - property: due
        direction: ASC
  - type: cards
    name: By status
    groupBy:
      property: status
      direction: DESC
    limit: 20
```

- **Filters**: an expression, or `and`, `or`, `not` lists of filters (nested
  as needed), for the whole file and for each view.
- **Expressions**: properties (`status`, `note.status`, `note["last
  contact"]`), the fields of the file (`file.name`, `file.basename`,
  `file.path`, `file.folder`, `file.ext`, `file.size`, `file.mtime`,
  `file.ctime`, `file.tags`, `file.links`), formulas (`formula.ttc`, which may
  use other formulas), `== != < <= > >=`, `&& || !`, `+ - * / %`,
  parentheses, lists `[…]`; the functions `if()`, `now()`, `today()`,
  `date()`, `number()`, `link()`, `min()`, `max()`; the methods
  `file.hasTag()` (a tag or a tag under it, `area` for `area/mech`),
  `file.inFolder()`, `file.hasLink()`, `file.hasProperty()`, and `contains`,
  `startsWith`, `endsWith`, `lower`, `upper`, `trim`, `isEmpty`, `.length`
  on text and lists; a date plus or minus a duration (`today() + "7d"`,
  `now() - "1 week"`: `y`, `M`, `w`, `d`, `h`, `m`, `s` or their names),
  a date minus a date (milliseconds), and the parts of a date (`.year`,
  `.month`, `.day`…). Dates written as text (`2026-12-01`) compare as dates.
- **Changes**: a click on a column sorts by it (a second click: the other
  way), kept in the file when it is saved; a double click on a property cell
  changes the property in the note itself, its other lines unchanged.
- **Not supported**: what the system does not know — another function or
  method, `this`, a view of another type, a key it does not read, a line it
  cannot parse — is listed above the view. A filter that cannot be evaluated
  **keeps** the notes it would have filtered, a column that cannot be
  computed shows *not supported*, a view of another type is shown as a table,
  and saving writes the file back as it was, with only the sort changed.
- Browsers do not tell when a file was created: `file.ctime` is the time of
  its last change.

### Querying the notes in SQL

The notes of the folder can be questioned in SQL (NOTE-002), from a
```` ```sql {run} ```` cell of a note — a dashboard — or from a `.sql` file
of the folder, a query kept to run again. Their front matter, tags, links
and tasks are tables:

| Table | Columns |
|-------|---------|
| `notes` | `path`, `name`, `folder`, `size`, `modified` |
| `props` | `path`, `key`, `pos`, `value` — one row per item of a list |
| `tags` | `path`, `tag` (without `#`) |
| `links` | `source`, `target` (the path of the note, or the name written when there is none), `resolved` |
| `tasks` | `path`, `line`, `text`, `done` |

`prop(path, key)` gives the (first) value of a property:

```sql
-- The people, with their organisation.
SELECT name, prop(path, 'organization') AS organization
FROM notes WHERE prop(path, 'type') = '[[Person]]' ORDER BY name;

-- The tasks still to do, by note.
SELECT n.name, k.text FROM tasks k JOIN notes n USING (path) WHERE NOT k.done;

-- The notes linking to Ada.
SELECT source FROM links WHERE target = 'People/Ada Lovelace.md';
```

The tables are read from the index of the notes for each query naming them;
changing them changes no note — the notes stay the only source. SQLite is
downloaded the first time, after you agreed (see
[Code cells](./code.md)).

### Graph of the notes

**🕸** next to the folder's name draws the notes and the links between them
(`[[wiki links]]` and relative Markdown links; a link both ways is a double
arrow), with the number of notes without links. Click a note, or its name
in the list below the graph, to open it.

### Templates of the folder

The documents of a `Templates` folder at the root of the folder are offered
in **Templates and examples**, and **Save as template…** can keep new ones
there: see [Templates](./templates.md#templates-of-a-folder).

::: v-pre
In a Markdown or text template, `{{title}}` (the template's name),
`{{date}}` (`YYYY-MM-DD`), `{{date:DD/MM/YYYY}}` (any format) and `{{time}}`
are filled in when a document is made from it.
:::

## Master documents

A **master document** gathers **sub-documents** — the chapters of a thesis,
a report or a course handout — that stay separate files, written separately,
possibly by different people.

- 📄 (*Include a document*) adds a sub-document at the cursor: choose a
  document of the folder. It shows as a frame with the path of the file and
  an **Open** button.
- **Assemble…** (in the header, for a document with sub-documents) saves the
  master document with the content of its sub-documents as **one file**, in
  the format you choose. Sub-documents may include others; numbering of
  figures, tables and equations, cross-references, footnotes and the
  bibliography run on across them. A missing sub-document, or one that
  includes itself, is reported and left out.

Sub-documents can be in any text format (`.md`, `.odt`, `.docx`, `.tex`…),
mixed in one master document. They are kept as:

| Format | Sub-document |
|--------|--------------|
| OpenDocument (`.odt`, `.odm`) | linked section, as in LibreOffice master documents |
| Word (`.docx`) | Word sub-document (`subDoc`) |
| LaTeX | `\include{chapter}` (`.tex` chapters) |
| Markdown | <code v-pre>{{#include chapters/one.md}}</code> on its own line (mdBook syntax) |

LibreOffice master documents (`.odm`) and LaTeX projects split with
`\include` / `\input` open as master documents. A LaTeX project opened as a
ZIP archive is read with its chapters already in place.

## For developers: the file system module

The explorer is built on `src/fs/`, a module that depends on nothing else in
the application, to be shared later with other web apps (such as QRShare).
It defines one `StorageProvider` interface (`list`, `read`, `write`,
`mkdir`, `move`, `remove`, with `write` and `persistentAccess`
capabilities) and providers for a local folder (File System Access API), the
browser's private storage (OPFS, shared by the apps of the same origin), a
read-only folder picked in any browser and memory, plus a framework-free
`Explorer` component whose texts and icons are given by the host.
