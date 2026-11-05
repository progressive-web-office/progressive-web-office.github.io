---
description: Create and edit text documents (Word, OpenDocument, Markdown, MDZ) in the WYSIWYG editor.
---

# Text documents

The document editor opens **Word** (`.docx`), **OpenDocument Text** (`.odt`),
**Markdown** (`.md`) and **MDZ** (`.mdz`, zipped Markdown with images) files,
any ZIP archive of Markdown files, and **TextBundle** packages (`.textpack`,
from Bear, Ulysses, iA Writer…): their `text.md` opens with its pictures, and
is saved as Markdown or MDZ.

## Editing

The toolbar keeps the most used tools in sight — review mode, undo, the
paragraph style, bold, italic, underline and lists — and groups the others
in menus that open below their button: **A ▾ Format** (strikethrough, code,
font, size, colours), **¶ ▾ Paragraph** (alignment, indents, line spacing),
**＋ ▾ Insert** (links, pictures, tables, equations, code cells, diagrams,
notes, references, table of contents, breaks, snippets), **💬 ▾ Review**
(comments, tracked changes, accessibility), **🎓 ▾ Teaching** (answers,
variants, mail merge) and **📄 ▾ Document** (text tools, view, properties,
page setup). A tool used closes its menu; <kbd>Esc</kbd> or a click elsewhere
too. In a narrow window the menus show their icon only. The header groups the
file actions (**🗂 File**: repository, versions, cloud, commit, read-only) and
the sharing ones (**📤 Share**). **Settings › Toolbars › Full** shows every
tool instead.

### The context menu

A **right click** in the document — or a **long press** on a touch screen, or
the **⋮ Actions** button of the toolbar, or the context-menu key — opens a menu
of what can be done there:

