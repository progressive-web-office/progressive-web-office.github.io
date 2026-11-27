# ZIP archives, source files and pictures

## Opening a ZIP archive

Open a `.zip` file like any document (**Open**, drag and drop, or the file
handler of the installed app). When the archive is not itself a document,
it opens as a folder in the side panel, with its sub-folders and files:

- text documents, spreadsheets, presentations and PDF files open in their
  editors;
- text and source files (C, C++, Python, Java, JavaScript, R, MATLAB, SQL and
  many more) open in the code editor described below;
- pictures (PNG, JPEG, GIF, WebP, SVG, BMP, AVIF) are shown;
- any other file can be downloaded.

An archive inside the archive (🗜️) is a folder too: click it to see its
files. Archives can be nested several levels deep.

Files are decompressed only when you open them, so large archives (up to
1 GB) open quickly. Junk entries added by some systems (`__MACOSX`,
`.DS_Store`, `Thumbs.db`) are left out, and paths that would leave the
archive are ignored.

The search field of the panel also searches the text and source files.

### Changing the archive

Save, create, rename, move or delete files as in any folder: the changes
are kept in the archive in memory, including inside nested archives. To keep
them, click **⬇** next to the archive's name: it downloads the archive with
its changes. Closing a changed archive without downloading it asks for
confirmation.

### Archives that are documents

Some ZIP files are documents and open as such: OpenDocument and Office
files, MDZ files, a LaTeX project (one main `.tex` file with its pictures and
bibliography, see [LaTeX](./latex.md)) and a ZIP holding a single Markdown
note with its pictures. A ZIP holding several LaTeX projects, or LaTeX and
Markdown files next to office documents or source code, opens as a folder.

### A ZIP of notes (a vault)

A ZIP holding **several Markdown notes** — a vault of notes, with or without
the hidden settings folder of a notes application — opens **as a folder**, as the unzipped folder
would: the tree, the search, the links between notes and the graph work in
it. No main document is asked for: its entry note opens and is shown in the
tree — `index.md`, `README.md`, `Home.md`, `Accueil.md`, `Start.md`,
`Welcome.md`, `Sommaire.md` or `Bienvenue.md` (also after a number, such as
`00-Accueil.md`), else the only note at its root; a single folder at the top
of the archive counts as its root. Changes stay in the archive, downloaded
with **⬇**.

## Text and source files

A text or source file opens in a code editor with line numbers, syntax
colouring for its language, folding, bracket matching and search
(<kbd>Ctrl</kbd>+<kbd>F</kbd>). The toolbar shows the language, the encoding
and the line ends, and offers:

- **Wrap long lines**;
- **↧ Go to line** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd>).

<kbd>Tab</kbd> indents the line. To leave the editor with the keyboard, press
<kbd>Esc</kbd> then <kbd>Tab</kbd>.

**Save** keeps the file's name and extension. Files are read as UTF-8 or,
when they are not valid UTF-8, as Windows-1252; they are saved in UTF-8,
keeping their byte order mark and their line ends (LF or CRLF).

Printing a source file prints its text with line numbers and colours.

### Running Python, JavaScript and TypeScript files

A `.py`, `.js`, `.mjs` or `.ts` file shows **▶ Run** in its toolbar
(<kbd>Ctrl</kbd>+<kbd>Enter</kbd>): the file — or only the selected lines —
runs in the same isolated sandbox as the [code cells](./code.md) of
documents, without network access. What it prints, its error and its
matplotlib figures appear below the code; **■** stops a program that runs too
long. Python is downloaded on the first run and works offline afterwards;
TypeScript runs as JavaScript, its types removed. Successive runs share their
variables, like the cells of a notebook.

### Review comments

**💬 Comment the line** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd>) asks
for a comment and writes it above the line of the cursor, as a comment of
the file's language, with your name:

```python
    # REVIEW(Prof): Use sum(xs)
    for x in xs:
```

```c
  // REVIEW(Prof): Check argc first
```

The comments stay in the file, so any editor shows them. They are
highlighted and listed in the **Review comments** panel: **Show** goes to the
line, **Delete** removes the comment. Combined with a ZIP archive, this
lets you comment the files of an archive and download it with the
comments.

Source files are completed as you type: keywords, snippets and the names of
the file. **TypeScript and JavaScript** files are understood by the
TypeScript language service: completions know the types (the members of an
object after a dot, the browser and JavaScript APIs), with their signature and
documentation; TypeScript type errors are underlined (JavaScript: syntax
errors only); hovering a name shows its type. The service (a few megabytes) is
loaded the first time such a file is opened, then kept for offline use.

## Pictures

A picture is shown fitted to the window; **Actual size** shows it at its own
size. The status bar gives its dimensions. SVG pictures are shown as images:
their scripts never run.
