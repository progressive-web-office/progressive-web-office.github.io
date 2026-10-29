---
description: EARS requirements with MoSCoW priorities and roadmap milestones.
---

<!-- Generated from specs/spec.md by scripts/sync-requirements.mjs — edit the source. -->

::: v-pre
# Requirements specification

- Author: [Sébastien Celles](https://github.com/s-celles)
- Status: Draft v1 (2026-10-01, last updated 2026-10-03)
- Notation: [EARS](https://alistairmavin.com/ears/) (Easy Approach to Requirements Syntax)
- Prioritisation: MoSCoW — **M**ust / **S**hould / **C**ould / **W**on't (this time)
- Milestones: see the [roadmap](https://github.com/progressive-web-office/progressive-web-office.github.io/blob/main/ROADMAP.md) (0.0.x = development phases; 0.1.0 = first minor release)

EARS templates used:

| Type | Template |
|------|----------|
| Ubiquitous | The system shall &lt;response&gt;. |
| Event-driven | When &lt;trigger&gt;, the system shall &lt;response&gt;. |
| State-driven | While &lt;state&gt;, the system shall &lt;response&gt;. |
| Unwanted | If &lt;condition&gt;, then the system shall &lt;response&gt;. |
| Optional | Where &lt;feature&gt;, the system shall &lt;response&gt;. |

Each requirement has an ID referenced from tests (`describe('REQ-xxx ...')`).

## 1. Vision

A simple, privacy-friendly office suite that runs **entirely in the browser**
as an installable Progressive Web App, written in TypeScript. It opens, edits
and saves word-processing documents (Word `.docx`, OpenDocument `.odt`, Markdown `.md`
and MDZ packages — zipped Markdown with embedded assets),
spreadsheets (Excel `.xlsx`, OpenDocument `.ods`, `.csv`), presentations
(PowerPoint `.pptx`, OpenDocument `.odp`) and displays PDF files. No document ever leaves the device.

## 2. Platform & architecture (PLT)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| PLT-001 | M | 0.0.1 | The system shall be implemented in TypeScript with strict type checking enabled. |
| PLT-002 | M | 0.0.1 | The system shall process all documents client-side and shall not send document content to any server, except to a destination the user explicitly configured and invoked (git hosting, AI assistant, QRShare hand-off). |
| PLT-003 | M | 0.0.1 | The system shall be installable as a Progressive Web App (web app manifest + service worker). |
| PLT-004 | M | 0.0.1 | While the device is offline, the system shall start and provide all features of previously loaded versions. |
| PLT-005 | S | 0.0.6 | When a new version of the application is available, the system shall inform the user and offer to reload. |
| PLT-006 | S | 0.0.6 | Where the browser supports the File Handling API, the system shall register as a handler for supported file types and open launched files. |
| PLT-007 | M | 0.0.1 | The system shall work in the latest two versions of Chromium-based browsers, Firefox and Safari. |
| PLT-008 | S | 0.0.1 | The system shall apply a Content-Security-Policy that forbids inline scripts and remote script sources. |
| PLT-009 | S | — | Where the browser supports app shortcuts, the system shall offer "New document", "New spreadsheet" and "New presentation" from the icon of the installed application, and shall start the matching new document when it is launched from one of them. |

## 3. File management (FILE)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| FILE-001 | M | 0.0.1 | When the user selects "Open", the system shall let the user pick a local file of a supported type. |
| FILE-002 | M | 0.0.1 | When the user drops a file onto the application window, the system shall open it. |
| FILE-003 | M | 0.0.1 | The system shall detect the document format from the file content (magic bytes / package mimetype), falling back to the file extension. |
| FILE-004 | M | 0.0.1 | If the user opens a file of an unsupported or corrupt format, then the system shall display an explanatory error message and keep the current state unchanged. |
| FILE-005 | M | 0.0.2 | When the user selects "Save", the system shall serialise the document in its original format and deliver it to the user (File System Access API where available, download otherwise). |
| FILE-006 | S | 0.0.2 | When the user selects "Save as" with a target format, the system shall convert the document to that format (docx ↔ odt ↔ md ↔ mdz, xlsx ↔ ods ↔ csv, pptx ↔ odp; PDF is saved as PDF). |
| FILE-007 | M | 0.0.2 | When the user selects "New document", "New spreadsheet" or "New presentation", the system shall create an empty document of that kind. |
| FILE-008 | S | 0.0.6 | The system shall keep a list of recently opened files in browser storage (IndexedDB) and let the user reopen them. |
| FILE-009 | S | 0.0.6 | When the user removes a recent file entry, the system shall delete its stored content. |
| FILE-010 | S | 0.0.2 | While a document has unsaved modifications, the system shall show a modified indicator and warn before the page is closed. |
| FILE-011 | C | 0.0.6 | The system shall autosave a draft of the open document to browser storage every 30 seconds while it has unsaved modifications. |
| FILE-012 | M | 0.0.1 | If a file larger than 200 MB (a ZIP archive: 1 GB) is opened, then the system shall refuse it with an explanatory message. |
| FILE-016 | S | 0.1.0 | The system shall prefer open standards: new documents, spreadsheets and presentations shall be created in OpenDocument formats (`.odt`, `.ods`, `.odp`) by default, and the open format shall be offered first when saving; the user shall be able to choose Microsoft Office formats instead, and the choice shall persist. Opening and saving every supported format shall remain available. |
| FOLDER-001 | S | 0.1.0 | When the user opens a local folder, the system shall list its documents by sub-folder in a side panel, open the one the user selects and, where the File System Access API is available, save it back into the folder (read-only elsewhere); the folder shall be offered again on the start screen, with a way to forget it; *Save as* shall write a new file chosen by the user, outside the folder. |
| FOLDER-002 | S | 0.1.0 | The system shall search a word in all the text documents of the open folder (Markdown, LaTeX, text, BibTeX, Word, OpenDocument), ignoring case and accents, list the documents with extracts, and open a result at its first match. |
| FILE-017 | S | 0.1.0 | When the user shows a document read-only, the system shall show it with a visible read-only banner, refuse edits and in-place saving, and offer to edit a copy; documents from read-only sources (read-only folder, shared link) shall open read-only. |
| FILE-018 | S | 0.1.0 | The system shall offer a gallery of templates and examples (letter, report, meeting minutes, exercise sheet, budget, grade book, invoice, talk, an example document showing the word processor's features, a lab report whose Python cells open with their output and figures already drawn, and a workbook of measurements with charts), in the interface language (English content for languages without a translation); a document created from a template shall be a new, untitled document in the preferred format.; the gallery shall show one kind at a time behind tabs (progressive disclosure) with a search through all of them, and offer drawings and schematics (electrical circuit, ladder diagram, Grafcet, pneumatic circuit, flowchart) and free pictures made by the application (graph paper, colour wheel, pixel-art canvas). |
| FILE-019 | S | 0.1.0 | The system shall let the user save the open document as a template kept in the browser (IndexedDB), list these templates first in the gallery, start a new document from one, and delete them. |
| FILE-020 | S | 0.1.0 | The system shall open the template formats `.ott`, `.ots`, `.otp`, `.dotx`, `.xltx` and `.potx` as new, untitled documents not tied to the template's location (folder, server), and shall save the open document as a template file of its kind, with the template media type (ODF `mimetype` and manifest, OOXML main part content type). |
| FILE-021 | S | 0.2.0 | When the user opens a ZIP archive that is not a document (OpenDocument, Office Open XML, MDZ, a single LaTeX project, a ZIP of Markdown notes), the system shall show it as a folder in the side panel, decompressing each file only when it is opened (archives up to 1 GB, files up to 200 MB), leaving out junk entries and paths leaving the archive, show archives inside the archive as folders (up to 8 levels), keep changes made in it (including in nested archives) in memory, let the user download the archive with its changes and ask before closing a changed archive; files the system cannot show shall be offered for download. |
| FILE-022 | S | 0.2.0 | The system shall open text and source files (plain text, C, C++, Python, Java, JavaScript, TypeScript, R, MATLAB, SQL and other languages, recognised by extension or name) in a code editor with line numbers, syntax colouring for the language, folding, search and go to line, read UTF-8 or else Windows-1252, save them under their own name in UTF-8 keeping their byte order mark and line ends, and print them with line numbers. |
| FILE-023 | S | 0.2.0 | The system shall show pictures (PNG, JPEG, GIF, WebP, BMP, AVIF, ICO, SVG without running scripts) fitted to the window or at their own size, with their dimensions. |
| FILE-024 | S | 0.2.0 | The system shall let the user comment a line of a source file (toolbar or Ctrl+Alt+M): the comment shall be written above the line as a comment of the file's language (`// REVIEW(Author): text`, block syntax where the language has no line comments), with the author asked once; such lines shall be highlighted and listed in a panel to go to or delete them. |
| FILE-025 | S | 0.2.0 | When a document is saved (file, folder, WebDAV, Git), the system shall keep a copy in the browser (IndexedDB), skipping a copy identical to the previous one and keeping the last 30 per document location; it shall list them, keep the current state as a named version, open a version in place of the content (the document keeping its location), download it or delete it. |
| FILE-026 | S | 0.2.0 | When the user clicks the name of the open file, the system shall let them type a new name, the extension being shown apart and kept (not doubled when typed again; names files cannot have refused); Enter or leaving the field renames, Escape cancels. A file of the open folder or archive shall be renamed there (refused when the folder is read-only or the name is taken, the panel and links following it); another file keeps the new name for its next save, in the recent files too; the versions of the file follow it; files of a repository, Grist or a server keep their name. |
| FILE-027 | M | 0.1.0 | When the user drops several files or a folder on the application, the system shall open them in the folder panel (a dropped folder as itself, writable where the browser allows it; several entries as one read-only folder) and show the first document; a single file shall open as before. |
| FILE-028 | S | 0.2.0 | The system shall remember the network places used — repositories (opened, committed to), WebDAV / Nextcloud folders (opened, saved to) — and list them on the start screen to open them again in one click (a repository for reading even without its account); each place can be forgotten, all at once too, and remembering can be turned off in the settings (which forgets them). |
| FILE-029 | S | 0.2.0 | A document opened from or saved to a network place (repository, WebDAV / Nextcloud) shall keep its origin — in its metadata (`Source`, as an address) for text documents and presentations, and with its recent-file entry for every kind — so that, opened again from the recent files or from a copy on disk, **Save** writes it back to the same place (after the usual commit dialog, conflicts still detected); the origin is shown and can be detached from the document; keeping origins can be turned off in the settings. |
| FILE-030 | S | 0.2.0 | The system shall let the user add their own repositories (GitHub, GitLab, Gitea / Forgejo, a folder of one) and cloud folders (Nextcloud / WebDAV) as sources of templates: each source has its tab in the gallery, read when chosen, every document of its folder being a template opened as a new document; a private repository not reached by an account of its site asks for a token to read it; sources are remembered and can be removed. |
| FILE-031 | S | 0.2.0 | A document saved in or opened from the browser's storage shall appear in the recent files and reopen from that storage as it is now; the start screen shall open the browser's storage as a folder. |
| FILE-032 | S | 0.2.0 | A command "Go to file" (Ctrl+Shift+O, and in the command palette) shall list the documents kept in the browser's storage and those of the folder open, the most recently changed first, each with its folders (their first and last ones always shown), and open the one found by typing part of its name or its path. |
| FOLDER-004 | S | 0.1.0 | The system shall provide a file explorer built on a storage-independent `StorageProvider` interface (list, read, write, mkdir, move, remove; capabilities write and persistent access) that depends on nothing else in the application, with providers for local folders and the browser's private storage (OPFS), and shall let the user create, rename, move (drag and drop) and delete files and folders, the open document following a rename or a move. |
| FOLDER-006 | S | 0.1.0 | When the user opens a folder, the system shall let them choose a folder of the device, the browser's private storage (OPFS, kept across visits and shared with the other apps of the same origin) or a Nextcloud / WebDAV account, and the explorer shall create, rename, move and delete files and folders there too. |
| FOLDER-007 | S | 0.1.0 | When the user opens a folder, the system shall also offer the branches of the GitHub and GitLab repositories of the user's accounts: the whole tree listed at once, each change made in the explorer or by saving a document being one commit (a folder move or a deletion included), a new folder holding an empty `.gitkeep`, and a file changed in the repository since it was read not being overwritten. |
| FOLDER-008 | S | 0.1.0 | The file explorer shall show the size and the date of last change of each file, sort the entries by name, date, size or type (folders first) and remember the order chosen; the folder search shall first list the files whose name contains the words searched. |
| FOLDER-009 | S | 0.1.0 | In the file explorer, the arrow keys shall move between entries, Right and Left open and close folders (or go into a folder and back to its parent), Home and End go to the first and last entry, and Enter open a document. |
| FOLDER-010 | S | 0.1.0 | When the user drops files or folders of the device onto the file explorer, or chooses them with its import button, the system shall copy them into the target folder, giving a free name to those whose name is taken. |
| FOLDER-011 | S | 0.1.0 | The file explorer shall let the user select several entries (Ctrl+click, Shift+click, Ctrl+A, Shift+arrows) to delete or move them together, and shall offer to undo the last deletion (up to 64 MB). |
| FOLDER-012 | S | 0.1.0 | The file explorer shall copy, cut and paste files and folders (Ctrl+C, Ctrl+X, Ctrl+V and its menu), within the open folder, giving a free name to those whose name is taken, and duplicate them next to themselves. |
| FOLDER-013 | S | 0.1.0 | The file explorer shall offer the actions on the selected entries, or on the folder for empty space, in a context menu opened by a right click, the Menu key or Shift+F10, usable with the keyboard (arrows, Escape). |
| FOLDER-014 | S | 0.1.0 | The file explorer shall download the selected file as it is, and folders or several entries as a ZIP archive, and copy their paths. |
| FOLDER-015 | S | 0.1.0 | The start screen shall offer to reopen the last five folders of the device opened, most recent first, each of which can be forgotten without touching the folder. |
| FOLDER-016 | S | 0.1.0 | The file explorer shall collapse all its folders, and open the folders leading to the open document to show it, on request. |
| FOLDER-017 | S | 0.1.0 | The folder panel shall list the tags of the folder's Markdown notes (`tags` and `keywords` of their front matter, and `#tags` in their text outside code, links and headings), the most used first with their counts, list the notes of a tag when the user picks it or searches `#tag`, and rename a tag in every note. |
| FOLDER-018 | S | 0.1.0 | The folder panel shall draw the graph of the links between the folder's Markdown notes (wiki links and relative Markdown links), and open the note the user picks in it or in its list. |
| FOLDER-019 | S | 0.1.0 | Beside the open Markdown note, the folder panel shall list the notes related to it, sharing its tags or linked with it either way, the closest first, with the reason. |
| FOLDER-020 | S | 0.1.0 | While a folder is open, the template gallery shall offer the documents of its `Templates` folder (or `_templates`, `Modèles`), opened as new documents; when the folder can be written, *Save as template* shall offer to keep the template there. |
| FOLDER-021 | S | 0.1.0 | When the user types `[[` (or `#` and a letter) in a Markdown note of the open folder, the editor shall list the matching notes (or tags of the folder), and insert the chosen one as a wiki link (or tag) with Enter or Tab. |
| FOLDER-022 | S | 0.1.0 | While a Git repository is open as a folder, the folder panel shall let the user start a new branch from the open one, open another branch, and, on a branch other than the default one, open a pull request (GitHub) or merge request (GitLab) to the default branch. |
| FOLDER-023 | C | 0.1.0 | The editor shall show the `#tags` of a Markdown note of the open folder as tags, and the folder panel shall let the user give each tag a colour, kept for the folder and used in the panel and the notes. |
| FOLDER-024 | C | 0.1.0 | The folder panel shall create notes named and marked (front matter `id`) with an identifier made of the date and time, and a wiki link made of 8 to 14 digits shall go to the note whose name starts with that identifier or whose front matter has it. |
| FOLDER-025 | M | 0.2.0 | The notes of an open folder shall be indexed once — names, aliases, tags, links and the words around each link, not their whole text — in steps that leave the page responsive, with the progress shown; afterwards only the notes changed (by size and date) shall be read again, and links shall be resolved by name without going through every note, so that a folder of thousands of notes opens and its notes show their backlinks and related notes without blocking the browser. |
| FOLDER-026 | S | 0.2.0 | The backlinks of the open note shall be shown at the bottom of its page or in the side panel, as the user sets, sorted by name or by the latest changed, with or without the words around each link, folded or not, the settings kept; on request, the notes writing its name or an alias without a link (unlinked mentions) shall be listed, and a mention made a link in one click. |
| FOLDER-027 | S | 0.2.0 | The note of a day shall be opened, or created when missing, from a month calendar of the folder showing the days that have their note, and from a "today's note" button; it shall be named after its date in a format the user sets (`YYYY/MM/YYYY-MM-DD` by default — a folder per year and month — each `/` making a folder), in a folder (`Daily notes` by default) and from a template the user sets, the template's fields (title, date in a format, time) filled; without a template, a front matter of properties (timestamp, year, MOC, type, title, description, tags `#daily`, see also, previously, events, references, subsequently) shall be written, which the user can save as a template note to change it; the note shall begin with its date as a title, written in the words of the user's language and region (full, long or medium) or in a format the user sets. |
| FOLDER-005 | S | 0.1.0 | When the open folder holds linked Markdown notes, the system shall read and keep the notes' YAML front matter, follow `[[note]]`, `[[note#heading]]` and `[[note|alias]]` links (by name, nearest first, then by alias), offer to create a missing note, show picture embeds `![[image.png]]` from the folder, list the backlinks of the open note, and update links when a note is renamed. |
| FOLDER-003 | S | 0.1.0 | When the user Ctrl+clicks a link to a file of the open folder in a text document, the system shall open that document; links to web pages shall open in a new tab. |

## 4. Word processing (DOC)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| DOC-001 | M | 0.0.2 | When a `.docx` file is opened, the system shall display its paragraphs, headings (levels 1–6), text formatting (bold, italic, underline, strikethrough), lists and tables. |
| DOC-002 | M | 0.0.2 | When an `.odt` file is opened, the system shall display the same features as DOC-001. |
| DOC-003 | M | 0.0.2 | The system shall let the user edit text in a WYSIWYG editor. |
| DOC-004 | M | 0.0.2 | The system shall provide toolbar commands and keyboard shortcuts for bold (Ctrl+B), italic (Ctrl+I), underline (Ctrl+U), undo (Ctrl+Z) and redo (Ctrl+Y / Ctrl+Shift+Z). |
| DOC-005 | M | 0.0.2 | The system shall let the user set the paragraph style (normal, heading 1–3) and toggle bulleted / numbered lists. |
| DOC-006 | M | 0.0.2 | When a text document is saved as `.docx`, the system shall produce a file that Microsoft Word and LibreOffice open without repair prompts. |
| DOC-007 | M | 0.0.2 | When a text document is saved as `.odt`, the system shall produce a valid ODF 1.2+ package (with uncompressed `mimetype` first entry). |
| DOC-008 | M | 0.0.2 | When content is pasted into the editor, the system shall sanitise it to the supported subset (no scripts, no event handlers, no remote resources). |
| DOC-009 | S | 0.0.2 | The system shall let the user set paragraph alignment (left, centre, right, justify). |
| DOC-010 | S | 0.0.2 | The system shall display the word and character count of the document. |
| DOC-011 | S | 0.0.2 | Round-tripping (open → save in the same format → open) shall preserve the features listed in DOC-001. |
| DOC-012 | C | 0.0.6 | When the user selects "Print / Export PDF", the system shall open the browser print dialog with a print-optimised layout. |
| DOC-013 | S | 0.0.2 | The system shall display and preserve embedded images of `.docx`, `.odt` and `.mdz` documents, and let the user insert an image from a local file. |
| DOC-015 | S | 0.0.2 | The system shall support hyperlinks (display, insert, preserve on save). |
| DOC-016 | S | 0.0.2 | The system shall support block quotes, preformatted code blocks and inline code. |
| DOC-017 | S | 0.1.0 | The system shall let the user view and edit the document properties (title, author, date, subject, description, keywords, language, licence) and shall read and write them in every format that supports them: OOXML core properties, ODF `meta.xml`, MDZ manifest, Markdown front matter and LaTeX (`\title`, `\author`, `\date`, hyperref PDF properties). |
| DOC-018 | M | 0.1.0 | The text editor shall edit a structured document model through transactions (ProseMirror) rather than browser editing commands, with its own undo history, Markdown-style shortcuts (`# `, `- `, `1. `, `> `, ` ``` `), list indentation with Tab / Shift+Tab, and paste from other applications limited to the supported content; converting between the editor and the document model shall be lossless. |
| DOC-019 | S | 0.1.0 | The text editor shall find text (Ctrl+F) with match-case, whole-word and regular-expression options, highlight every match with a count, move between matches, and replace the current or all matches (Ctrl+H) in one undoable step, keeping the surrounding formatting. |
| DOC-020 | M | 0.1.0 | The text editor shall set the font, size, text colour and highlight of the selection, a paragraph's left and first-line indents, spacing before and after and line spacing, and clear direct formatting; these shall be kept in DOCX and ODT (direct formatting only, not the values that come from the paragraph style). |
| DOC-021 | M | 0.1.0 | The text editor shall insert page breaks (Ctrl+Enter), distinct from horizontal lines, that start a new page when printing and are kept in DOCX (including breaks inside a paragraph and "page break before"), ODT, Markdown (`\newpage`) and LaTeX. |
| DOC-022 | M | 0.1.0 | The text editor shall insert footnotes (Ctrl+Alt+F) at the cursor, numbered automatically in reading order, listed under the page and printed at the end, edited by clicking the number (inline Markdown: formatting, links, equations, several paragraphs); they shall be kept in DOCX (footnotes part), ODT (text:note), Markdown (`[^n]`, also `^[…]` on import) and LaTeX (`\footnote`). |
| DOC-023 | S | 0.1.0 | The text editor shall insert a table of contents generated from Heading 1–3, updated as headings change, whose entries go to their heading; it shall be kept as an updatable table of contents in DOCX (TOC field recomputed by Word on opening) and ODT, as `[[_TOC_]]` in Markdown (also `[TOC]` on import) and `\tableofcontents` in LaTeX. |
| DOC-024 | S | 0.1.0 | The text editor shall define a header and a footer, each with left, centre and right zones that may contain the page number, page count, title and date; they shall be shown around the page while editing, printed on every page, and kept in DOCX (header/footer parts with fields), ODT (master page), LaTeX (fancyhdr) and Markdown (front matter). |
| DOC-025 | S | 0.1.0 | While the cursor is in a table, the text editor shall offer commands to insert and delete rows and columns, merge and split cells, toggle a header row and delete the table; merged cells and the header row shall be kept in DOCX (gridSpan, vMerge, tblHeader), ODT (spanned and covered cells, header rows), HTML and LaTeX (\multicolumn, \multirow), and Markdown shall keep the header row. |
| DOC-026 | S | 0.1.0 | The text editor shall number figures, tables and equations in document order through captions, and insert cross-references to them and to headings that follow renumbering and show `??` when their target is missing; numbers and references shall be kept in DOCX (SEQ and REF fields, bookmarks), ODT (sequences, bookmark references), LaTeX (\captionof, equation, \label, \ref, \eqref, \nameref) and Markdown (anchors, links, \tag), and read back from these formats. |
| DOC-027 | S | 0.1.0 | The text editor shall keep a bibliography of sources imported from BibTeX, insert citations of one or more sources with an optional page, numbered in citation order or by author and year, and a list of the cited references that follows the citations; sources and citations shall be kept in DOCX (Word sources, CITATION and BIBLIOGRAPHY fields), ODT (bibliography marks and index), LaTeX (\cite, BibTeX file) and Markdown (pandoc citations and references), and read back from these formats and from Zotero and Mendeley citations in Word files. |
| DOC-044 | S | 0.2.0 | The text editor shall offer switchable editing modes for a document: visual (WYSIWYG), source (the Markdown or LaTeX text, highlighted, with a live preview) and reading (no toolbar); the choice shall persist per document kind. |
| DOC-045 | S | 0.2.0 | The system shall let the user change again everything a template puts in a document: the share of a spring (in percent of the free space, or as a weight) and the height of a space (cm, mm, pt or percent of the page height, `\vspace{0.3\textheight}`), opened by a double click; what a field shows; the depth of a table of contents; the spacing of a paragraph from the context menu; any number format code of a cell; the background of a slide and the vertical alignment of a text box. |
| DOC-046 | M | 0.2.0 | The system shall keep the paper (size, orientation) and the four margins of a text document, read and written in OpenDocument (page layout), Word (section properties), LaTeX (`geometry`) and Markdown (Pandoc's `papersize` and `geometry`), set them in the page setup, show the page on screen with that width and those margins and a boundary at the end of each page's text, make a page break start the next page there, lay springs out and print with them. |
| DOC-047 | S | 0.2.0 | Where the screen is large enough, the system shall show graduated rulers around the page (centimetres, or inches in the United States, from the edge of the paper): the horizontal one with the margins greyed and draggable and the left and first-line indents of the current paragraph draggable or moved with the arrow keys, the vertical one with the top margin greyed and the end of each page's text marked; they can be hidden. |
| DOC-048 | S | 0.2.0 | The system shall set text as TeX does where the browser allows it: paragraphs broken as a whole and balanced headings, hyphenation in the document's language (which can be turned off), kerning and ligatures, no widow or orphan line in print; and offer small capitals, kept as `\textsc` in LaTeX, Pandoc's `[…]{.smallcaps}` in Markdown and the small capitals of OpenDocument and Word. |
| DOC-049 | S | 0.2.0 | The system shall set selected blocks of a text document in two to six columns, with the gap between them and an optional line between them, filled one after the other and balanced, with column breaks, changed again or removed from the context menu; kept as sections with columns in OpenDocument, continuous sections in Word, `multicols` in LaTeX and `::: {.columns}` fenced divs with `\columnbreak` in Markdown, on screen and in print; and offer a newspaper template. |
| DOC-050 | S | 0.2.0 | When the user clicks a field, the system shall let them change what it shows, the format of a date or a time (short, medium, long, full, ISO) and whether it is the current one or a fixed one, with a preview, turn it into text or delete it; the format and the fixed value shall be kept in Markdown (`{date:full=2025-12-24}`), OpenDocument and Office Open XML. |
| DOC-051 | S | 0.2.0 | The system shall insert a line break and special characters (superscripts and subscripts, degrees, signs of mathematics, arrows, Greek letters, punctuation, currencies and units), chosen in a grid searched by name, from the Insert group and the command palette. |
| DOC-052 | S | 0.2.0 | The system shall compare the document with another version chosen as a file (any text format it reads), matching paragraphs then words, and show what changed from the older to the newer version as tracked changes (REV-005) signed with the newer version's name, to accept or reject; other blocks that differ shall be counted. |
| DOC-053 | S | 0.2.0 | The system shall let the user make named paragraph styles from the look of a paragraph (font, size, colour, bold, italic, underline, small capitals, alignment, spacing before and after, indents, line spacing), change, rename and delete them and give them to paragraphs, every paragraph of a style following its changes; it shall save them as the named styles of OpenDocument and Word and read back those of either format that are not built in, and share them in real-time collaboration. |
| DOC-054 | S | 0.2.0 | The system shall let the user show or hide the horizontal and the vertical ruler each on its own, from the View menu, the command palette and the settings, and choose the unit of measure (millimetres, centimetres, inches or points; centimetres by default, inches in the United States) used alike by the page setup, the paragraph indents and the graduations of the rulers; the choice shall be kept in the browser and apply to every document open. |
| BIB-010 | S | 0.2.0 | Where the user gives a Zotero API key (created with library access, kept only in this browser and sent only to api.zotero.org, forgettable), the system shall search the user's Zotero library by title, author or year and add the sources chosen to the document while citing them, and import all the sources of a Zotero collection, keeping Zotero's citation keys. |
| BIB-011 | S | 0.2.0 | The system shall offer a scientific article template: page and margins, title, authors and affiliations, abstract, keywords, the usual sections, a numbered equation and a captioned table referenced from the text, citations and the list of references. |
| DOC-031 | S | 0.2.0 | While typing in a text document with typography on (the default, a setting kept by the browser), the system shall replace straight quotes with the curly quotes of the document's language (French « » with no-break spaces, English, German…), `'` after a letter with an apostrophe, `--` and `---` with en and em dashes, `...` with an ellipsis, and in French put a narrow no-break space before `; ! ?` and a no-break space before `:`, except in code, web addresses and times; Backspace shall undo a correction. |
| DOC-032 | S | 0.2.0 | The system shall transform the selected text, or the whole document, keeping its formatting: curly or straight quotes, French spacing, dashes and ellipsis, removal of double spaces and invisible characters, joining of lines that do not end a sentence (with words cut by a hyphen put back together), sentence case, title case, upper and lower case. |
| DOC-033 | S | 0.2.0 | The system shall show on demand the reading ease of each paragraph of a text document (Flesch for English, Kandel–Moles for French), as a coloured mark with the score and words per sentence, and the document's score in the status bar. |
| DOC-034 | S | 0.2.0 | The system shall let the user set a word goal per document, shown with its progress in the status bar, keep the words written each day (the last 14 days shown), and run a focus timer (25 or 5 minutes) shown in the status bar. |
| DOC-035 | S | 0.2.0 | The system shall offer a focus mode (toolbars and panels hidden, other paragraphs dimmed, Escape to leave) and a typewriter mode (the line of the cursor kept in the middle of the screen). |
| DOC-036 | S | 0.1.0 | When the user runs a mail merge on a document with `{{Field}}` placeholders and a table (CSV, TSV, workbook) whose first row names the fields, the system shall produce one document per row (as a ZIP archive or in the open folder) or one document with a page per row, in the chosen format. |
| DOC-037 | S | 0.1.0 | The editor shall insert snippets (built-in, of the user, or of the open folder's `Snippets` folder) chosen from a list or by typing `;;` and their name, filling their fields (date, time, title, clipboard) and visiting their places to type (`${1:default}`) with Tab. |
| DOC-038 | S | 0.1.0 | When the user opens a KaimonSlate notebook (a `.jl` file of `#%%` cells), the system shall show its text cells as formatted text and its code cells as Julia cells with their headers, and save it back with its headers, ids and tags kept and unchanged text cells written as they were. |
| DOC-039 | S | 0.1.0 | When the user opens a marimo notebook (`.py` with `@app.cell` functions), the system shall show its `mo.md` cells as text and its other cells as runnable Python cells, and save it back in marimo's format, unchanged cells as written and edited cells with their arguments and returned names recomputed. |
| DOC-041 | S | 0.1.0 | When the user inserts a field (date of the day, time, page number, number of pages, title, author, file name), the system shall show its current value, keep it as a field in OpenDocument, Word, Markdown and LaTeX files so that it is computed again when they are opened or printed, and let the user replace a field by its value. |
| DOC-042 | S | 0.1.0 | When the user inserts a vertical or horizontal spring, the system shall share the free height of the page among its vertical springs and the free width of the line among its horizontal springs, in proportion to their weights, on screen and in print; keep them as springs in Markdown and LaTeX, and in OpenDocument and Word as the space last shown, marked so that they are read back as springs; and offer fixed vertical spaces. |
| DOC-029 | S | 0.1.0 | The system shall number pages in a chosen style (decimal, lower or upper roman numerals, lower or upper letters), with ready-made forms (`1`, `1/10`, `- 1 -`, `Page 1 of 10`), starting from a chosen number and optionally without header and footer on the first page (title page); shown on screen, printed, and kept in DOCX, ODT, LaTeX and Markdown. |
| DOC-030 | S | 0.2.0 | The system shall check the accessibility of a text document and list, with a way to each one and a fix where possible: pictures without alternative text or with a file name as text, skipped heading levels, empty headings, tables without a header row, links with vague texts or bare addresses, coloured text with a contrast ratio below 4.5:1 (WCAG), and a missing title or language. |
| DOC-028 | S | 0.1.0 | The text editor shall let a master document include sub-documents by path, kept as OpenDocument linked sections, Word sub-documents, LaTeX `\include` and Markdown include lines (mdBook syntax); when the user assembles it, the system shall save the master document with the content of its sub-documents, recursively, as one file in a chosen format, numbering, cross-references and bibliography running across them, and report missing or self-including sub-documents. |
| DOC-043 | S | 0.1.0 | When a Markdown file starts with a YAML front matter, the system shall read the document properties from it and keep the keys it does not interpret unchanged on save; when saving Markdown with properties, it shall write them as front matter. |
| DOC-014 | W | — | Track changes, comments, footnotes, headers/footers editing and mail merge. |

## 4b. Markdown & MDZ packages (MD)

MDZ is the ZIP-based Markdown package format specified by the
[wflixu/mdz](https://github.com/wflixu/mdz) project (spec v1.1.0, MIT):
`index.md` + `manifest.json` + `assets/{images,videos,audio,files}/`,
extension `.mdz`, MIME type `application/x-mdz`. This project implements it
as a compatible producer/consumer and contributes a JSON Schema for the
manifest (`schemas/mdz-manifest-1.schema.json`), to be proposed upstream.

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| MD-001 | M | 0.0.2 | When a `.md` / `.markdown` file is opened, the system shall parse it as CommonMark with GFM tables and strikethrough, and display it in the WYSIWYG editor. |
| MD-002 | M | 0.0.2 | When a document is saved as `.md`, the system shall serialise headings, emphasis, strikethrough, inline code, links, images, lists (nested), block quotes, code blocks and tables as Markdown. |
| MD-003 | M | 0.0.2 | The Markdown parser shall treat raw HTML as text, so that opening a Markdown file never executes script. |
| MD-004 | M | 0.0.2 | The system shall read and write MDZ packages conforming to wflixu/mdz specification v1.1.0: a ZIP archive with a UTF-8 `index.md`, a `manifest.json` and an optional `assets/` folder. |
| MD-005 | M | 0.0.2 | When saving MDZ, the system shall write a manifest with `version` "1.1.0", `title`, `date` (ISO 8601), `filename` and one `assets` entry (`id`, `path`, `type`, optional `alt`) per embedded asset, valid against the project JSON Schema. |
| MD-006 | M | 0.0.2 | If an MDZ package has no `index.md`, a missing or malformed `manifest.json`, a manifest invalid against the schema, or a major `version` other than 1, then the system shall refuse it with an explanatory message. |
| MD-007 | M | 0.0.2 | If an MDZ path (manifest asset path or link target) is absolute, contains `..` segments or a backslash, then the system shall not resolve it (zip-slip protection). |
| MD-008 | M | 0.0.2 | When a document with images is saved as MDZ, the system shall store each distinct image once under `assets/images/` (content-addressed file name) and reference it with a `./assets/images/...` relative link. |
| MD-009 | S | 0.0.2 | When an MDZ package is re-saved, the system shall preserve unknown manifest fields (including `x-*` extensions), `author`, and asset files it does not display (videos, audio, files). |
| MD-010 | S | 0.0.2 | Where an MDZ manifest uses a newer 1.x version or unknown fields, the system shall open it and ignore the unknown fields. |
| MD-011 | C | 0.2.0 | Import of TextBundle (`.textpack`) packages. |
| MD-012 | S | 0.0.2 | The documentation shall describe MDZ support, its compatibility with wflixu/mdz and publish the JSON Schema. |
| MD-014 | M | 0.0.2 | When a plain ZIP archive containing Markdown file(s) and images but no MDZ manifest is opened, the system shall import it as a document and resolve relative image links inside the archive. |
| MD-016 | M | 0.0.2 | When such a ZIP contains exactly one Markdown file, the system shall use it as the entry document. |
| MD-017 | M | 0.0.2 | When such a ZIP contains several Markdown files, the system shall ask the user to choose the entry document, pre-selecting `index.md`, else `README.md`, else the first file in alphabetical order; if the user cancels, then the system shall not open the archive. |
| MD-015 | M | 0.0.2 | When an imported plain ZIP is saved, the system shall produce a conforming `.mdz` package (generated `manifest.json`, `index.md`, images moved to `assets/images/` with rewritten links). |
| MD-018 | M | 0.1.0 | When a Markdown note opened from a folder or an archive links pictures (`![](path)`, `<img src>`, `![[name]]`, with encoded or plain names), the system shall display them, write them back as relative links when the note is saved into its folder, and include them when the note is exported (MDZ, DOCX, ODT, standalone Markdown); pictures that cannot be found shall be reported. |
| MD-019 | S | 0.1.0 | The Markdown reader and writer shall support highlighted text (`==text==`) and callouts (a quote starting with `[!TYPE]`, optional title and `+`/`-`), which the editor shall draw as coloured boxes by type, keeping them unchanged on save. |
| MD-013 | C | — | Upstream collaboration with wflixu/mdz: propose the JSON Schema, an optional uncompressed `mimetype` first entry for magic-byte detection, and path-safety rules. |

## 4c. Mathematical equations (MATH)

Equation editing uses [MathLive](https://cortexjs.io/mathlive/) (MIT), whose
`<math-field>` web component offers WYSIWYG editing of LaTeX with a virtual
keyboard. Equations are stored as LaTeX in the document model.

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| MATH-001 | M | 0.0.7 | The system shall let the user insert an inline or display equation in a text document and edit it in a MathLive math field (keyboard, virtual keyboard and LaTeX input). |
| MATH-002 | M | 0.0.7 | The system shall render equations in the document view without network access (fonts bundled with the application). |
| MATH-003 | M | 0.0.7 | When a document is saved as Markdown or MDZ, the system shall write inline equations as `$…$` and display equations as `$$…$$`, and parse them back when reading. |
| MATH-004 | M | 0.0.7 | When a document is saved as ODT, the system shall embed each equation as a MathML formula object (with the LaTeX source as annotation), and read MathML formula objects back. |
| MATH-005 | M | 0.0.7 | When a document is saved as DOCX, the system shall write equations as Office Math (OMML) for the supported subset (fractions, scripts, roots, sums/integrals, matrices, Greek letters, operators) and read OMML back into LaTeX. |
| MATH-006 | C | — | Equation support in presentations and spreadsheet cell comments. |
| MATH-007 | W | — | Computer-algebra features (solving, plotting). |

## 4d. Diagrams (DIAG)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| DIAG-001 | M | 0.1.0 | The system shall let the user insert a Mermaid diagram in a text document and edit its source in a dialog with a live preview and starter templates (flowchart, sequence, class, state, entity-relationship, Gantt, pie, mind map). |
| DIAG-002 | M | 0.1.0 | The system shall render diagrams in the document view, in print and in exports without network access, loading the diagram engine only when a document contains or inserts a diagram; when the source is invalid, the system shall show the error and keep the source unchanged. |
| DIAG-003 | M | 0.1.0 | The system shall render diagrams in Mermaid's strict security mode, as images, so that diagram source cannot run scripts or load remote content. |
| DIAG-004 | M | 0.1.0 | When a document is saved as Markdown or MDZ, the system shall write each diagram as a fenced ```` ```mermaid ```` code block, and parse such blocks back into diagrams when reading. |
| DIAG-005 | M | 0.1.0 | When a document is saved as DOCX or ODT, the system shall embed each diagram as a PNG picture whose title is `mermaid` and whose description holds the Mermaid source, and read such pictures back as editable diagrams. |
| DIAG-006 | S | 0.1.0 | When a document is saved as LaTeX, the system shall include each diagram as a PNG graphic preceded by its Mermaid source in comments. |
| DIAG-007 | S | 0.1.0 | When a diagram cannot be rendered while saving, the system shall write its source as text so that no content is lost. |
| DIAG-008 | C | — | Other diagram languages (PlantUML, Graphviz) and freehand diagrams (draw.io). |

## 4e. Code cells (CODE)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| CODE-001 | M | 0.1.0 | The system shall let the user insert Python or JavaScript code cells in a text document and edit their code. |
| CODE-002 | M | 0.1.0 | When the user asks to run a cell (or all cells), the system shall run it with Python (Pyodide, served by the application and cached for offline use after its first use) or JavaScript; Python cells of a document shall share one interpreter. |
| CODE-003 | M | 0.1.0 | The system shall run code only in an isolated sandbox (opaque-origin iframe and worker) that has no network access and no access to the application's page, storage, keys or other documents, and shall let the user stop a running cell at any time. |
| CODE-004 | M | 0.1.0 | Before the first run in an open document, the system shall explain what running the code implies and ask for confirmation; code shall never run when a document is opened. |
| CODE-005 | M | 0.1.0 | The system shall keep the last output of each cell (printed text, errors, matplotlib figures) in the document and display it without running the code again; changing the code shall clear the stale output. |
| CODE-006 | M | 0.1.0 | When a document is saved as Markdown or MDZ, the system shall write each cell as a fenced block with the `{run}` attribute (e.g. ```` ```python {run} ````), followed by its output as a ```` ```text {output} ```` block and its figures as images titled `output`, and read them back. |
| CODE-011 | S | 0.2.0 | The system shall complete code as it is typed, in the editor of a cell and in source files: keywords, built-ins, snippets and the names of the code, the standard objects of JavaScript and TypeScript with their members; once Python has run a cell, the completions of a Python cell shall come from the running interpreter (the variables of earlier cells, the members of a module after a dot), with signatures and documentation, without starting Python only for this. The cell editor shall highlight, indent and close brackets. |
| CODE-012 | S | 0.2.0 | For TypeScript and JavaScript (source files and JavaScript cells), the system shall use the TypeScript language service, in a worker loaded on first use and then kept for offline use: completions that know the types (members after a dot, browser and JavaScript APIs) with signature and documentation, type errors underlined for TypeScript and syntax errors for JavaScript, the type of a name under the pointer; without it, the completion of CODE-007 shall be used. |
| CODE-013 | S | 0.2.0 | The system shall let the user hide the code of a cell, or of every cell of the document, its output (text and figures) staying shown; a hidden code shall not be shown, printed or exported to Word, OpenDocument or LaTeX, shall be kept in Markdown and MDZ (`{run hide}`) and in the editor, and the cell shall still run. |
| CODE-014 | S | 0.2.0 | The system shall find the names each code cell defines and uses (Python, JavaScript), run cells in the order of their dependencies, share the top-level names of JavaScript cells as for Python, mark the cells depending on a changed or run cell as out of date (or, as the user chooses, run them too, or keep the notebook behaviour without dependencies), run the out-of-date cells a cell uses before it, report a name defined in several cells and cycles instead of running them (names starting with `_` staying local to their cell), and remove from the interpreter the names no cell defines any more. |
| CODE-015 | S | 0.2.0 | When the user asks for it (View menu, or from a cell), the system shall show the dependency graph of the code cells next to the document: one node per cell with its number, language and defined names, coloured by state (run, out of date, failed, failed through a cell it uses, not run), one link per dependency labelled with the names it carries; clicking a node shall go to its cell, the graph shall follow the changes and the runs, and the same information shall be given as a list. |
| CODE-016 | S | 0.2.0 | The system shall host anywidget widgets (AFM: initialize and render, the model interface, abort signals, composition) shown by code cells: from Python through the bundled anywidget, ipywidgets, comm and psygnal packages (with the ipywidgets boxes, grid, layout, label and HTML), and from JavaScript cells (`widget`, `display`, `ui`, `importWidget`); each view shall run in an isolated frame without network; changes shall travel both ways, and a widget marked with `ui` shall re-run the cells using it when the user changes it; `pwo.install` shall install pure Python wheels from a URL, a `wheel.txt` list or the package index, and `importWidget` read a module, after the user allowed the site, kept for offline use; saving and printing shall keep a picture of each widget, used by print, exports and the reopened document. |
| CODE-017 | S | 0.1.0 | When a Python, JavaScript or TypeScript file is open in the code viewer, the system shall let the user run it, or its selected lines, in the code-cell sandbox, and show its output, errors and figures, with a way to stop it. |
| CODE-018 | S | 0.1.0 | When the user runs code in a language whose runtime is not part of the application (Lua, SQL, R, C/C++), the system shall ask before downloading the runtime from its CDN, check each file against a pinned SHA-256, keep it for offline use, and run the code in the code-cell sandbox. |
| CODE-019 | S | 0.1.0 | When the user runs a file of an open folder, the system shall copy the files of its project (the folder of the file, or the nearest folder above holding a project file such as `pwo.toml`) into the sandbox, so that the code can import its modules and read its data files, and shall run the entry point, arguments, compiler options and standard input named by `pwo.toml`. |
| CODE-020 | S | 0.2.0 | The system shall let the user insert code cells in languages it does not run — shells (Bash, PowerShell), Julia, the most used languages of the TIOBE index (Java, C#, Visual Basic, Rust, Fortran, Go, Pascal/Delphi, PHP, assembly, Ada, Swift, Objective-C, COBOL…) and usual formats (HTML, JSON, YAML, LaTeX…) — shown in colour, edited with completion of the language's words and of the code's, without Run, and kept in Markdown as a `{cell}` fence (a cell run in the browser staying `{run}`). |
| CODE-007 | S | 0.1.0 | When a document is saved as DOCX, ODT or LaTeX, the system shall write each cell as its code followed by its last output (text and pictures). |
| CODE-008 | S | 0.1.0 | Where Python code imports packages that are not in the standard library (numpy, matplotlib…), the system shall download them from the Pyodide CDN on first use, verify them against the hashes of the bundled lock file, and cache them for offline use. |
| CODE-009 | C | — | Other languages (R, Julia…), interactive widgets, and sharing data between cells and the document's tables. |
| CODE-010 | W | — | Running code automatically when a document is opened. |

## 5. Spreadsheets (SHEET)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| SHEET-001 | M | 0.0.3 | When an `.xlsx` file is opened, the system shall display every worksheet with its cell values (text, numbers, booleans) and formulas. |
| SHEET-002 | M | 0.0.3 | When an `.ods` file is opened, the system shall display the same content as SHEET-001. |
| SHEET-003 | M | 0.0.3 | When a `.csv` file is opened, the system shall detect the delimiter (comma, semicolon, tab) and display a single worksheet. |
| SHEET-004 | M | 0.0.3 | The system shall let the user select a cell and edit its content via the cell or a formula bar. |
| SHEET-005 | M | 0.0.3 | The system shall let the user navigate cells with arrow keys, Tab, Shift+Tab and Enter. |
| SHEET-006 | M | 0.0.3 | When a cell content starts with `=`, the system shall evaluate it as a formula supporting arithmetic (+ − × ÷ ^ unary −, parentheses), comparison operators, `&` concatenation, cell references, ranges and the functions SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, ROUND, ABS, AND, OR, NOT, CONCAT, LEN, UPPER, LOWER. |
| SHEET-007 | M | 0.0.3 | When a cell changes, the system shall recompute all dependent formulas. |
| SHEET-008 | M | 0.0.3 | If a formula is invalid, refers to itself (directly or indirectly) or divides by zero, then the system shall display an error value (`#ERROR!`, `#CYCLE!`, `#DIV/0!`, `#NAME?`, `#VALUE!`) instead of failing. |
| SHEET-009 | M | 0.0.3 | When a spreadsheet is saved as `.xlsx`, `.ods` or `.csv`, the system shall write values and formulas in that format. |
| SHEET-010 | S | 0.0.3 | The system shall let the user add, rename and switch worksheets. |
| SHEET-011 | S | 0.0.3 | The system shall let the user insert and delete rows and columns. |
| SHEET-012 | S | 0.0.3 | Where formulas are written to `.ods`, the system shall translate references to OpenFormula syntax (`of:=SUM([.A1:.B2])`) and back when reading. |
| SHEET-013 | C | 0.0.6 | The system shall support copy / paste of cell ranges as tab-separated text. |
| SHEET-014 | S | 0.2.0 | The system shall let the user format the selected cells (bold, italic, underline, text colour, fill colour, borders, horizontal alignment) from the toolbar or with Ctrl+B/I/U, clear the formatting (Ctrl+Space) while keeping values and number formats, show the formatting on screen and in print, and keep it in XLSX (fonts, fills, borders, alignment) and ODS (cell styles), including formatted empty cells. |
| SHEET-015 | W | — | Pivot tables, macros. |
| SHEET-016 | S | 0.1.0 | The system shall let the user sort the rows of a range (the selection, or the filled block around the active cell) by one column, ascending or descending, keeping an optional header row in place: numbers before text, text compared without case or accents, empty cells last, by computed values, with formulas translated as they move; one undo step restores the order. |
| SHEET-017 | S | 0.1.0 | The system shall let the user freeze the rows above and the columns left of the active cell (the first row from A1), which stay in view while the sheet scrolls, unfreeze them, and keep frozen panes in XLSX (`pane state="frozen"`) and ODS (`settings.xml`). |
| SHEET-018 | S | 0.2.0 | The system shall keep the autofilter of a sheet (its range and, per column, the values shown) when reading and writing XLSX (`autoFilter`, hidden rows, `_xlnm._FilterDatabase`) and ODS (database range with filter buttons, `table:visibility="filter"`), and let the user turn it on for a range and choose the values shown in each column, the other rows being hidden. |
| SHEET-020 | M | 0.1.0 | The system shall let the user insert column, bar, line, pie and scatter charts drawn from a range of a sheet (first column: categories or x values; other columns: series; optional header row with series names), proposing the selection or the block of data around the active cell; charts shall update when the data changes and follow inserted or deleted rows and columns. |
| SHEET-021 | M | 0.1.0 | The system shall draw charts as accessible SVG (title, legend for several series, value tooltips) with a colour-blind-checked categorical palette, and let the user move, resize, edit and delete them with the mouse or the keyboard. |
| SHEET-022 | M | 0.1.0 | When a workbook is saved as XLSX or ODS, the system shall write its charts as native charts (DrawingML chart parts; ODF chart objects anchored in their cell) that Excel and LibreOffice display, and read them back. |
| SHEET-023 | S | 0.1.0 | The system shall let the user copy a chart as a PNG image (to paste it into a document or a slide), and print charts with their sheet. |
| SHEET-024 | S | 0.2.0 | The system shall evaluate the mathematical (`EXP`, `LN`, `LOG`, `LOG10`, `SIGN`, `SUMSQ`), trigonometric (`SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `SINH`, `COSH`, `TANH`, `DEGREES`, `RADIANS`) and statistical functions (`VAR`, `VARP`, `STDEV`, `STDEVP`, `SLOPE`, `INTERCEPT`, `RSQ`, `CORREL`) of spreadsheets, a result outside the real numbers being `#NUM!`. |
| SHEET-025 | S | 0.2.0 | The system shall evaluate the logical (`IFS`, `SWITCH`, `XOR`, `IFNA`, `ISERROR`, `ISNA`…), mathematical (`TRUNC`, `CEILING`, `FLOOR`, `MROUND`, `FACT`, `COMBIN`, `GCD`, `LCM`, `SUMPRODUCT`…), conditional (`COUNTIFS`, `SUMIFS`, `AVERAGEIF(S)`, `MAXIFS`, `MINIFS`), statistical (`LARGE`, `SMALL`, `RANK`, `MODE`, `PERCENTILE`, `QUARTILE`…), text (`TEXTJOIN`, `SUBSTITUTE`, `FIND`, `SEARCH`, `PROPER`, `TEXT`, `VALUE`…), lookup (`INDEX`, `MATCH`, `XLOOKUP`, `HLOOKUP`, `CHOOSE`) and date (`WEEKDAY`, `EDATE`, `EOMONTH`, `DATEDIF`, `NETWORKDAYS`, `HOUR`…) functions as Excel and LibreOffice do, and write them under the names those applications expect (`_xlfn.` in XLSX, `COM.MICROSOFT.` in ODS). |
| SHEET-026 | S | 0.2.0 | The system shall let the user change the width of columns: dragged at the edge of a column header, fitted to the content by a double click, or typed for the columns selected; kept in XLSX and ODS files. |
| SHEET-027 | S | 0.2.0 | The system shall let the user fill cells from the selection with a fill handle dragged in any direction, a double click on it (down as far as the data beside), Ctrl+D and Ctrl+R (copy), continuing numbers and dates as a series, texts ending with a number, names of days and months, and moving the relative references of formulas. |
| SHEET-028 | S | 0.2.0 | The system shall let the user restrict what cells accept (a value from a list written out or read from a range, a whole number, a number, a date, a text length, compared with values), show a message while such a cell is selected, offer the values of a list in a drop-down (also with Alt+Down), refuse a wrong value or ask or tell about it, mark the values not accepted, and keep the rules in XLSX and ODS files. |
| SHEET-029 | S | 0.2.0 | The system shall let the user format cells by their values (a comparison with a value, a text contained, duplicate or unique values, above or below the average, the highest or lowest ones, a colour scale of two or three colours, data bars), list and delete the formats of the selection, print them, and keep them in XLSX and ODS files. |

## 6. Presentations (PRES)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| PRES-001 | M | 0.0.5 | When a `.pptx` file is opened, the system shall display every slide with its text boxes (positioned and sized), basic shapes (rectangle, ellipse) with solid fills, and images. |
| PRES-002 | M | 0.0.5 | When an `.odp` file is opened, the system shall display the same content as PRES-001. |
| PRES-003 | M | 0.0.5 | Where a `.pptx` placeholder shape has no explicit position, the system shall inherit position and size from the slide layout, then from the slide master. |
| PRES-004 | M | 0.0.5 | The system shall display slide thumbnails and let the user select the current slide. |
| PRES-005 | M | 0.0.5 | The system shall let the user edit the text of text boxes and shapes with bold / italic / underline formatting. |
| PRES-006 | M | 0.0.5 | The system shall let the user add, duplicate, delete and reorder slides, and add text boxes. |
| PRES-007 | M | 0.0.5 | When the user starts the slideshow, the system shall display slides full screen, advance with →, Space, PageDown or click, go back with ←, PageUp, and exit with Escape. |
| PRES-008 | M | 0.0.5 | When a presentation is saved as `.pptx` or `.odp`, the system shall write slides, shapes, text and images in that format. |
| PRES-009 | S | 0.0.5 | The system shall let the user move and resize shapes with the pointer, and delete the selected shape. |
| PRES-010 | S | 0.0.5 | The system shall preserve slide speaker notes text when reading and writing. |
| PRES-011 | C | — | Slide transitions (animations: PRES-020..PRES-022). |
| PRES-012 | W | — | Embedded video/audio, SmartArt, charts editing, legacy `.ppt`. |
| PRES-013 | S | 0.1.0 | The system shall let the user choose the slide size (16:9, 4:3, A4, Letter) and orientation (landscape, portrait) of a presentation, moving and resizing shapes and text sizes with the slides (undoable), keep the size in ODP and PPTX (with the orientation declared in ODP), and print in the orientation of the slides by default. |
| PRES-014 | S | 0.2.0 | When the user starts the presenter view, the system shall show the slideshow and, in a second window, a console with the current and next slides, the speaker notes (resizable), the time spent (pause, restart) and the time of day, both moving together; if no second window can be opened, the system shall show the console alone to rehearse. |
| PRES-015 | S | 0.2.0 | While a shape is moved or resized with the pointer, the system shall snap its edges and centre to those of the other shapes and of the slide within a few pixels, and show alignment guides; holding Alt shall place it freely. |
| PRES-016 | S | 0.2.0 | The system shall let the user add a slide with a layout: title slide, title and content, section header, two contents, comparison, title only, blank. |
| PRES-017 | S | 0.3.0 | The system shall export each slide of a presentation as an image (PNG or WebP) at a size the user chooses, 1920 × 1080 by default, a slide of another shape fitted with margins of a chosen colour. |
| PRES-018 | S | 0.3.0 | The system shall let the user set how long each slide is shown before the next one in an automatic slideshow, keep it in ODP (`presentation:duration`) and PPTX (`advTm`) files, and follow it in the slideshow. |
| PRES-019 | S | 0.3.0 | The system shall give each slide an identifier kept when the slide is moved or edited and written in ODP and PPTX files, so that a slide sent elsewhere can be found and replaced again. |
| PRES-020 | C | 0.4.0 | The system should read, play in the slideshow and write slide animations — entrance, exit and motion; keyframes of position, opacity, scale and rotation with easing — as ODF animations (SMIL) and PPTX timing. |
| PRES-021 | C | 0.4.0 | The system should offer a timeline editor of the animations of a slide: one row per shape, its keyframes placed, moved and eased with the pointer, played and scrubbed. |
| PRES-022 | C | 0.4.0 | The system should export a slide or a presentation, with its animations, as an MP4 video (H.264 High where the browser offers it, else Constrained Baseline; up to 1920 × 1080; 30 frames per second; a key frame every 2 seconds; no B-frames; fast start), encoded by WebCodecs in the browser. |

## 7. PDF (PDF)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| PDF-001 | M | 0.0.4 | When a `.pdf` file is opened, the system shall render its pages in the browser. |
| PDF-002 | M | 0.0.4 | The system shall let the user navigate pages (next, previous, go to page) and display "page n / total". |
| PDF-003 | M | 0.0.4 | The system shall let the user zoom in, zoom out and fit to width. |
| PDF-004 | M | 0.0.4 | The PDF renderer shall run with JavaScript evaluation in PDF content disabled. |
| PDF-005 | S | 0.0.4 | The system shall render a selectable text layer so that text can be copied. |
| PDF-006 | C | 0.2.0 | Text search inside the PDF (see PDF-017). |
| PDF-008 | M | 0.0.4 | When a PDF containing AcroForm fields is opened, the system shall display editable controls for its text fields, checkboxes, radio groups and drop-down / list fields over the rendered pages. |
| PDF-009 | M | 0.0.4 | When the user saves a PDF with filled fields, the system shall write the field values into the PDF (and regenerate their appearances) so that other PDF readers display them. |
| PDF-010 | S | 0.0.4 | The system shall offer, next to the regular save that keeps form fields editable, a "Flattened PDF" save that writes a copy in which the filled fields are part of the page and can no longer be edited, without changing the open document. |
| PDF-011 | M | 0.0.4 | The system shall let the user create a handwritten signature by drawing it (mouse, touch or stylus) or importing an image, and place, move and resize it on any page. |
| PDF-012 | M | 0.0.4 | When the user saves a PDF with placed signatures, the system shall embed them as images at the chosen positions. |
| PDF-013 | S | 0.0.4 | The system shall let the user add free text (e.g. a date or name) anywhere on a page. |
| PDF-014 | C | 0.2.0 | The system shall remember the user's signature in browser storage, only after explicit consent. |
| PDF-015 | M | 0.0.4 | If a PDF is encrypted or uses XFA forms, then the system shall display it read-only and explain why it cannot be filled. |
| PDF-016 | S | 0.2.0 | The system shall let the user fit the PDF pages to the width of the view or show whole pages (fit to the height and the width), and show 1, 2, 3, 4 or 6 pages side by side, the fit applying to the whole row; the choice shall be kept for the next PDF. |
| PDF-017 | S | 0.2.0 | The system shall find a text in the pages of a PDF (Ctrl+F), ignoring case and accents, highlight every match and the current one, show their count, and go to the next and previous matches. |
| PDF-018 | S | 0.2.0 | The system shall let the user highlight the selected text of a PDF and place notes on its pages, each with a comment, an author (asked once) and a date, listed in an annotations panel with the annotations already in the file; saving shall write them as standard PDF annotations (`/Highlight` with quadrilaterals, `/Text`) with appearance streams, shown by other PDF readers. |
| PDF-020 | S | 0.2.0 | The system shall save a text document as a PDF typeset in the browser (Typst compiled to WebAssembly), without the print dialog: the fonts embedded — metric-compatible stand-ins for Calibri, Arial, Times New Roman, Courier New and Cambria —, the text selectable, links and cross-references working, the document's properties set; the page, headings, lists, tables, pictures, footnotes, equations (converted from LaTeX, an unreadable one written as its LaTeX), table of contents, columns, code cells and bibliography kept. The engine and the fonts shall be downloaded once, after the user agrees, and kept for offline use; the document shall not leave the device. |
| PDF-007 | W | — | General PDF content editing; cryptographic digital signatures (PAdES / certificates). |
| FORM-001 | S | 0.1.0 | When the user designs a PDF form, the system shall let the user draw text, paragraph, check box, drop-down list and option button fields on the pages, name them (unique names), mark them required, rename or remove fields, and save them as AcroForm fields of the file. |
| FORM-005 | S | 0.2.0 | When the user designs a PDF form, the system shall show a properties window for each field, new or already in the file: name, tooltip, required, read-only, value by default (or checked by default), choices (another value allowed, sorted), maximum number of characters, one box per character, alignment, size of the text, and a format — number with decimals, whole number, date with its pattern, e-mail address, phone number, or a regular expression with its message — tried in the window; it shall write them as AcroForm entries and the JavaScript actions of PDF readers, read them back, and check them while filling the form. |
| FORM-002 | S | 0.1.0 | When the user compiles form answers from several filled PDF, ODT, DOCX or Markdown files (picked, or those of the open folder), the system shall make a spreadsheet with one row per file and one column per field, typed values (ticked boxes as booleans, plain numbers as numbers), and report the files that could not be read. |
| FORM-003 | S | 0.2.0 | The system shall let the user insert form fields (text, check box, drop-down list) in a text document, named and optionally required, fill them in where they stand, and keep fields and answers as OpenDocument input and drop-down fields, Word content controls, Markdown bracketed spans (`[answer]{.input name="…"}`) and HTML controls. |
| FORM-004 | S | 0.2.0 | When the user compiles form answers, the system shall offer to send them to a table of a Grist document instead of a new spreadsheet: created with a typed column per field, or completed (new fields as new columns), never sending a file's row twice. |

## 8. User interface & accessibility (UI)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| UI-001 | M | 0.0.1 | The system shall display a start screen offering "New document", "New spreadsheet", "New presentation", "Open file" and (when available) recent files. |
| UI-002 | M | 0.0.1 | The system shall be operable with the keyboard only, with visible focus indicators. |
| UI-003 | M | 0.0.1 | Every interactive control shall have an accessible name. |
| UI-004 | S | 0.0.1 | The system shall follow the operating system light / dark colour scheme preference. |
| UI-005 | S | 0.0.1 | The layout shall remain usable from 360 px wide screens to desktop screens. |
| UI-006 | S | 0.0.1 | While an operation takes longer than 300 ms, the system shall show a progress indication. |
| UI-007 | M | 0.0.8 | The user interface shall be available in English, French and Simplified Chinese. |
| UI-008 | M | 0.0.8 | When the application starts, the system shall select the interface language from the browser preferences (fallback English) and let the user change it; the choice shall persist. |
| UI-009 | M | 0.0.8 | Every user-visible string shall come from a translation catalog; a test shall fail if a key is missing in any language. |
| UI-010 | S | 0.0.8 | The system shall set the `lang` attribute of the document to the selected language. |
| UI-011 | S | 0.1.0 | The system shall let the user choose a light, dark or system theme (following the operating system preference by default); the choice shall persist and apply to native controls. Document pages and slides shall stay light, as on paper. |
| UI-012 | S | 0.1.0 | The system shall offer an About window, from the toolbar and the start screen, showing the author, the version, the git commit and date of the build, the licence, whether the app is installed and works offline, a QR code of the app address to open it on another device (shown full screen when activated), and links to the documentation, source code, changelog, requirements and problem reports; it shall copy these details for a problem report. |
| UI-013 | S | 0.1.0 | The system shall display its version and the short git commit of the build (e.g. `v0.0.13 (6cae6fc)`) in the toolbar and on the start screen, as QRShare does; activating it shall open the About window. |
| UI-015 | C | — | On a phone, the system shall dock a contextual toolbar above the on-screen keyboard with the essential commands for the selection, the other commands under "More", and offer a full-screen writing mode. |
| UI-014 | S | 0.1.0 | On a narrow screen (phone), the system shall keep the header on one line, with Save visible and the other file actions in a menu, and lay out each editing toolbar as a single row that scrolls horizontally, so that the document stays visible above the on-screen keyboard. |
| UI-016 | M | 0.1.0 | The system shall let the user type any font size from 1 to 999 pt (rounded to the half point) in text documents and presentations, with the usual sizes offered as suggestions and the arrow keys stepping through them and beyond; in a presentation, a size typed while editing a text box shall apply to the selected text only. |
| UI-017 | S | 0.1.0 | The About window shall list the open-source components the application ships with (its runtime dependencies), each with the exact version installed at build time, its licence and a link to its project page, and the copied details for a problem report shall include these versions. |
| UI-018 | S | 0.2.0 | The system shall offer a command palette (Ctrl+Shift+P and a header button) listing the buttons and menu entries of the screen, filtered by the words typed (in any order, ignoring case and accents), run with Enter and navigable with the arrow keys, in three columns: the command, its keyboard shortcuts when it has some, and where it is; the commands of the view (such as the review mode and the review actions) shall be listed even when no button shows them, and some commands shall also be found by keywords in other languages (the review mode by "correction", "relecture", "proofreading"…). |
| UI-019 | S | 0.2.0 | While the system waits — a long operation, a collaboration looking for the others or receiving the document, a code cell queued, loading Python or running — it shall show a spinner (slowed down when the user prefers reduced motion). |
| UI-020 | S | 0.1.0 | The toolbars shall keep the most used tools in sight and group the others in menus opening below their button (closing on use, Escape or a click elsewhere), unless the user chooses full toolbars in the settings. |
| UI-021 | S | 0.1.0 | When the user right-clicks in a document, long-presses it on a touch screen or uses the Actions button, the system shall show a menu of the actions available there (clipboard, link, table rows and columns, code cell, insertions including a table of a chosen size), as a sheet at the bottom of the screen on a phone. |
| UI-022 | S | 0.1.0 | The command palette shall list every action of the screen, including those folded in menus and those of the context menu, each with its category; with nothing typed it shall list them all by category; it shall be opened from a labelled button in the header, and on a phone from a floating button, full screen, kept above the on-screen keyboard. |
| UI-023 | S | 0.2.0 | The system shall let the user choose the paper of text documents on screen — as the theme of the application, light, or dark (light text on dark paper) — from the View menu, the command palette and the settings; on dark paper the colours of the text shall stay recognisable and pictures keep their own colours; printing, PDF export and saved files shall keep the document's colours. |
| UI-024 | S | 0.2.0 | The command palette shall offer to go back to the start screen (Home) while a document is open, the document closed as by Close, the user asked first when it has changes. |

## 9. Quality (QA)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| QA-001 | M | 0.0.1 | Every format reader/writer and the formula engine shall be covered by unit tests written before the implementation (TDD). |
| QA-002 | M | 0.0.1 | The project shall provide `just` recipes for install, dev, test, build, docs and the full check. |
| QA-003 | M | 0.0.1 | Documentation shall build without warnings and produce `llms.txt` and `llms-full.txt`. |
| QA-004 | S | 0.0.4 | An end-to-end smoke test shall open each supported format in a real browser. |
| QA-005 | M | 0.0.1 | The project shall follow Semantic Versioning and document notable changes in `CHANGELOG.md` (Keep a Changelog). |

## 9b. Printing (PRINT)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| PRINT-001 | M | 0.0.9 | When the user selects "Print", the system shall show a print preview of the document with the chosen page settings before opening the browser print dialog. |
| PRINT-002 | M | 0.0.9 | The system shall let the user choose the paper size (A4, Letter, A3, A5), orientation and margins; the choice shall persist. |
| PRINT-003 | M | 0.0.9 | Text documents shall print paginated with headings kept with the following paragraph, tables and images not split when possible, and rendered equations. |
| PRINT-004 | M | 0.0.9 | Spreadsheets shall print the used range of the current sheet (or of all sheets) with optional grid lines and row/column headings, repeating column headings on every page. |
| PRINT-005 | M | 0.0.9 | Presentations shall print one slide per page (landscape), or several slides per page as handouts, optionally with speaker notes. |
| PRINT-006 | S | 0.0.9 | Printing a PDF shall print the PDF with the filled fields, signatures and texts added by the user. |
| PRINT-007 | S | 0.0.9 | The print preview shall offer "Save as PDF" guidance through the browser dialog (no server). |

## 9c. LaTeX (TEX)

LaTeX formulas are a first-class feature (MATH requirements are raised from
Should to **Must**).

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| TEX-001 | M | 0.0.10 | When a text document is exported as `.tex`, the system shall produce a compilable LaTeX `article` (UTF-8, `amsmath`, `graphicx`, `hyperref`, `ulem`) with sections, formatting, lists, tables, links, quotes, verbatim code and equations (`$…$`, `\[…\]`). |
| TEX-002 | M | 0.0.10 | When a document containing images is exported to LaTeX, the system shall produce a ZIP project (`main.tex` + `images/`). |
| TEX-003 | M | 0.0.10 | When a `.tex` file (or a ZIP containing one) is opened, the system shall import the supported subset: sectioning, `\textbf`/`\textit`/`\emph`/`\underline`/`\sout`/`\texttt`, `itemize`/`enumerate`, `tabular`, `\href`/`\url`, `quote`, `verbatim`, `\includegraphics`, inline and display math (`$`, `$$`, `\(\)`, `\[\]`, `equation`, `align`), and `\title`/`\author`. |
| TEX-004 | M | 0.0.10 | If a LaTeX construct is not supported on import, then the system shall keep its source text visible instead of dropping it. |
| TEX-005 | M | 0.0.10 | The user shall be able to type `$…$` in the document editor to create an inline equation. |
| TEX-006 | S | 0.0.10 | Spreadsheet cells and presentation text boxes shall support LaTeX equations (`$…$`) rendered with MathLive. |

## 9d. Git repositories (GIT)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| GIT-001 | M | 0.0.11 | The system shall let the user connect GitHub (github.com or Enterprise API URL) and GitLab (gitlab.com or self-hosted URL) accounts with a personal access token stored only in this browser. |
| GIT-002 | M | 0.0.11 | The system shall let the user browse repositories, branches and folders and open any supported file. |
| GIT-003 | M | 0.0.11 | When a document opened from a repository is saved, the system shall commit it to the same path and branch with a user-editable commit message (default: conventional commit). |
| GIT-004 | M | 0.0.11 | If the file changed in the repository since it was opened, then the system shall refuse to overwrite it and offer to save on a new branch or as a copy. |
| GIT-005 | S | 0.0.11 | The system shall let the user save a new document to a chosen repository path, optionally on a new branch. |
| GIT-006 | S | 0.0.11 | The token shall never be written to documents, logs or exported files, and the user shall be able to forget it. |
| GIT-007 | C | 0.2.0 | Pull/merge request creation from the editor. |
| GIT-008 | S | 0.2.0 | When the user pastes the address of a repository (web address of the repository, a branch, a folder or a file, or an SSH clone address), the system shall deduce the service (GitHub or GitLab, public or self-hosted), the repository, the branch and the path, use the matching account or propose to add one pre-filled, and open that place. |
| GIT-009 | S | 0.2.0 | Where an account is added, the system shall explain step by step how to create a personal access token with the least rights, linking to the token page of the chosen site. |
| GIT-010 | S | 0.2.0 | When a document is saved to a repository, the system shall propose a text format Git can compare (Markdown, LaTeX, CSV) before binary formats (DOCX, ODT, XLSX…), explaining why, without forbidding the others. |
| GIT-011 | S | 0.2.0 | The system shall open an empty repository (no commit, no branch yet) without error, saying it is empty, and save a first document into it, as a file or opened as a folder, on its default branch. |
| GIT-012 | S | 0.2.0 | The system shall remember the token of an account in this browser unless the user chooses to keep it only until the application is closed; a repository opened without a token shall offer to add one, and saving into it shall ask for one, checked on the repository. |
| GIT-013 | S | 0.2.0 | When a repository is chosen, the system shall tell its visibility (public, private, internal) and what it means, the role of the account and whether it can save there, and list on demand the collaborators with their roles (when the service shows them); a file opened from a repository shall show the repository as a folder with its tree, and a repository can be opened as a folder from the same window; the files of a repository shown before shall never stay on screen while another loads or fails to. |
| GIT-014 | S | 0.2.0 | A folder on disk or on the local network that is a Git working copy shall open as any folder, its files written in place so that the user's own Git tool versions them; the system shall show that it is a Git working copy and its branch, and hide the `.git` folder. |
| GIT-015 | S | 0.2.0 | In the open folder — on disk, on a server, or a repository opened as a folder (where each change is a commit) — the system shall create a new text document, spreadsheet, presentation or drawing in the format family chosen, and open it. |
| GIT-016 | S | 0.2.0 | The system shall work with Gitea and Forgejo forges (on their sites, self-hosted, or on the local network) as with GitHub and GitLab: accounts with a token, open, commit, branches, history, a repository opened as a folder. |
| GIT-017 | S | 0.2.0 | In a Git working copy opened from disk, the system shall itself commit what is saved (with a message and the author name of the settings), and show the history of a document, compare and restore its versions from the local commits — Git, not the application, keeping the versions. |
| GIT-018 | S | 0.2.0 | The user shall keep several accounts, each with its token, on every forge and several on the same site (a token per repository); a repository opened by its address shall be opened with the account last used for it, else the first account of its site whose token may write in it, else one that may read it; which account goes with which repository shall be remembered without its token. |

## 9e. Device-to-device exchange with QRShare (SHARE)

[QRShare](https://github.com/s-celles/QRShare) (AGPL-3.0) transfers files
between devices through animated QR codes (air-gapped) or WebRTC. Integration
is done at application level (URLs and Web Share). Both projects are licensed
under the GNU AGPL-3.0 or later, so QRShare code may be reused if a native
integration is ever needed.

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| SHARE-001 | M | 0.0.12 | When the user chooses "Send to another device", the system shall hand the current file (saved in its format) to QRShare: through the Web Share API when available (QRShare is a share target), otherwise by downloading it and opening QRShare's send screen. |
| SHARE-002 | M | 0.0.12 | Where the document is text and small enough, the system shall open QRShare's `#/send?data=…&policy=…` route directly. |
| SHARE-003 | M | 0.0.12 | The system shall register as a Web Share Target for supported files, so that files received in QRShare (or any app) can be opened directly in Progressive Web Office. |
| SHARE-004 | M | 0.0.12 | The system shall let the user choose the transfer policy (air-gapped only, prefer air-gapped, any) and the QRShare URL. |
| SHARE-005 | S | 0.0.12 | When the user chooses "Receive from another device", the system shall open QRShare's scanner that recognises what it is shown: a static QR code (an invitation or document link), animated QR codes or CIMBAR codes. |
| SHARE-007 | S | 0.1.0 | When a document that is not small text is sent to another device, the system shall hand the file to QRShare in the browser (app handoff protocol v1, `postMessage`, posted only to the configured QRShare origin) without downloading it; if QRShare does not answer, then the system shall fall back to a download and QRShare's "Prepare a transfer" screen. |
| SHARE-008 | S | 0.1.0 | When the user receives from another device, the system shall give QRShare a return address so that a received file can be opened directly in Progressive Web Office, accepting files only from the configured QRShare origin. |
| SHARE-009 | S | 0.1.0 | The system shall build a link that contains the open document itself (text documents as Markdown, other documents in their format, compressed and base64url-encoded in the URL fragment), let the user copy it, and warn when it is long enough to be cut by some apps. |
| SHARE-010 | S | 0.1.0 | When the application is opened with such a link, the system shall rebuild and open the document — the fragment is never sent to a server — remove the fragment from the address, and report a damaged link. |
| SHARE-006 | C | — | Native, embedded implementation of the QRShare frame protocol (licences are compatible: QRShare is BSD-3-Clause since 0.5.0, Progressive Web Office AGPL-3.0-or-later). |
| SHARE-011 | S | 0.1.0 | When the user gives the address of a document on a web server, the system shall check that it can be downloaded and make a link (with its QR code) that opens it read-only in the application, optionally pinned to that version by its SHA-256 fingerprint; when the linked file has changed, or cannot be read (CORS, HTTP error, over 200 MB), the system shall say so and not show it. |
| SHARE-012 | S | 0.1.0 | Where QRShare announces the handoff protocol v2 in its manifest (`versions` containing 2, `features` `mode` and `reply-opener`), the system shall be able to ask QRShare for a given send mode (e.g. animated QR codes, skipping the choice) and, when receiving, to get the received file back in its own window, from QRShare's origin only, after the user's click in QRShare. |
| SHARE-013 | M | 0.2.0 | Before opening a file handed over by another app (QRShare, the system share sheet), the system shall check that it is a file it opens and that its content is what its name says (a PDF named `.docx`, a program, an empty file are refused with an explanation, never offered for download); a file from QRShare shall be opened only after the user has seen where it comes from (the QRShare address), its name, size and format. |
| SHARE-014 | S | 0.2.0 | Where the user gives a password, the system shall encrypt the document and its name inside the link (AES-GCM with a PBKDF2-derived key, random salt and nonce), and when such a link is opened, ask the password until it opens the document or the user gives up, without revealing anything on a wrong password. |

## 9f. AI assistant and agent integration (AI)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| AI-001 | M | 0.0.13 | Where the user has configured an AI provider, the system shall provide an assistant panel that can read and modify the open document through tools (documents, spreadsheets, presentations). |
| AI-002 | M | 0.0.13 | The system shall ask for explicit consent before sending any document content to the AI provider, and display which provider and model are used. |
| AI-003 | M | 0.0.13 | Every change made by the assistant shall be undoable and visible (the assistant reports each tool action). |
| AI-004 | M | 0.0.13 | The API key shall be stored only in this browser and only if the user chooses so; it shall never be sent anywhere but to the provider API. |
| AI-005 | S | 0.0.13 | The assistant shall be able to write LaTeX equations, spreadsheet formulas and slide content. |
| AI-006 | S | 0.0.13 | Where the browser exposes an agent tool API (WebMCP `navigator.modelContext`), the system shall register the same document tools so that external AI agents can drive the application, with user confirmation for modifications. |
| AI-007 | M | 0.1.0 | The system shall let the user choose the AI provider of the assistant — Anthropic (Claude), OpenAI, Mistral AI, Albert (French State), a local Ollama server, or any server offering the OpenAI chat completions API — with its own key, model and (for local and custom servers) API address, kept per provider; local servers on `localhost` shall be reachable over HTTP. |
| AI-008 | M | 0.1.0 | The system shall give every provider the same document tools, confirmations and undo, ask consent again when the provider, address or model changes, and start a new conversation when the provider changes. |
| AI-009 | C | — | Several assistants in one conversation (e.g. one model drafts, another reviews). |

## 9g. Grist (GRIST)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| GRIST-001 | M | 0.1.0 | The system shall let the user add Grist accounts (server address and API key), check them when added, store them only in this browser, and forget them. |
| GRIST-002 | M | 0.1.0 | The system shall let the user browse the team sites and documents of a Grist account and open a document as a workbook: one sheet per table, the column labels in the first row, the record ids in the first column, formula columns with their computed values and dates as dates. |
| GRIST-003 | M | 0.1.0 | When the user saves a workbook opened from Grist, the system shall send only the changes: changed cells of editable columns, new rows (without an id), and — after confirmation — deleted rows; it shall then reload the document so that new rows get their ids and formulas their values. |
| GRIST-004 | M | 0.1.0 | The system shall not write formula columns, the id column, or columns of complex types (references, lists, attachments), which are shown as text. |
| GRIST-005 | M | 0.1.0 | If the Grist server cannot be reached or refuses a request, the system shall say whether the address/HTTPS/CORS setup or the API key is the likely cause, and link to the server setup guide. |
| GRIST-006 | C | — | Python code cells reading Grist tables; writing documents of the text editor to Grist. |

## 9h. Cloud storage: Nextcloud and WebDAV (DAV)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| DAV-001 | M | 0.1.0 | The system shall let the user add cloud accounts — a Nextcloud / ownCloud server address with user name and app password, or the full address of any WebDAV server — check them when added, store them only in this browser, and forget them. |
| DAV-002 | M | 0.1.0 | The system shall let the user browse the folders of a cloud account and open any supported file. |
| DAV-003 | M | 0.1.0 | When a document opened from the cloud is saved, the system shall write it back to the same file; the user shall also be able to save any open document to a chosen cloud folder and file name, the extension choosing the format. |
| DAV-004 | M | 0.1.0 | The system shall never overwrite a file that changed on the server since it was read, nor an existing file when saving a new one (conditional requests with ETags); it shall offer to save a copy next to it (default) or to replace the file. |
| DAV-005 | M | 0.1.0 | If the server cannot be reached or refuses the credentials, the system shall say whether the address/HTTPS/CORS setup or the credentials are the likely cause, and link to the server setup guide. |
| DAV-006 | C | — | Nextcloud login flow (no app password to copy), sharing links, and a recent-files list per account. |

## 9i. Real-time collaboration (COLLAB)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| COLLAB-001 | M | 0.1.0 | The system shall let the user start a real-time session on an open text document or spreadsheet and invite others with a link carrying a random room name and secret; opening the link shall join the session. The document shall travel directly between browsers (WebRTC, end-to-end encrypted), public Nostr relays only introducing the browsers to each other, with no server storing the document. |
| COLLAB-002 | M | 0.1.0 | While in a session, the system shall share every edit with the other participants within a second; concurrent edits of different cells or paragraphs shall all be kept, and every participant shall converge to the same content. A participant who joins late or comes back online shall receive what they missed. |
| COLLAB-003 | M | 0.1.0 | The system shall show who is in the session — each participant with a friendly compound name (e.g. "Swift Crimson Falcon") and a matching colour, which the user can change — and where each one is working (selected cell, current paragraph). |
| COLLAB-004 | M | 0.1.0 | The system shall let any participant save named versions, shared with everyone and kept with their author and date, and restore one for everyone as a new edit, after saving the current state as a version. |
| COLLAB-005 | M | 0.1.0 | Each participant shall keep the session's document and version history on their device (IndexedDB), so that reloading the page rejoins the session with them, even when nobody else is online. |
| COLLAB-006 | M | 0.1.0 | The collaboration protocol, history and presence shall come from the `@scelles/collab` package, shared with QRShare (no duplicated implementation). |
| COLLAB-008 | S | 0.1.0 | The system shall let several people edit a text document on devices of which at least one is fully offline, merging their changes character by character (CRDT) through passes of animated QR codes handed to QRShare (handoff protocol v2), or files of codes: one device shows its state vector, the other shows only the updates missing from it, which are validated on an isolated copy (schema, limits, properties) before being applied, after the user saw a summary and accepted; frames shall be versioned, size-limited, optionally compressed and signed (Ed25519) by trusted devices, and every import logged. A device without the document's history shall join the history of the other device instead of starting its own. |
| COLLAB-009 | S | 0.2.0 | The collaboration bar shall tell where the connection is — the relays cannot be reached, looking for the others, receiving the document, connected — and, after 20 seconds without anyone, what to check (the other page open, a network blocking direct connections, the same Wi-Fi, a TURN server, synchronisation without a network); the settings shall let the user set the relays and a TURN server; without settings, a list of well-known relays shall be used, all at once, the same on every device; relays that refuse the messages shall count as unreachable. |
| COLLAB-010 | S | 0.2.0 | Participants shall introduce themselves (application, protocol version, kind of document) when they meet; when another app, version or kind of document joins, the bar shall warn that its changes are not trusted. |
| COLLAB-011 | S | 0.2.0 | When no participant can be reached directly for 15 seconds (browsers that cannot connect to each other, such as on a company network and a mobile network), the system shall also carry the session through the Nostr relays: messages encrypted with the secret of the invitation (the relays seeing neither the room nor the content), cut into pieces small enough for them, posted as ephemeral events, each delivered once; the bar shall say that the connection goes through the relays and is slower. |
| COLLAB-007 | S | — | Collaboration on presentations, comments shared during a real-time session, suggested changes (track changes), and a character-level text merge with remote carets. |

## 9k. Review: comments (REV)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| REV-001 | S | 0.2.0 | The system shall let the user comment the selected text of a text document, or the word at the cursor (toolbar or Ctrl+Alt+M), signing comments with a name asked once (by default the collaboration name) and the date; it shall highlight commented text, list the threads beside the page in the order of their text, select a comment's text when its thread is clicked, mark the thread under the cursor, and let the user reply, resolve, reopen and delete a comment (delete being undoable); comments whose text was deleted shall not be saved. |
| REV-002 | S | 0.2.0 | The system shall read and write Word comments: ranges (`commentRangeStart`, `commentRangeEnd`, `commentReference`), `comments.xml` (author, initials, date, paragraphs) and `commentsExtended.xml` (replies, resolved state). |
| REV-003 | S | 0.2.0 | The system shall read and write OpenDocument annotations: `office:annotation` with `office:annotation-end` for ranges (a comment without end being put on the word before it), author, date and initials, LibreOffice's replies (`loext:parent-name`) and resolved state (`loext:resolved`). |
| REV-004 | S | 0.2.0 | The system shall read and write comments in Markdown with CriticMarkup: the commented text as `{==text==}` followed by `{>>Author: comment<<}`, replies following their comment, a comment without highlighted text being put on the word before it. |
| REV-005 | S | 0.2.0 | The system shall let the user track changes in a text document: while on, typed text shall be recorded as an insertion and deleted text kept, struck out, as a deletion, each with its author (asked once) and date (deleting tracked inserted text removing it); changes shall be shown in the text and listed in a panel to be accepted or rejected one by one or all at once, and kept in DOCX (`w:ins`, `w:del`/`w:delText`), ODT (`text:tracked-changes`, changed regions) and Markdown (CriticMarkup `{++ ++}`, `{-- --}`); LaTeX exports shall accept them. |

## 9m. Reading and reviewing (REVIEW)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| REVIEW-001 | S | 0.2.0 | The system shall offer a review mode for text documents (toolbar or Ctrl+Alt+R) that lays the document out as pages like a PDF file (page breaks starting new pages), with no change to the text but comments still possible, and the same page controls as the PDF viewer: page number, previous and next, zoom, whole page or width, 1 to 4 pages side by side, and a choice between scrolling the pages and showing one spread at a time without scrolling (also offered by the PDF viewer); the choices shall be remembered. |
| REVIEW-002 | S | 0.2.0 | While reading a PDF file or reviewing a text document, the system shall turn the pages with single keys outside the fields (k/n/Page Down/Space/→ next, j/p/Page Up/Shift+Space/← previous, g/Home first, G/End last) and offer shortcuts to zoom (+ −), fit the width (w) or the page (h, 0), set the pages side by side (1–4), switch the flow (s), comment (c), go to the next and previous comment (] [), find (/), go full screen (f) and list the shortcuts (?). |
| REVIEW-003 | S | 0.2.0 | Page by page, the mouse wheel shall turn the pages when the spread has nothing more to scroll. |
| REVIEW-004 | S | 0.2.0 | The system shall offer a full screen without distractions (f, Esc to leave) showing only the pages, the review bar and the comments. |
| REVIEW-005 | S | 0.2.0 | The PDF viewer shall offer the same review mode button and shortcut (Ctrl+Alt+R): the highlight and note tools named in the toolbar, the form and signature tools hidden, and the annotations panel shown, explaining how to annotate while it is empty. |
| REVIEW-006 | S | 0.2.0 | The review mode shall be one switch for every file: turned on in a text document or a PDF file, the files opened next open in review mode, until it is left in any of them; the settings shall show and change the same switch. |

## 9n. Settings (SET)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| SET-001 | S | 0.2.0 | The system shall offer a settings window (⚙ in the header, and the command palette by "settings", "paramètres"…) with its settings grouped by category — general (language, theme, the user's name, the format family of new files), reading and review, writing (typography as you type), printing (paper, orientation, margins) — each kept in the browser as soon as it changes. |
| SET-002 | S | 0.2.0 | The reading and review settings shall set how PDF files and text documents in review mode open: pages side by side, fit to the width or to the whole page, scrolling or page by page, and whether the review mode is on (REVIEW-006); the choices made in the toolbar shall become the new defaults unless the user turns this off. |
| SET-003 | S | 0.2.0 | The user's name shall be one setting, asked once when it is needed and empty: it signs comments, PDF annotations and tracked changes, and shows the user in real-time collaboration and synchronisation without a network; renaming oneself in a collaboration shall change it, and a name changed anywhere (settings, the first comment) shall be shown at once to the other participants of a running collaboration, without leaving it; the name shall be asked in a window of the page, never in the browser's prompt that would freeze the page and its connections. |

## 9j. Images and drawing (IMG)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| IMG-001 | C | 0.2.0 | The system shall offer minimal photo editing of a picture (crop, quarter turns, mirror, resize, brightness and contrast, blur a region), keeping the original until applied and the change undoable. |
| IMG-004 | C | 0.2.0 | The system shall let the user draw arrows, text and highlights on a picture, following its turns and mirroring. |
| IMG-002 | C | — | The system shall offer minimal vector drawing (shapes, lines and arrows, text, freehand), saved as SVG and editable again in documents and presentations — see DRAW-001..DRAW-011. |
| IMG-003 | S | 0.2.0 | When the user inserts or pastes a picture, the system shall offer to give it a caption (numbered as a figure) and an alternative text, and shall list the pictures without alternative text. |

## 9l. Teaching (TEACH)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| TEACH-001 | S | 0.2.0 | The system shall let the user mark paragraphs of a text document as solutions, shown framed and labelled, hide or show them on screen and in print, and save copies without them (the exercise sheet) in ODT, DOCX and Markdown; solutions shall be kept as Word content controls (tag `pwo:solution`, alias Solution), ODF sections named Solution*n*, and Markdown fenced divs (`::: solution`, `::: {.solution}`). |
| TEACH-002 | S | 0.2.0 | The system shall generate N random variants of a text document: `{{X=rand(a..b[, step])}}`, `{{X=choice(…)}}` and `{{X=expression}}` define values drawn per variant with a seeded generator, `{{X}}` and `{{=expression[\|digits]}}` show values and computed results (arithmetic and common functions, no code run), numbers being formatted for the document's language; the result shall be a ZIP of the sheets (without solutions), their answer keys and a CSV of the values, in ODT, DOCX or Markdown. |
| TEACH-003 | S | 0.2.0 | The system shall find the questions of a text document written with form fields (a list of answers starting with check boxes, ticked for the right ones; a text field holding the expected answer; a drop-down list set on the right choice), grouped by heading, and export them as Moodle XML, GIFT and an AMC (Auto Multiple Choice) LaTeX source. |
| TEACH-004 | S | 0.2.0 | The system shall draw the Bode diagram (gain in dB, continuous phase in degrees, log frequency) and the Nyquist diagram of a transfer function written as a rational expression in s or p with named values, over decades chosen from its poles and zeros or by the user, work out the gain and phase margins, and insert the plots as described SVG pictures. |
| TEACH-005 | S | 0.2.0 | Where the exam mode is on (started with a teacher's code of at least 4 characters, kept hashed), the system shall reach no network but its own files (no AI, collaboration, synchronisation, repositories, servers or downloads), refuse pastes of what was not copied in the application and files dropped from outside, log with their time the window or full screen left, the pastes and connections refused and wrong codes, show a banner, and end only with the code, showing the log. |
| TEACH-006 | S | 0.2.0 | The system shall draw the step response of a transfer function or of its closed loop with unity feedback (final value, overshoot, 10–90 % rise time, 5 % settling time) and its poles and zeros, and insert them as described SVG pictures. |

## 9o. Colour (COLOR)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| COLOR-001 | S | 0.2.0 | The system shall let the user choose a colour (text and highlight of documents, text and fill of spreadsheet cells, fill and background of slides) from swatches, the colours used lately, or its hexadecimal, RGB or CMYK values, each updating the others; colours shall be kept in LaTeX with xcolor, whose `HTML`, `rgb`, `RGB`, `cmyk` and `gray` models and base colours are read. |
| COLOR-002 | S | 0.2.0 | When a colour is brighter than a coated paper offset press can print (approximately), the system shall warn and show how it would print, offering the printable colour; it shall warn when CMYK values exceed 300 % of ink; and a document shall be viewable with its colours as printed. |

## 9p. Backups (BACKUP)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| BACKUP-001 | S | 0.2.0 | The system shall back up what the browser keeps — the files of its private storage and the recent files, drafts, templates and versions of its database — in one archive with a manifest, encrypted when the user gives a password (AES-GCM, key derived with PBKDF2), the password never kept by the browser. |
| BACKUP-002 | S | 0.2.0 | The system shall write a backup, named by its date, as a download, to a folder chosen once, or to a WebDAV / Nextcloud account, and keep there the newest backup of each of the last 7 days and of each week for 8 weeks before, always keeping the newest and never touching other files. |
| BACKUP-003 | S | 0.2.0 | The system shall restore a backup chosen as a file or where backups go, after its password, all of it or the files ticked, a file already present kept and the restored copy written next to it unless the user chooses to replace it; records already present shall be left untouched. |
| BACKUP-004 | S | 0.2.0 | The header shall always show how old the last backup is, marked when one is due; the user shall choose to be reminded every day, week or month, and the start screen shall remind when a backup is due and there is something to back up. |
| BACKUP-005 | S | 0.2.0 | The backup window shall explain that synchronisation is not a backup (a deletion reaches every device; a backup keeps the documents as they were) and the 3-2-1 rule. |
| BACKUP-006 | S | 0.2.0 | Where the user chose it, for a folder or a WebDAV target, the system shall make a backup by itself while the application is open whenever one is due (down to every hour), without asking, the password of an encrypted backup taken from the session only, and say it was made. |
| BACKUP-006 | M | 0.1.0 | When the application runs at its former address (`s-celles.github.io/progressive-web-office`), the start screen shall announce the new address (`progressive-web-office.github.io`) and offer to back up the documents, since browser storage is kept per site. |

## 9q. One's own devices (DEVSYNC)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| DEVSYNC-001 | S | 0.2.0 | Before synchronising, the system shall explain and have the user acknowledge that synchronisation is not a backup, that a document deleted on one device is deleted on every device (kept in a trash for 30 days), and that it is for one person's own devices, not collaboration. |
| DEVSYNC-002 | S | 0.2.0 | The system shall pair the user's devices with a random key, devices finding each other through relays and exchanging everything end-to-end encrypted with that key; it shall list the paired devices, online or last seen, and make a new key unpairing the others, or stop synchronising a device, its documents kept. |
| DEVSYNC-003 | S | 0.2.0 | When the user asks, or by itself while the application is open when chosen, the system shall merge the documents of the browser's storage with each paired device online: copying documents new or changed on one, keeping a document changed on both twice (the newest under its name, the other as a conflict copy named alike on every device), and passing on deletions of documents unchanged since; hidden files and the trash are never synchronised. |
| DEVSYNC-004 | S | 0.2.0 | A document deleted, or replaced by another device's version, shall go to the device's trash, kept 30 days. |
| DEVSYNC-005 | S | 0.2.0 | The system shall check every path received from another device and serve only the synchronised documents. |
| DEVSYNC-006 | S | 0.2.0 | When the user adds a device, the paired device shall show a one-time invitation (a QR code and a link to the application, valid 5 minutes, without the key); the new device opening it shall show verification emojis drawn from the invitation and its own ephemeral public key, and the paired device shall send the key, encrypted for that public key alone, only when the user accepts that device after comparing the emojis; the command palette shall offer to sync now, to show an invitation and to scan one. |
| DEVSYNC-007 | S | 0.2.0 | On a paired device, saving a document shall offer to keep it in the browser, synchronised (Browser storage › Documents, then open as the folder), or as a file; the window shall say that only the documents of the browser are synchronised, count them, open them, and copy recent documents among them. |
| DEVSYNC-008 | S | 0.2.0 | A new name given to a device shall be told at once to the paired devices online, and to the others when they next meet. |
| DEVSYNC-009 | S | 0.2.0 | The system shall list the files of the synchronisation trash of this device by day, restore one where it was (next to it when the name is taken) so that the other devices get it again, and delete one for good after confirmation. |
| DEVSYNC-010 | S | 0.2.0 | When the user revokes one paired device, the system shall make a new pairing and give it to each other device online that accepts (after asking its user), encrypted for a fresh public key of that device (ECDH P-256, AES-GCM), never to the revoked device; stop the exchange with a device answered for twice; tell which devices got it; and forget the revoked device on all of them. |
| DEVSYNC-011 | S | 0.2.0 | The system shall show the documents of this browser with, for each, whether it is the same on every paired device met, only here or different there, or on another device and not here yet (as of when each device was last met), the number of files in the trash, and a timestamped history of the synchronisations (device, documents received, trashed, conflicts, failures); a button of its own in the header shall open the synchronisation, marked while another device is online. |
| DEVSYNC-012 | S | 0.2.0 | The user's templates shall be synchronised with the documents, as files of the folder `Templates`: a template saved, changed or deleted on one paired device shall be so on the others after the next synchronisation. |
| DEVSYNC-013 | M | 0.2.0 | Devices that are not online together shall synchronise through the others: a device shall pass on to the devices it meets the devices it knows (the newest sighting of each, never itself nor a revoked device) and the documents, changes and deletions it got from others; each merge shall use what the two devices held after their own last merge, so that no change is lost and no deleted document comes back, whichever device starts; a deletion shall carry the content deleted, so that a device not met since drops only an unchanged copy, never a document changed or restored after the deletion. |

## 9r. Versions and history (VER)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| VER-001 | S | 0.2.0 | The system shall compare two versions of a file: text files line by line, documents as their Markdown text, workbooks cell by cell; showing the lines added, removed and changed (word by word) with the unchanged ones folded, or the cells changed, and a count; it shall compare a version kept in the browser with the document as it is now. |
| VER-002 | S | 0.2.0 | For a document of a GitHub or GitLab repository, the system shall list the commits that changed it on its branch, newest first, with message, author and date, and compare each with the one before or with the document as it is now (unsaved changes included). |
| VER-003 | S | 0.2.0 | The system shall open a version of the history in place of the document's content, the document staying where it is, and restore a version as a new commit, after a confirmation, the history kept as it is. |

## 9s. Physical quantities (UNIT)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| UNIT-001 | S | 0.2.0 | The system shall know units — SI base and named units with their prefixes, common other units — combined by products, quotients and powers (`kN·m`, `km/h`, `m/s²`), with their dimension over the seven SI base quantities, and provide Excel's CONVERT (temperatures included). |
| UNIT-002 | S | 0.2.0 | A number typed with a unit (`12 mm`) shall be a quantity, kept as the number with the unit in its number format, so that XLSX, ODS and CSV files keep it and other spreadsheets show it; a formula giving a quantity shall be shown and saved in its unit; QTY and UNIT shall make a quantity and give its unit. |
| UNIT-003 | S | 0.2.0 | Formulas shall compute with quantities in SI and check their dimensions: addition, subtraction, comparisons and aggregates (SUM, AVERAGE, MIN, MAX, MEDIAN) of one dimension only, products, quotients and powers combining them, functions of numbers on dimensionless values only — anything else being the error #UNIT!; the unit of a result is that of its first operand, combined units simplified (mm·m → mm², kg·m/s² → N). |
| UNIT-004 | S | 0.2.0 | The user shall show cells in another unit: quantities converted, plain numbers given the unit, formulas shown in it; cells of another dimension left as they were. |

## 9t. Drawing and schematics (DRAW)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| DRAW-001 | S | 0.2.0 | The system shall offer a vector drawing editor: rectangles (rounded or not), ellipses, polygons, lines and polylines with optional arrowheads, freehand strokes (smoothed), and text; each with its stroke colour, width and dash, fill colour and opacity; select, move, resize, rotate, duplicate, delete, group and ungroup, bring forward or back, align and distribute; with the mouse, the finger and the keyboard (arrows move by a grid step, Shift for a finer one); undo and redo; zoom and pan. |
| DRAW-002 | S | 0.2.0 | The drawing shall have a grid the shapes, points and symbols snap to (its step chosen, shown or hidden), and guides showing the alignment with other shapes while moving. |
| DRAW-003 | S | 0.2.0 | A drawing shall be saved as SVG, the editable drawing kept inside it, so that any SVG viewer shows it and the editor opens it again as it was; an SVG not made here shall open with its rectangles, circles, ellipses, lines, polylines, polygons, paths and texts editable; a drawing shall be exported as PNG (with a chosen scale) and printed. |
| DRAW-004 | S | 0.2.0 | Connectors shall join shapes and symbols at their connection points and follow them when they move, straight or orthogonal (routed in right angles), with optional arrowheads and a label. |
| DRAW-005 | S | 0.2.0 | The system shall offer libraries of symbols, searchable by name: electrical and electronic after IEC 60617 (resistor, potentiometer, capacitor, polarised capacitor, inductor, diode, LED, Zener diode, NPN and PNP transistors, MOSFETs, operational amplifier, voltage and current sources DC and AC, battery, ground, earth, switch, push button, changeover switch, fuse, lamp, motor, transformer, relay coil and contacts, voltmeter, ammeter, wattmeter), logic gates (IEC and ANSI shapes), control block diagrams (block, summing point, take-off point), pneumatic and hydraulic after ISO 1219 (single and double acting cylinders, 3/2 and 5/2 directional valves, pump, compressor, pressure source, exhaust, check valve, flow control), and flowcharts after ISO 5807 (terminal, process, decision, input/output, connector). |
| DRAW-006 | S | 0.2.0 | In a schematic, symbols shall have pins on the grid; wires drawn from pin to pin shall be orthogonal and stay connected when a symbol moves, rotates (quarter turns) or is mirrored; a junction dot shall be drawn where three or more wires meet and none where wires only cross; each symbol shall get a reference numbered by kind (R1, R2, C1, Q1…) and an editable value (10 kΩ, 100 nF — with the units of UNIT-001), both placed beside it. |
| DRAW-007 | S | 0.2.0 | A drawing shall be inserted in a text document or a slide as a picture that stays editable (a double click opens the editor; saved back in place), kept as SVG with a PNG version where a format needs one (DOCX, PDF, LaTeX). |
| DRAW-008 | S | 0.2.0 | The system shall offer a bitmap painting editor, for a new picture or a picture of a document or a file (PNG, JPEG, WebP): pencil, brush, eraser, fill, line, rectangle, ellipse, text, colour picker, size and opacity of the tool, selection moved, copied or deleted, canvas resized, undo and redo, zoom. |
| DRAW-009 | S | 0.2.0 | From an electrical schematic, the system shall give a netlist (SPICE) and a bill of materials (reference, value, quantity) as a spreadsheet. |
| DRAW-010 | C | — | The system should open and save OpenDocument drawings (`.odg`) and open draw.io diagrams (`.drawio`, uncompressed). |
| DRAW-011 | S | 0.2.0 | The drawing editor shall be accessible: every shape reachable with Tab and named for screen readers (its kind, its reference and value, its text), moved and resized with the keyboard, and the drawing given an alternative text. |
| DRAW-012 | S | 0.2.0 | The system shall offer the graphical languages of IEC 61131-3 as symbol libraries: ladder diagram (power rails, contacts NO, NC, P, N; coils, negated, set, reset, P, N; the variable above), function block diagram (standard timers, counters, edge detectors, bistables, arithmetic and comparison functions, a generic block; named pins, instance names) and sequential function chart / Grafcet (steps, initial step, transitions with their condition, action blocks, simultaneous and selection divergences and convergences, jumps). |
| DRAW-013 | S | 0.2.0 | The painting editor shall have layers — painted or vector, shown or hidden, with their opacity, added, duplicated, renamed, reordered, merged and deleted — and save a picture with layers as OpenRaster (.ora), reading it back, with a flattened PNG on demand. |
| DRAW-014 | S | 0.2.0 | On a vector layer, lines, rectangles, ellipses and texts shall stay shapes: picked, moved, restyled, their text changed, removed; kept in the OpenRaster file; made pixels on demand. |
| DRAW-015 | S | 0.2.0 | The painting editor shall import a picture as a new layer, set the background (a colour, transparent, a picture fitted as asked), crop to the selection, turn the picture a quarter turn or by any angle, flip it, turn a layer, keep the alpha channel in PNG, WebP and OpenRaster, and show transparency as a checkerboard. |
| DRAW-016 | S | 0.2.0 | The painting editor shall draw gradients (linear, radial, conic, every hue) and a grid of any step on a layer. |
| DRAW-017 | S | 0.2.0 | A line of a drawing shall get or lose an arrow at either end and its routing in right angles, and bends added, moved and removed with the pointer. |
| DRAW-018 | S | 0.2.0 | In the drawing editor, a component, text or shape shall be selected and dragged from anywhere inside its box (a line, from near it), not only from its strokes, the pointer showing what can be moved. |
| DRAW-019 | S | 0.2.0 | The drawing and painting editors shall zoom with the wheel (or a touchpad pinch) around the pointer, pan with the middle button, and on touch screens pinch with two fingers to zoom and move them to pan, a second finger cancelling what the first began. |

## 9u. Plugins (PLUG) — proposal

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| PLUG-001 | C | — | The system should install content packs without code — templates, symbol libraries, snippets, palettes, themes, word lists, packages for code cells — described by a manifest. |
| PLUG-002 | C | — | The system should read a registry of plugins kept in a Git repository (`registry.json`: plugins, versions with the SHA-256 of their files, permissions, licence, revoked versions) and let the user browse, install, update and remove plugins in the settings. |
| PLUG-003 | C | — | A plugin should be installed at a pinned version, its files checked against their hashes, and kept for offline use; updates should be offered, never forced, with their changes and new permissions. |
| PLUG-004 | C | — | The user should add other registries — any Git repository or WebDAV folder — to share plugins privately. |
| PLUG-005 | C | — | Code plugins should run in a sandbox (an iframe or a worker, as code cells), talking to the application through a versioned message API, without access to its DOM, storage or tokens. |
| PLUG-006 | C | — | A code plugin should declare its permissions (read or change the open document, network hosts, a panel), asked when installed, shown and revocable in the settings. |
| PLUG-007 | C | — | The plugin API should offer commands, importers and exporters, panels, symbols, templates, snippets and code-cell languages. |
| PLUG-008 | C | — | A version of a plugin marked revoked in its registry should be disabled at the next check. |
| PLUG-009 | C | — | A plugin's `manifest.json` (version 1) should give its id, name, description, version (SemVer), licence (SPDX), authors, kind (`pack` or `code`), `targets` (`pwo`, `signage`), the host versions it works with, its entry page or contents, the message protocol version, a JSON Schema of its settings, the data it reads and its permissions; a host should install only the plugins naming it in `targets`, and `registry.json` (version 1) should list each version with the SHA-256 of every file, its permissions and its revocation — the same formats as the apps of DigitalSignalix screens, published as JSON Schemas (`plugin-manifest-1.schema.json`, `plugin-registry-1.schema.json`). |
| PLUG-010 | C | — | A code plugin should talk to its host only through `postMessage` messages in one envelope (`type: "pwo-plugin"`, `version`: the major version, `action`, `id`), the host handing it its settings, data, size and visibility, and making the network requests of the hosts it declared on its behalf; within a major version both sides should ignore the fields and actions they do not know (`plugin-message-1.schema.json`). |

## 9v. Notes and knowledge (NOTE)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| NOTE-001 | S | 0.2.0 | The front matter of a Markdown note shall be shown above its page as a card of properties, each with its type — text, list, date, number, yes/no, YAML left as it is — tags as coloured chips and `[[links]]` and web addresses drawn as links to follow; each property shall be changed, added or removed in place, the front matter written back in its order with the lines of the others unchanged; the card shall be shown to change, to read, or as the YAML source of the whole front matter, the choice kept, and hidden from the View menu. |

| NOTE-002 | S | 0.2.0 | The notes of the open folder shall be queried in SQL, from a SQL cell of a document of the folder or a `.sql` file of it, as the tables `notes` (path, name, folder, size, modified), `props` (path, key, pos, value — one row per item of a list), `tags`, `links` (resolved to the notes they point to) and `tasks` (path, line, text, done), with the function `prop(path, key)`; the tables shall be made from the index of the notes for each query naming them, as temporary tables, the notes staying the only source. |
| NOTE-003 | S | 0.2.0 | The user shall make views of the notes of the folder, kept as `.view.yaml` files of the folder — a folder, filters comparing properties (`=`, `!=`, `<`, `<=`, `>`, `>=`, `contains`, `has`, tags, `today`), columns, sort, layout — shown as a table, cards or a board of columns by the value of a property; a cell changed, or a card moved to another column, shall write the property into the note, its other lines unchanged; a note made from the view shall take the values its filters ask for; the format shall be published as a JSON Schema. |

## 9y. Databases (DB)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| DB-001 | S | 0.2.0 | A SQLite file shall open as a document — SQLite run in the sandbox of the code cells, downloaded after consent and checked — its tables and views listed, their rows shown page by page and changed in a grid, their structure shown, SQL run with its results, foreign keys checked; the document shall be saved as a SQLite file; a new empty database shall be made from the command palette. |
| DB-002 | S | 0.2.0 | The user shall write a conceptual data model — entities with their attributes, types and identifier, associations with the cardinalities of their entities, roles and attributes — as text kept in a `.mcd` file, its diagram drawn as it is typed and exported as SVG, its mistakes told by line. |
| DB-003 | S | 0.2.0 | The logical model shall be derived from the conceptual one by the usual rules — an entity a relation keyed by its identifier, a binary association with a side x,1 a foreign key of that side (not null for 1,1, unique for one to one), any other association a relation keyed by the keys of its entities — and shown in the usual notation. |
| DB-004 | S | 0.2.0 | The physical model shall be the SQL making the tables for SQLite, PostgreSQL or MySQL — types, primary, foreign and unique keys, tables in the order of their references — copied or saved as a `.sql` file of the folder. |
| DB-005 | S | 0.2.0 | The conceptual model shall be read back from the tables of a SQLite database — a table keyed by its references to other tables an association, another table an entity, each of its references an association with a side 1,1 or 0,1 — as a `.mcd` file. |

## 9w. Digital signage (SIGN)

See [DigitalSignalix](./digitalsignalix.md).

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| SIGN-001 | S | 0.3.0 | The system shall let the user add DigitalSignalix Managers — an HTTPS address and a token — check them when added (`GET /v1/me`), keep them in this browser or for the session only, and forget them, in the settings with the other connections. |
| SIGN-002 | S | 0.3.0 | When the user sends a presentation to a Manager, the system shall export its slides as images (PRES-017), send only those the Manager does not have (by SHA-256), then create or replace the presentation chosen with each slide's identifier, image and duration, showing the progress and, at the end, the address of the presentation in the Manager's console. |
| SIGN-003 | S | 0.3.0 | The system shall send with the presentation and each image a provenance record — the tool, its version and commit, the source document's name, type, SHA-256 and network origin, the slide, the export format, the time, and the author's name only when the user leaves it checked (`provenance-1.schema.json`). |
| SIGN-004 | S | 0.3.0 | If a Manager cannot be reached or refuses a request, the system shall say whether the certificate, the browser's access to the local network, CORS or the token is the likely cause, and link to the setup guide. |
| SIGN-005 | C | — | The system should let the user preview a slide or a pack on the size of a screen, and install packs whose `targets` include `signage` to try them in PWO. |

## 9x. Calendar (CAL)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| CAL-001 | S | 0.2.0 | An event shall be a Markdown note — in an `Events` folder by default, filed by year, month and day (`Events/2026/10/05/2026-10-05 Kick-off.md`), its note moving with it to the folder of its new day under the same name — its fields in the front matter (`type: "[[Event]]"`, title, start, end, all day, location, attendees, calendar, recurrence, exceptions, tags, uid) and its description the text of the note, so that events are linked, tagged, found and shown like notes; changing an event shall keep the other properties and the text of its note. |
| CAL-002 | S | 0.2.0 | The system shall offer a calendar of the events of the folder open — month, week, day and agenda views, today marked, the events coloured by calendar — in which the user creates an event (a click on a day or a time), opens, moves and changes it in a window, and opens its note. |
| CAL-003 | S | 0.2.0 | The system shall read and write iCalendar (RFC 5545) events: times of a time zone or UTC made the user's local time, whole days, folded lines and escapes, alarms left out; and import a `.ics` file as event notes, and export events as a `.ics` file. |
| CAL-004 | S | 0.2.0 | The system shall show repeating events by their rule (daily, weekly by day, monthly, yearly; interval, count, until) without their exceptions. |
| CAL-005 | S | 0.2.0 | A daily note shall list the events of its day, and its `events` property link to them; a click on a day of the calendar shall open its daily note. |
| CAL-006 | S | 0.2.0 | The system shall synchronise event notes both ways with the calendars of a CalDAV server (Nextcloud…) of an account the user added: the calendars found from the account, the events of a time range read, the new and changed ones written with the version they replace (ETag), a change on both sides kept as two notes for the user to choose. |
| CAL-007 | S | 0.2.0 | AI agents — the assistant, or an agent reached through WebMCP — shall list the events of a range of days and create events through tools, their inputs checked, the events created being notes like the others. |
| CONTACT-001 | S | 0.2.0 | A contact shall be a Markdown note — in a `People` folder by default — its fields in the front matter (`type: "[[Person]]"`, name, first and last name, e-mails, phones, organisation, role, birthday, address, website, tags, uid) and the rest of the note free, so that a person is linked from notes and events (`[[Ada Lovelace]]`) and shows them as backlinks. |
| CONTACT-002 | S | 0.2.0 | The system shall offer the contacts of the folder open — a list searched by name, e-mail, organisation or tag, and the card of a contact with its fields, the notes and events linking to it, and actions to write an e-mail or call — in which the user creates and changes contacts. |
| CONTACT-003 | S | 0.2.0 | The system shall read and write vCard 3.0 and 4.0 (RFC 6350) contacts, and import a `.vcf` file as contact notes, and export contacts as a `.vcf` file. |
| CONTACT-004 | S | 0.2.0 | The birthdays of contacts shall be shown in the calendar as yearly events. |
| CONTACT-005 | S | 0.2.0 | The system shall synchronise contact notes both ways with the address books of a CardDAV server of an account the user added, as CAL-006 does for events. |
| CONTACT-006 | S | 0.2.0 | The card of a contact shall show its interactions — the events it attends, the lines of daily notes and the other notes naming it — dated, the latest first, and when the user first met it and was last in touch; the user shall note an interaction (meeting, call, e-mail, message, or a kind of their own, with an icon, the kinds already used offered again), written as a dated line of the daily note of its day linked to the contact, the contact's `first met` and `last contact` following. |
| CONTACT-007 | S | 0.2.0 | AI agents — the assistant, or an agent reached through WebMCP reading the user's e-mail — shall find contacts, read a contact with its interactions, create or update a contact, and note an interaction (creating the contact of an unknown address) through tools, their inputs checked, those changing the notes marked so. |

## 9z. Locking the application (LOCK)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| LOCK-001 | S | 0.2.0 | The user shall lock the application with a passkey (WebAuthn, user verification required) or a passphrase: when it starts, nothing of what the browser keeps shall be shown before the lock is opened. |
| LOCK-002 | S | 0.2.0 | While the lock is set, what the browser keeps — the content of the files of its private storage, recent files, drafts, versions, templates, accounts with their passwords and tokens — shall be encrypted (AES-GCM) with a random data key, wrapped by a key derived from the secret the passkey gives (its PRF extension) or from the passphrase; setting the lock shall encrypt what was kept before, removing it decrypt it all. |
| LOCK-003 | S | 0.2.0 | When the lock is set, a recovery key shall be shown once, to download or copy and confirmed kept, which also unwraps the data key; the user shall be told that without a passkey, the passphrase nor the recovery key the data cannot be read. |
| LOCK-004 | S | 0.2.0 | The application shall lock again after a delay without use chosen by the user, and on demand; locked, the data key shall be forgotten and the application started again. |
| LOCK-005 | S | 0.2.0 | Where the passkey gives no secret, the system shall say so and offer a passphrase, or another passkey, instead; other passkeys shall be added to open the lock, and removed. |
| LOCK-006 | C | — | The names of the files of the private storage and the offline copies of shared documents shall be encrypted too. |

## 9za. Messages and calls (MSG) — proposal

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| MSG-001 | C | — | The user shall sign in to a Matrix server of their choice and read and write in its rooms and direct messages, end-to-end encrypted, their devices verified and their keys backed up; the encryption code shall be downloaded after consent and checked against a pinned SHA-256. |
| MSG-002 | C | — | The user shall share a document of the application in a room, and open a file of a room as a document. |
| MSG-003 | C | — | A contact shall hold its Matrix address, its card opening the direct messages with it; a message shall be kept as a line of the daily note of its day, linked to its contact (CONTACT-006). |
| MSG-004 | C | — | An event of the calendar shall hold its room and its call, joined from the event. |
| MSG-005 | C | — | The user shall call and see a person peer to peer (WebRTC), and join group calls through the media server of their Matrix server. |
| MSG-006 | C | — | Other networks shall be reached through the bridges of the user's Matrix server, the client staying one, its conversations behind an interface open to other protocols. |

## 9zb. Notifications (NOTIF)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| NOTIF-001 | S | 0.2.0 | Where the user allowed it, the system shall notify the reminders of events (their alarms, read and written as iCalendar has them; a reminder chosen for new events) while the application is open, even in the background, each once, a click opening the event; new messages too once there are messages (MSG). |
| NOTIF-002 | C | — | The number of unread messages shall be shown on the icon of the installed application. |
| NOTIF-003 | C | — | When the application is closed, notifications shall come by Web Push through a server of the user's (the push gateway of their Matrix server, or a push server they run), the content fetched and decrypted on the device, never carried by the push. |
| NOTIF-004 | S | 0.2.0 | The user shall be told what notifications need on their system (an application installed to the home screen on some phones). |

## 9zc. Passwords (VAULT)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| VAULT-001 | S | 0.2.0 | A vault of passwords in the KDBX 4 format shall open as a document — entries, groups, notes, attachments — and be saved in the same format, readable by the other applications of that format. |
| VAULT-002 | S | 0.2.0 | The vault shall be unlocked by its master password and key file, or, where the user chose it, by the lock of the application (LOCK-002), the master password kept encrypted by it. |
| VAULT-003 | S | 0.2.0 | The vault shall give the one-time codes (TOTP) of its entries, generate passwords without bias, and copy a value to the clipboard, cleared after a delay. |
| VAULT-004 | S | 0.2.0 | Where the user agreed, a password shall be checked against known breaches by k-anonymity (only the first characters of its hash sent). |
| VAULT-005 | C | — | The vault shall be shown in a page of its own, without plugins, code cells nor documents of others, under a strict content security policy. |

## 10. Out of scope (Won't, this time)

- A collaboration server, user accounts, or storage of documents on a server we operate.
- Legacy binary formats (`.doc`, `.xls`).
:::