- **Edit**: cut, copy, paste (when the browser lets the page read the
  clipboard; otherwise use <kbd>Ctrl</kbd>+<kbd>V</kbd> or the device's menu);
- on a **link**: open it, edit it, remove it (the text stays);
- in a **table**: insert a row above or below, a column on the left or
  right, delete the row or the column, merge or split cells, make the first
  row a header, delete the table;
- on a **code cell**: run it, run all the cells, edit its code, hide or show
  the code, delete the cell;
- **Insert**: a code cell to run, a **table of the size you pick** in a grid
  (up to 8 × 8; rows and columns can be added afterwards), a picture, an
  equation, a link, a footnote, a comment;
- with a selection, **clear formatting**.

On a phone the menu opens as a sheet at the bottom of the screen, with large
entries; a tap outside closes it. With the keyboard, the arrows move in the
menu, <kbd>Enter</kbd> chooses, <kbd>Esc</kbd> closes it.

| Action | Toolbar | Shortcut |
|--------|---------|----------|
| Undo / redo | ↶ ↷ | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>) |
| Paragraph style | *Normal, Heading 1–4, Quote, Code block* | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>0</kbd>…<kbd>3</kbd> (normal, heading 1–3) |
| Bold / italic / underline | **B** *I* U | <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>U</kbd> |
| Strikethrough | S | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> |
| Inline code | `</>` | <kbd>Ctrl</kbd>+<kbd>`</kbd> |
| Font and size | *Default ▾* and the size field: pick a size or type any one from 1 to 999 pt, then <kbd>Enter</kbd> | <kbd>↑</kbd> / <kbd>↓</kbd> in the size field |
| Text colour / highlight | **A** 🖍 (the swatch chooses the colour, **⋯** by its RGB or CMYK values — see [Colours for print](./printing.md#colours-for-print) —, × removes it) | |
| Clear formatting | ⌫ | <kbd>Ctrl</kbd>+<kbd>Space</kbd> |
| Indent / outdent | ⇢ ⇠ | <kbd>Ctrl</kbd>+<kbd>]</kbd> / <kbd>Ctrl</kbd>+<kbd>[</kbd> |
| Line spacing | ↕ ▾ (1, 1.15, 1.5, 2…) | |
| Paragraph spacing | ¶: left and first-line indents (cm, negative for a hanging indent), space before and after (pt), line spacing | |
| Bulleted / numbered list | •≡ 1≡ | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>8</kbd> / <kbd>7</kbd>; <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> to indent / outdent |
| Alignment | ⇤ ↔ ⇥ ☰ | <kbd>Ctrl</kbd>+<kbd>L</kbd> / <kbd>E</kbd> / <kbd>R</kbd> / <kbd>J</kbd> |
| Line break in the same paragraph | ↵ | <kbd>Shift</kbd>+<kbd>Enter</kbd> |
| Special character (², °, ±, →, α, €, …) | Ω: a grid by group, searched by name | |
| Link | 🔗 | <kbd>Ctrl</kbd>+<kbd>K</kbd> |
| Image | 🖼 (or paste / drop an image) | |
| Signature | **Insert → ✍ Add signature**: drawn or imported, as in the [PDF viewer](./pdf#signing); inserted as a picture at the cursor | |
| Table | ▦ (3×3), then the table bar (below) | <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> to move between cells |
| Horizontal rule | ― | |
| Page break | ⤓ | <kbd>Ctrl</kbd>+<kbd>Enter</kbd> |
| Footnote | ¹ | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> |
| Caption (numbered figure, table or equation) | 🏷 | |
| Cross-reference | ↪ | |
| Citation / bibliography | ❝ 📚 | |
| Table of contents | § | |
| Page setup: paper, margins, header and footer | ▤ | |
| Equation | ∑ (see [Equations](./equations.md)) | <kbd>Ctrl</kbd>+<kbd>M</kbd> |
| Diagram | ⧉ (see [Diagrams](./diagrams.md)) | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> |
| Code cell | { } (see [Code cells](./code.md)) | |

The status bar shows the word and character count.

Fonts that are not installed on the device are shown with a similar one
(serif or sans-serif) but kept in the file, so the document looks right
where the font exists. Formatting that comes from a paragraph style (for
example the size of a heading) is not copied onto the text, so changing the
style in Word or LibreOffice still changes it.

### Footnotes

¹ (or <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd>) adds a footnote at the
cursor. Notes are numbered automatically in reading order and listed under
the page; when printing they come at the end of the document. Write a note
with simple Markdown: `**bold**`, `*italic*`, `[link](https://…)`,
`$equation$`; a blank line starts a second paragraph. Click a note's number
(or its line under the page) to change it; emptying it removes it.

Footnotes are kept in Word (`.docx`) and OpenDocument (`.odt`) files, in
Markdown (`[^1]` with the notes at the end) and in LaTeX (`\footnote{…}`).

### Table of contents

§ inserts a table of contents before the current paragraph. It lists the
headings (Heading 1 to 3) and updates as you write; click an entry to go to
its heading. In Word and LibreOffice it is a real table of contents: Word
recomputes it, with page numbers, when the file is opened (it may ask to
update the fields), and LibreOffice updates it with *Tools › Update*. In
Markdown it is written `[[_TOC_]]` (shown as a table of contents by GitLab,
Typora and others) and in LaTeX `\tableofcontents`.

### Pictures

When you insert a picture (🖼, paste or drag and drop), the app asks for:

- its **alternative text**: what the picture shows, for readers who cannot
  see it (screen readers, text-only exports); tick **Decorative picture**
  when it only decorates;
- an optional **caption**, added below it as a numbered figure (see
  [Captions and cross-references](#captions-and-cross-references)).

Double-click a picture to change its alternative text.

**Retouching a picture.** Right-click a picture (long press on a phone),
then **Edit the picture…**:

- **⟲ ⟳** turn it a quarter, **⇋** mirror it;
- drag on it to **crop** it, or choose **▒ Blur** and drag over a region to
  blur it — a face, a name, a number plate — before sharing the document;
- **🖍 Highlight** a region, draw a red **➚ Arrow**, or click with **T Text**
  to write a label (red, outlined in white to be read on any background);
  **✍ Sign** puts a signature at the bottom right, then drag a box to place
  it there, its proportions kept (a click moves it); **↶** removes the last
  mark;
- **Brightness**, **Contrast** and **Size (%)** (a smaller picture makes a
  lighter document).

Nothing changes until **Apply**; then the change can be undone like any
other (<kbd>Ctrl</kbd>+<kbd>Z</kbd>). JPEG and WebP pictures stay in their
format, the others become PNG.

### Accessibility check

**♿ Check accessibility** lists what makes the document harder to read with
a screen reader or for people with low vision: pictures without alternative
text (or with a file name as text), skipped heading levels (a Heading 3
right after a Heading 1), empty headings, tables without a header row, links
whose text does not say where they go ("click here"), coloured text with a
contrast below 4.5:1, and a missing title or language. **Show** goes to the
issue; **Fix** opens the picture's description, the properties, or turns
the table's first row into a header row.

### Captions and cross-references

🏷 numbers a **figure**, a **table** or an **equation**:

- a figure caption (“Figure 1: …”) goes below the current paragraph, so put
  the cursor on the picture first;
- a table caption goes above the table holding the cursor;
- with the cursor on a display equation (`$$…$$`), *Equation* adds its
  number `(1)` at the end of the line.

Numbers follow the document order and update as you insert, move or delete
captions. The caption is an ordinary paragraph in the *Caption* style: its
text can be edited like any other.

↪ inserts a **cross-reference**: choose a figure, table, equation or heading
in the list. The reference shows “Figure 2”, “Table 1”, “(3)” or the
heading's text, and follows renumbering; <kbd>Ctrl</kbd>+click on it to go
to its target. A reference whose target was deleted shows **??** in red, as
in LaTeX.

| Format | Numbers | References |
|--------|---------|------------|
| Word (`.docx`) | `SEQ` fields in the *Caption* style | `REF` fields to bookmarks (Word updates them with F9) |
| OpenDocument (`.odt`) | `text:sequence` (Figure, Table, Equation) | bookmark references |
| LaTeX | `\captionof{figure}{…}`, `equation` environments, `\label` | `Figure~\ref{…}`, `\eqref{…}`, `\nameref{…}` |
| Markdown | `<a id="…"></a>Figure 1: …`, `$$ … \tag{1}\label{…} $$` | links `[Figure 1](#…)` |

Captions, `\label` and `\ref` of Word, LibreOffice and LaTeX files are
read back as numbers and references.

### Citations and bibliography

📚 holds the document's **sources**: import a BibTeX file (exported by
Zotero, JabRef, Mendeley, Google Scholar…) or paste BibTeX entries, remove
sources, and choose how citations look:

- **numbered**: `[1]`, `[2, 3, p. 12]`, numbered in the order they are first
  cited;
- **author and year**: `(Knuth, 1984; Lamport et al., 1994)`.

❝ inserts a **citation**: search the sources, tick one or more, and give a
page if needed. Click a citation to change it; untick everything to remove
it. *Insert the list of references here* (in 📚) adds the list of the cited
sources, which updates as you cite.

#### From Zotero

Your **Zotero** library can be searched and cited directly:

1. In ❝, click **Zotero…**. The first time, create a key on
   [zotero.org/settings/keys/new](https://www.zotero.org/settings/keys/new)
   (signed in): name it, tick *Allow library access* (read only is enough),
   save it and paste it. The key is kept only in this browser and sent only
   to `api.zotero.org`; **Forget the key** removes it.
2. Type a title, an author or a year: the matching sources of the library are
   listed. Tick them, then **Add and cite**: they join the document's sources,
   with their Zotero citation keys, and are cited at the cursor.

In 📚, **Import a Zotero collection…** adds all the sources of a collection
(a thesis, an article in progress) at once.

| Format | Sources | Citations | List |
|--------|---------|-----------|------|
| Word (`.docx`) | Word sources (*References › Manage Sources*) | `CITATION` fields | `BIBLIOGRAPHY` field |
| OpenDocument (`.odt`) | in the bibliography marks | bibliography marks | bibliography index |
| LaTeX | `references.bib`, also embedded with `filecontents` | `\cite` (`\citep` with natbib) | `\bibliography{references}` |
| Markdown | `references:` in the front matter (pandoc) | `[@key]`, `[@a; @b, p. 12]` | `<div id="refs"></div>` |

Opening a file reads its sources and citations back: Word sources and
citations, Zotero and Mendeley citations in Word files, LibreOffice
bibliography marks, LaTeX `\cite`, `\citep`, `\parencite`… with
`\bibliography`, `\addbibresource` or `thebibliography`. OpenDocument keeps
no page in a citation.

### Tables

▦ inserts a 3×3 table. While the cursor is in a table, a **Table** bar
appears under the toolbar:

| Button | Action |
|--------|--------|
| ⬆+ ⬇+ | insert a row above / below |
| ⬅+ ➡+ | insert a column on the left / right |
| ⬌− ⬍− | delete the row / the column |
| ⊞ | merge the selected cells (select them with <kbd>Shift</kbd>+click or by dragging) |
| ⊟ | split a merged cell |
| H | make the first row a header row (bold, shaded, repeated on each printed page) |
| 🗑 | delete the table |

Buttons that do not apply (merging a single cell, for example) are greyed
out. Merged cells and the header row are kept in Word (`gridSpan`,
`vMerge`, repeated header row), OpenDocument (spanned and covered cells,
header rows) and LaTeX (`\multicolumn`, `\multirow`, a double rule under the
header). Markdown tables cannot merge cells: a merged cell keeps its text in
its first position and the others are left empty; their first row is always
the header.

### Paper and margins

The page on screen is the page on paper: **▤ Page setup** sets the **paper**
(A4, Letter, A5, A3, Legal or any size), its **orientation** and the four
**margins**, in the **unit** chosen there. The page is drawn with that width and those margins, and
a line marks the end of each page's text, where the printer will turn the
page — a vertical spring stretches exactly down to it, and a page break
sends what follows to the top of the next page.

The paper belongs to the document: it is kept in OpenDocument and Word files
(their page layout), in LaTeX (`\usepackage[a4paper,margin=2cm]{geometry}`)
and in Markdown, as Pandoc writes it:

```yaml
---
papersize: a4
geometry: "landscape,top=15mm,right=20mm,bottom=15mm,left=20mm"
---
```

Printing uses it. A document without one gets A4 (Letter in North America)
with 2 cm margins. On a phone, the text takes the width of the screen.

**Rulers** (shown on large screens) frame the page, from the edge of the
paper. Each one is shown or hidden on its own — *View › Horizontal ruler*,
*View › Vertical ruler*, the command palette, or *Settings › Writing*:

- the horizontal ruler stays at the top while scrolling; the margins are
  greyed, and the **left and right margins** can be dragged (by millimetres);
- its triangles are the **indents** of the paragraph of the cursor: the lower
  one the left indent, the upper one the first line — drag them, or focus
  them and use the arrow keys (1 mm per press);
- the vertical ruler runs along the page, the top margin greyed, a red line
  where each page's text ends.

**The unit of measure** — millimetres, centimetres, inches or points;
centimetres by default, inches in the United States — is the one of the
page size: chosen in *Page setup*, *View › Unit of measure* or *Settings ›
Writing*, it is used by the page setup, the indents of *Paragraph spacing*
and the graduations of the rulers alike. It is a preference of yours, not of
the document: the lengths saved are the same whatever the unit.

### Typography

The text is set with the care of TeX, on screen and on paper:

- **paragraphs broken as a whole**, not line by line — no lonely word on a
  last line when the paragraph can avoid it — and **balanced headings**;
- **hyphenation** in the language of the document (*Properties › Language*,
  or `lang:` in the front matter), as TeX does — *View › Hyphenation* turns
  it off;
- kerning and ligatures of the font; no widow or orphan line on paper
  (a paragraph never leaves a single line at the foot or the top of a page);
- **small capitals** (**Sᴄ**, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>)
  — for centuries (<span style="font-variant: small-caps">xix</span>e siècle),
  authors' names, acronyms — kept everywhere: `\textsc{…}` in LaTeX,
  `[…]{.smallcaps}` in Markdown (as Pandoc), and the small capitals of
  OpenDocument and Word.

### Styles

A **style** gives a look a name — *Remark*, *Quotation*, *Instruction* —
so that it is the same everywhere, and changes everywhere at once.

1. Format a paragraph as you like it (font, size, colour, bold, spacing…),
   leave the cursor in it and choose **🅰 Styles…** (in the *Paragraph*
   group, the context menu, or the end of the list of paragraph styles).
2. **New style from this paragraph**, and give it a name. Change what you
   want — the sample shows the result — then **Save the styles**.
3. The styles of the document are at the end of the **list of paragraph
   styles**: choose one to give it to the paragraphs selected.

Changing a style changes every paragraph using it; deleting it turns them
back into normal text. **Apply to this paragraph** gives the style chosen
in the window to the paragraph of the cursor.

Styles are kept as the **named styles** of OpenDocument (`.odt`) and Word
(`.docx`): LibreOffice and Word show them in their own list of styles, and
the styles made there come back in Progressive Web Office. Formatting set
by hand on a word stays on top of the style. Markdown, LaTeX and HTML
keep the text and what was formatted by hand, not the styles.

### Columns

For a newsletter, a school newspaper or a leaflet, part of a document can be
set in **columns**, as in desktop publishing software:

1. select the paragraphs (or put the cursor in one);
2. **▥ Columns…** (in *Insert*, the context menu or the command palette):
   two to six columns, the gap between them (in mm) and an optional line
   between them; a small picture shows the result.

The text flows from one column to the next and the columns are balanced.
A **column break** (**⫼**, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd>)
makes what follows start the next column; it is marked on screen only.
The context menu, inside columns, offers **Change the columns…** and **Back
to one column**. A heading above the columns stays across the whole page —
the *Newspaper* template shows a masthead, an article in three columns with
a rule between them and an interview in two.

Columns are kept in every format:

| Format | Columns | Column break |
|--------|---------|--------------|
| OpenDocument (`.odt`) | a section with columns | `fo:break-after="column"` |
| Word (`.docx`) | continuous sections with `w:cols` | `w:br w:type="column"` |
| LaTeX (`.tex`) | `multicols` (package `multicol`), `\columnsep`, `\columnseprule` | `\columnbreak` |
| Markdown (`.md`) | a fenced div `::: {.columns count=3 gap=14 rule}` … `:::` | `\columnbreak` |

### Header and footer

▤ **Page setup** also sets the header and footer: each has a left, a centre and a right part.
*Insert* adds a field where the cursor is: **page number**, **page count**,
**title** (from the document properties ⓘ) or **date**. *Page number in
the footer* fills the footer's centre with a ready-made number: `1`,
`1/10`, `- 1 -` or `Page 1 of 10`. The header and footer are shown above
and below the page (click them to change them) and printed on every page.

**Page numbering** sets the style of the numbers (`1, 2, 3`, `i, ii, iii`,
`I, II, III`, `a, b, c` or `A, B, C`), the number of the first page (for a
document that continues another one), and can leave the first page without
header and footer, for a title page.

They are kept as real headers and footers in Word and OpenDocument files
(with page fields that the application updates), with `fancyhdr` in LaTeX,
and as `header-left: …`, `footer-center: …` keys in the front matter of a
Markdown file. The numbering is kept in Word (`w:pgNumType`, a different
first page), OpenDocument (the page style's number format, a *First Page*
page style), LaTeX (`\pagenumbering`, `\setcounter{page}`,
`\thispagestyle{empty}`) and Markdown (`page-numbering`, `page-start`,
`first-page-hidden`).

### Fields

A **field** shows a value computed when the document is shown, printed or
opened, rather than text typed once: insert one with **＋ ▾ Insert › ⌗
Field…**, or from the [context menu](#the-context-menu).

| Field | Shows | OpenDocument | Word | Markdown | LaTeX |
|---|---|---|---|---|---|
| Date of the day | 3 October 2026, in the document's language | `text:date` | `DATE` | `{date}` | `\today` |
| Time | 14:05 | `text:time` | `TIME` | `{time}` | (its value) |
| Page number | the page it is on | `text:page-number` | `PAGE` | `{page}` | `\thepage` |
| Number of pages | | `text:page-count` | `NUMPAGES` | `{pages}` | `\pageref*{LastPage}` |
| Title, author | from the document properties | `text:title`, `text:initial-creator` | `TITLE`, `AUTHOR` | `{title}`, `{author}` | `\thetitle`, `\theauthor` |
| File name | | `text:file-name` | `FILENAME` | `{filename}` | `\jobname` |

LibreOffice and Word compute them again: a letter opened next week shows
next week's date. To keep the value it has now — the date a letter was sent
— right-click the field and choose **Replace by its value now**. In the
editor, which shows the document as one long page, the page number is
counted from the page breaks.

**Change a field by clicking it**: the **Field** window chooses what it
shows, the **format** of a date or a time — short (03/10/2026), medium,
long (as usual), full (Saturday 3 October 2026), ISO (2026-10-03) — and
whether it is **today's** (updated) or **always this one** (a fixed date or
time, chosen in a calendar); its value is previewed. **Replace by its value
now** turns it into text, **Delete the field** removes it. In Markdown a
changed field is written `{date:full}`, `{date=2025-12-24}`,
`{time:medium=08:30}`; OpenDocument keeps the format and the fixed date as
such, Word gets the format as a date picture and a fixed date as a locked
field.

In Markdown, write `\{date}` for the text "{date}"; the `{{name}}` of a
[mail merge](#mail-merge) is not a field. The *Letter* template dates the
letter with a field.

### Springs and spaces

As in LaTeX, a **spring** takes the free space: **⇕ Springs and spaces** in
the Insert menu (or the [context menu](#the-context-menu)) inserts

- a **vertical spring** (`\vfill`): the free height of the page is shared by
  its vertical springs — to push a signature or enclosures to the foot of a
  letter, centre a title page vertically…;
- a **vertical space** of a given height (`\vspace{2cm}`);
- a **horizontal spring** (`\hfill`) in a line: the free width of the line is
  shared by its springs — `Jeanne Martin \hfill Paris` puts *Paris* at the
  end of the line, `Left \hfill Centre \hfill Right` spreads three parts.

They can be typed as in LaTeX: `\hfill` then a space; `\vfill`,
`\vspace{2cm}`, `\bigskip`… alone on a line, then <kbd>Enter</kbd>. A spring
has a **weight**: one of weight 2 (`\vspace{\stretch{2}}`,
`\hspace{\stretch{2}}`) takes twice the space of one of weight 1.

**Double-click** a spring or a space (or right-click it, *Change the spring
or space…*) to open its dialog:

- for a spring, its **share of the free space in percent** — with another
  spring on the page, type 30 for 30 % above and 70 % below; the weight is
  worked out from the other springs of the page (or of the line), and can be
  typed too;
- or a **fixed height**, in cm, mm, pt or **% of the page height**
  (`\vspace{0.3\textheight}`: a third of the text height, whatever the
  paper);
- a spring can become a fixed space, and back.

The editor shows the document as one long page: a "page" is what lies between
page breaks, its free height that of the printed page (paper and margins of
the print settings), worked out again before printing.

| | Markdown, LaTeX | OpenDocument, Word |
|---|---|---|
| Vertical spring | `\vfill`, `\vspace{\stretch{2}}` | the space it was last shown with, in a paragraph of style *PWO Spring* |
| Vertical space | `\vspace{2cm}` | the same space, style *PWO Space* |
| Share of the page | `\vspace{0.3\textheight}` | the space it was last shown with, style *PWO Space 30%* |
| Horizontal spring | `\hfill`, `\hspace{\stretch{2}}` | a tab (style *PWO Fill*) to a tab stop: the last spring of a line at its end (right tab), the others where the text after them was shown |

LibreOffice and Word have no springs: there, the document looks as it did
when saved, and the springs come back when it is opened here again.

### Find and replace

🔍 or <kbd>Ctrl</kbd>+<kbd>F</kbd> opens the find bar; <kbd>Ctrl</kbd>+<kbd>H</kbd>
opens it with replacement. Every match is highlighted and counted;
<kbd>Enter</kbd> / <kbd>Shift</kbd>+<kbd>Enter</kbd> go to the next / previous
one. **Aa** matches case, **W** whole words only, **.\*** uses a regular
expression (replacements can then use `$1`, `$2`… for the captured groups).
*Replace all* is a single step that <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes.
<kbd>Esc</kbd> closes the bar.

### Typography and text tools

While you type, the app follows the typography of the document's language
(set in the document properties, else the interface language):

- `"` gives curly quotes (`« … »` with no-break spaces in French, `“ … ”` in
  English, `„ … “` in German) and `'` an apostrophe `’`;
- `--` gives an en dash `–`, a third `-` an em dash `—`, `...` an ellipsis `…`;
- in French, a no-break space goes before `; ! ?` (narrow) and `:`, except
  in web addresses and times (`12:30`).

<kbd>Backspace</kbd> right after a correction undoes it. Code is never
changed. **Text → Typography as you type** turns this off or on.

The **Text** menu also transforms the selection, or the whole document when
nothing is selected, keeping its formatting: curly or straight quotes,
French spacing, dashes and ellipsis, remove double spaces, remove invisible
characters, **join broken lines** (text pasted from a PDF: lines that do not
end a sentence are joined, a word cut with a hyphen is put back together),
sentence case, title case, upper and lower case.

### Writing aids

The **View** menu of the toolbar offers:

- **Readability of the paragraphs**: a mark in the margin of each paragraph,
  green (easy), yellow, orange or red (very difficult), with its reading
  ease, from the length of the sentences and of the words (Flesch in
  English, its Kandel–Moles adaptation in French; hover a paragraph for the
  details). The status bar gives the document's score.
- **Focus mode**: only the text, the paragraph of the cursor in full and the
  others dimmed; <kbd>Esc</kbd> leaves it.
- **Typewriter mode**: the line you write stays in the middle of the screen.
- **Writing goal and statistics**: a number of words to reach in this
  document (its progress shows in the status bar), the words written on each
  of the last 14 days, and a focus timer (25 minutes of work, 5 of break).
  Goals and statistics stay in this browser.

### Snippets

**Snippets** are pieces of text ready to insert: type `;;` and the beginning
of a name (`;;sig`, `;;meeting`…), choose with the arrows and press
<kbd>Enter</kbd>; or choose **Text › Snippets…**. A snippet is Markdown with
fields:

| Field | Becomes |
| --- | --- |
| `${date}`, `${time}`, `${datetime}`, `${weekday}`, `${isodate}` | now, in the document's language |
| `${title}` | the title of the document |
| `${clipboard}` | the text copied |
| `${1:default}`, `${2}`… | places to type, visited in order with <kbd>Tab</kbd> (<kbd>Shift</kbd>+<kbd>Tab</kbd> back, <kbd>Esc</kbd> leaves them) |
| `${0}` | where the cursor ends |

Built-in snippets: date, today, meeting notes, note and warning callouts,
table, signature. **New snippet** in the dialog keeps your own in this
browser (the selected text starts it); ✎ edits and ✕ deletes them. In an
open [folder](./folders.md), the text and Markdown files of its `Snippets`
folder are snippets too, named after the files and shared with the folder.

### Typing shortcuts

At the start of a line, type:

| You type | You get |
|----------|---------|
| `# ` … `###### ` | Heading 1 … 6 |
| `- `, `* ` or `+ ` | Bulleted list |
| `1. ` | Numbered list |
| `> ` | Quote |
| ` ``` ` | Code block (<kbd>Enter</kbd> adds a line; <kbd>Enter</kbd> on an empty last line leaves it) |
| `$x^2$` anywhere | An equation |

<kbd>Enter</kbd> on an empty list item leaves the list, and
<kbd>Backspace</kbd> at the start of a list item outdents it, then turns it
back into a normal paragraph. In a table, <kbd>Tab</kbd> and
<kbd>Shift</kbd>+<kbd>Tab</kbd> move between cells.

## Editing modes

The **View** menu of the toolbar (or the command palette, *Editing mode*)
switches how the document is edited:

- **Visual editing** — the page as it will look (the usual mode);
- **Source** — for a Markdown (`.md`) or LaTeX (`.tex`) file: its text, in
  colour, on the left, and a **live preview** on the right (one above the
  other on a phone). Everything Markdown or LaTeX can say can be typed;
  going back to visual editing, or saving, takes the source into the
  document;
- **Reading** — the toolbar is hidden and the text cannot be changed by
  mistake.

The bar at the top shows the mode and goes back to visual editing in one
click. The mode is remembered for each kind of document (Markdown, LaTeX,
the others): a Markdown writer who prefers the source finds it again with
the next note.

## Comments

Select some text (or put the cursor in a word) and click **💬** or press
<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd>, type the comment, then **Post**
(<kbd>Ctrl</kbd>+<kbd>Enter</kbd>). The first time, the app asks for the
name shown on your comments; it uses the name chosen for real-time
collaboration when there is one.

Commented text is highlighted and the threads are listed beside the page,
in the order of the text (below the page on narrow screens). Click a thread
to select its text; the thread of the text under the cursor is outlined.
Each thread offers:

- **Reply**;
- **Resolve** (its text is no longer highlighted) and **Reopen**;
- **Delete**, which removes the comment from the text; <kbd>Ctrl</kbd>+<kbd>Z</kbd>
  brings it back.

A comment whose text you delete goes with it. Comments are not printed.

Comments are kept when saving:

| Format | How |
|--------|-----|
| DOCX | Word comments, with replies and their resolved state, as Word shows them |
| ODT | LibreOffice comments (annotations), with replies and their resolved state |
| Markdown, MDZ | [CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit): `{==commented text==}{>>Ann: the comment<<}`, replies following |

During a real-time collaboration session, the commented text is shared, but
the comments themselves are not yet: save and share the file instead.

## Exercise sheets and answer keys

Write the exercises and their solutions in one document. Put the cursor in
a solution's paragraphs (or select them) and click **✓ Solution**: they get a
green frame labelled *Solution*. Click **✓** again to make them normal text.

- **👁 Hide the solutions** shows the exercise sheet, on screen and in print;
  click it again for the answer key.
- **Save as… → Exercise sheet without solutions** (`.odt`, `.docx` or
  `.md`) writes a copy without the solutions, next to the document, which
  keeps them: one file to maintain, two to hand out.

Solutions are kept in Word files as content controls named *Solution*, in
OpenDocument files as sections named *Solution1*, *Solution2*… (which
LibreOffice can hide), and in Markdown as fenced divs, as in Pandoc and
Quarto:

```markdown
Compute 2 + 3.

::: solution
2 + 3 = 5
:::
```

### Random variants

::: v-pre
Give each student different values. In the text, write:

| Write | It gives |
|-------|----------|
| `{{R=rand(10..20)}}` | a whole number from 10 to 20, shown here |
| `{{I=rand(0.5..2, 0.5)}}` | 0.5, 1, 1.5 or 2 (with a step) |
| `{{C=choice(red, green, blue)}}` | one of the values |
| `{{P=R*I^2}}` | a value computed from others |
| `{{R}}` | the value of R, again |
| `{{=R*I}}` | a result, computed (in a solution, typically) |
| `{{=R/3\|2}}` | a result with 2 decimals |

Expressions use `+ - * / ^ %`, parentheses and `sqrt`, `abs`, `exp`, `ln`,
`log`, `sin`, `cos`, `tan`, `round(x, n)`, `min`, `max`, `pi`, `e`. Numbers
are written in the document's language (`1,5` in French).

**🎲 Random variants** asks for the number of variants, the format and a
*seed* (the same seed gives the same variants again), then downloads a ZIP
with one sheet per variant (without the solutions), its answer key (with
them), and a CSV table of the values drawn for each variant.
:::

### Bode and Nyquist plots

**📈 Bode / Nyquist plots…** (🎓 Teaching) draws the frequency response of a
transfer function, written as on the board:

| H(s) | |
|------|---|
| `10/((s+1)(s+10))` | products side by side, brackets |
| `K*(1+tau s)/(s(1+2s)^2)` with **Values** `K = 2, tau = 0.5` | named values |
| `2p/(1+0,5p)^2` | `p` for the Laplace variable, decimal commas |

- **Bode diagram**: gain in dB and phase in degrees against ω on a log
  scale; the phase stays continuous below −180°.
- **Nyquist diagram**: H(jω) in the complex plane, ω > 0 solid with an
  arrow, ω < 0 dashed, the point −1 marked.
- The frequencies shown follow the poles and zeros (two decades around
  them); set **From** / **To** as powers of ten to choose them.
- **The gain and phase margins** are worked out, said under the formula and
  marked on the Bode diagram.
- **Step response**: the output for a unit step, with its final value, its
  overshoot, its rise time (10 → 90 %) and its settling time (within 5 %);
  the duration follows the slowest pole, or is set in seconds.
- **Poles and zeros**: poles as ×, zeros as ○, the stable half-plane shaded.
- **Closed loop with unity feedback** draws G/(1+G) instead of G — the step
  response of a corrected loop, its poles.

The plots go in as SVG pictures, with a description for screen readers.

### Quizzes for Moodle and AMC

Write the questions as on any sheet, with **form fields** (☑ Form field):

- **multiple choice**: the question, then a list whose items start with a
  **check box** — ticked for the right answers (one, or several);
- **short answer**: a **text field** in the sentence, holding the expected
  answer (a number makes a numerical question);
- a **drop-down list** in the sentence, set on the right choice.

Headings group the questions. **📝 Export the quiz…** (🎓 Teaching) counts
them and saves:

| Format | For |
|--------|-----|
| **Moodle XML** (`.xml`) | Moodle: *Question bank ▸ Import*; headings become categories |
| **GIFT** (`.txt`) | Moodle and other platforms reading GIFT |
| **AMC** (`.tex`) | [Auto Multiple Choice](https://www.auto-multiple-choice.net/): answer sheets printed, scanned and marked; the choice questions only, shuffled by heading |

With several right answers, each is worth an equal share and each wrong one
takes the same share off. Equations are kept as LaTeX (`\(…\)`).

## Mail merge

Write **fields** in a document as `{{Name}}`, named like the columns of a
table — a CSV or TSV file, or the first sheet of a workbook (`.xlsx`,
`.ods`) whose **first row names the columns**:

```md
Dear {{First name}} {{Name}}, your mark is {{Mark}}/20.
```

**✉ Mail merge…** asks for the table (one of the open folder, or a file of
the device), shows how many rows it has and which fields it lacks (those are
left as they are), then makes:

- **one file per row, in a ZIP archive**;
- **one file per row, in the open folder** (a `… – merge` folder next to the
  document), when the folder can be written;
- **one document, a page per row**, ready to print or save as PDF.

Choose the format (`.odt`, `.docx`, `.md`) and the column naming the files
(the row number otherwise). Answers of exercise sheets are left out.

## Tracking changes

Click **±** (Track changes) to record your edits instead of applying them:
the text you type is underlined in green, the text you delete stays, struck
out in red, both signed with your name and the date. Deleting text you
inserted while tracking removes it. Click **±** again to stop. Formatting
changes and joined paragraphs are not tracked.

The **Changes** panel beside the page lists every change: click one to
select it, **Accept** or **Reject** it, or **Accept all** / **Reject all**.
Accepting an insertion keeps its text; accepting a deletion removes its
text; rejecting does the opposite. A paragraph whose text is all deleted
goes with it once accepted (or once rejected, when it was all inserted).

### Comparing two versions

**⇆ Compare with another version…** (Review group, or the command palette)
takes another file of the same document — an older copy, a version sent
back by a colleague without tracked changes — in any format the application
reads (OpenDocument, Word, Markdown, LaTeX…). Say which one is the newer:
the document becomes the newer version, with what changed since the older
one as **tracked changes**, signed with the newer one's name:

- the paragraphs are matched first, then the words of each paragraph that
  changed: the words removed are struck out, the words added underlined;
- whole paragraphs added or removed are marked whole;
- other blocks that differ (tables, rules…) are shown as in the newer
  version, without marks — the summary counts them.

Read the differences in the **Changes** panel, then accept or reject them;
**Reject all** gives back the older version, **Accept all** the newer one.
<kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes the comparison.

Changes are kept in Word (`.docx`, as Word shows them), OpenDocument
(`.odt`, as LibreOffice shows them) and Markdown (CriticMarkup
`{++added++}` and `{--deleted--}`, without author). A LaTeX export applies
them (accepts every change).

## Pasting

Pasted content is **sanitised**: only headings, paragraphs, basic formatting,
lists, tables, links and images are kept. Scripts, event handlers, styles and
remote resources are removed. Only `http(s)`, `mailto` and `tel` links are
accepted.

## What is preserved

| Feature | DOCX | ODT | Markdown | MDZ |
|---------|:---:|:---:|:---:|:---:|
| Headings 1–6, paragraphs | ✅ | ✅ | ✅ | ✅ |
| Bold, italic, strikethrough, inline code | ✅ | ✅ | ✅ | ✅ |
| Underline | ✅ | ✅ | ✅ (`<u>`) | ✅ (`<u>`) |
| Fonts, sizes, colours, highlight | ✅ | ✅ | ❌ | ❌ |
| Alignment, indents, paragraph and line spacing | ✅ | ✅ | ❌ | ❌ |
| Nested bulleted / numbered lists | ✅ | ✅ | ✅ | ✅ |
| Tables | ✅ | ✅ | ✅ (GFM) | ✅ (GFM) |
| Merged cells, header row | ✅ | ✅ | header row only | header row only |
| Links | ✅ | ✅ | ✅ | ✅ |
| Images | ✅ | ✅ | ✅ (`data:` URI) | ✅ (`assets/images/`) |
| Quotes, code blocks, rules | ✅ | ✅ | ✅ | ✅ |
| Page breaks | ✅ | ✅ | ✅ (`\newpage`) | ✅ (`\newpage`) |
| Columns, column breaks | ✅ | ✅ | ✅ (fenced div, `\columnbreak`) | ✅ (fenced div, `\columnbreak`) |
| Footnotes | ✅ | ✅ | ✅ (`[^1]`) | ✅ (`[^1]`) |
| Table of contents | ✅ (field) | ✅ | ✅ (`[[_TOC_]]`) | ✅ (`[[_TOC_]]`) |
| Header and footer | ✅ | ✅ | ✅ (front matter) | ✅ (front matter) |
| Captions and cross-references | ✅ (fields) | ✅ | ✅ (anchors and links) | ✅ (anchors and links) |
| Citations and bibliography | ✅ (Word sources) | ✅ | ✅ (pandoc) | ✅ (pandoc) |

Comments and tracked changes are kept in all four formats (see
[Comments](#comments) and [Tracking changes](#tracking-changes)).

Other features of Word/LibreOffice files (named styles beyond headings,
sections and page layout) are **not** preserved when saving.

## Document properties

**ⓘ** in the toolbar opens the document properties: title, author, date,
subject, description, keywords, language and licence. They are saved with the
document and read back when it is opened again:

| Format | Where the properties are stored |
|--------|---------------------------------|
| Word (`.docx`) | Core properties (`docProps/core.xml`); no licence field |
| OpenDocument (`.odt`) | `meta.xml` (licence as a custom property) |
| Markdown (`.md`) | YAML front matter at the top of the file |
| MDZ (`.mdz`) | `manifest.json` |
| LaTeX (`.tex`) | `\title`, `\author`, `\date` and the PDF properties (`\hypersetup`) |

## Markdown specifics

- CommonMark with GitHub-flavoured tables and strikethrough.
- `==highlighted text==` is highlighted (in yellow); highlighted text of any
  colour is written so.
- **Callouts** (also called admonitions or alerts): a quote whose first line
  is `[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!DANGER]`… with an optional title
  and `+`/`-` (folding) is drawn as a coloured box, and written back as it
  is:

  ```md
  > [!WARNING] Hot surface
  > Do not touch the heater while it runs.
  ```
- Raw HTML in a Markdown file is displayed as text and never executed;
  only `<u>…</u>` and `<br>` are interpreted.
- Pictures linked with a relative path (`![alt](img/photo.png)`,
  `<img src="img/photo.png">` or `![[photo.png]]`) are shown when the note is
  opened from a folder or an archive; names with spaces or accents work
  whether they are written encoded (`%20`) or not. Pictures on the web are
  downloaded when the server allows it; a notice lists the ones that could
  not be found.
- Saving a note back into its folder keeps relative links as links. Saving
  as a standalone `.md` embeds the other images as `data:` URIs so the file
  stays self-contained. Use **MDZ** (or DOCX, ODT…) to keep the pictures
  with the document.
- A YAML front matter (`---` … `---` at the top of the file) provides the
  document properties: `title`, `author`, `date`, `subject`, `description`
  (or `abstract`), `keywords` (list), `lang` (or `language`) and `license`.
  Other keys (for example `tags` or settings of a static site generator) are
  kept unchanged when the file is saved again. A front matter is written only
  when the document has properties beyond a title equal to its first heading.

See [MDZ packages](../formats/mdz.md) for the package format.
