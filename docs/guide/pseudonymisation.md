---
description: Pseudonymise documents on this device before sharing them — names and identifiers of a list of people replaced by pseudonyms, an encrypted mapping table, an output check, and re-identification of what comes back.
---

# Pseudonymising documents

Before you share documents about people — with a colleague, a board, a
researcher, a provider or an AI assistant — Progressive Web Office can
replace the names and identifiers of the people of a list by **pseudonyms**
(`ETU-012`). It runs **on this device, without any network request**. The
correspondence is kept in an **encrypted mapping table**, so that the names
can be put back later in what comes back (**re-identification**).

::: warning This is a pseudonymisation
The result is a pseudonymisation in the sense of the GDPR (art. 4(5)): the
people remain identifiable with the table, and even without it (writing
style, content, the small size of a group). The documents produced remain
**personal data**. Detection is automatic and incomplete: read every result
before passing it on. Your organisation remains responsible for the
processing; ask your data protection officer. A notice says so before the
first use, and must be acknowledged.
:::

## What you need

- **A list of people**: a CSV file (separator `;`, `,` or tab, found by
  itself; UTF-8 with or without byte order mark, or Windows-1252), an Excel
  workbook (`.xlsx`) or an OpenDocument spreadsheet (`.ods`) — or the
  spreadsheet open in the application. You choose the sheet, the header row
  and the columns; the usual names (`nom`, `prenom`, `last_name`,
  `first_name`, `email`, `numero`, `student_id`, `INE`…) are proposed.
- **A mapping table**: created the first time (a password of at least 10
  characters, a prefix for the pseudonyms, a deletion date), then opened
  again for the next runs, so that each person keeps the same pseudonym.

## Pseudonymise

**🗂 File → 🎭 Pseudonymise…** (or the command palette):

1. Choose **a copy of the open document**, **the open folder** (when a
   folder or a ZIP archive is open), or **a folder, into another folder**.
   You can also right-click the folder itself, a folder or files in the
   folder panel and choose **Pseudonymise…**. For the open document, the file as stored is used; when the
   document has unsaved changes, you choose the file, or the document as it
   is now (then the parts the editor does not hold, such as text boxes, are
   left out).
2. Choose the **list**, then check what is proposed:
   - the **sheet** (the first by default) and the **header row** (or none);
   - the names in **two columns** (last name, first name) or in **one
     column** (`MARTIN Léa`, `Léa Martin`, `Martin, Léa`), with the order of
     the names — words in capitals are taken as the last name;
   - the columns of the **e-mail** and of the **number**, if any.

   The first people are shown as they will be read, with the rows left out.
   When numbers come from number cells, check that none lost its leading
   zeros (format the column as text in the spreadsheet). The columns you
   choose are proposed again for a list with the same headers.
3. Choose the **mapping table**: *Create a new table* (prefix of the
   pseudonyms, deletion date, password typed twice), *Open a table
   (.kdbx)*, or *Use the table kept in this browser*. Where the browser can
   write files (Chrome, Edge), *Create the table…* asks where to save the
   `.kdbx` file right away.
4. Set the **options** (see below) and the **format of the outputs** for
   each kind of file (see below), then **Pseudonymise**.
5. Read the **report** and check what it lists. The table is **written again
   in its file** after each run (where the browser can write files, and once
   you allowed it for an opened table); otherwise, **save the table** with
   *Save the table…* — the window warns before closing while it is not
   saved. Keep it apart from the documents; never send it.

For the open folder (or entries of it), the copies are given as one ZIP
file, or, where the browser can write folders, written to an empty output
folder outside the open folder. The copies are not put back into
subfolders: the names of folders often hold the names of people.

For a folder, the output folder must be empty and must be neither the
folder of the documents nor inside it (nor contain it). The list, mapping
tables (`.kdbx`) and earlier outputs are never taken as inputs. In browsers
that cannot write a folder, the copies are given as one ZIP file.

Outputs are named after the pseudonyms of the people they belong to
(`ETU-012.docx`, `ETU-012_ETU-047.odt` for two people); a file attributed to
nobody gets a neutral name (`copy-003.docx`) and the status *to check*.

## What is found

- Names of the list written `First Last`, `Last First`, `LAST, First`,
  `F. Last`, `Last F.`, and the last name alone (option), whatever the case,
  accents (also decomposed, as macOS writes them), apostrophes and hyphens:
  `Jean-Pierre D'Alembert`, `Maëlle Le Gall`.
- E-mail addresses, French phone numbers, INE numbers, the numbers of the
  list, user names in paths (`C:\Users\…`).
- **Values after a label** — `Nom :`, `Prénom :`, `Binôme :`, `Rédigé par`,
  `Author:`… — even when the person is not in the list, also in header
  tables (label on the left or above). The value stops at the end of the
  line, a tab, a cell or the sixth word; a value that does not look like
  names is left and listed.
- First names alone, as an option (off by default: Pascal, Charles…).

Names that are also **common words** (Masse, Petit, Blanc…), names of
**scientists and units** (Young, Poisson, Pascal…), **short names** (Li, Ng)
and names **shared** by several people are replaced alone only in safe
places, and the report names them. You can add exclusions, labels and
common words under *Lists*.

## Format of the outputs

Each kind of file among the inputs has its own choice, remembered in this
browser:

| Kind | Choices |
|------|---------|
| PDF | **PDF** (default): the pages with names are drawn as pictures, the names masked by their pseudonym; the other pages are copied as they are. Or **plain text**. |
| Word, OpenDocument text | **same format** (default), the other one (`.odt` ↔ `.docx`), Markdown, plain text |
| Markdown | **same format** (default), Word, OpenDocument text, plain text |
| Excel, OpenDocument spreadsheet | **same format** (default), the other one, CSV (first sheet), plain text |
| PowerPoint, OpenDocument presentation | **same format** (default), the other one, plain text |

A file is always pseudonymised in its own format first, then converted;
the converted file is checked again like any other. A conversion may lose
some layout. In a PDF kept as PDF, the pages drawn as pictures lose their
selectable text; they are listed *to check visually*, with their picture, so
that you see the masks. A picture in the PDF (a scan, a photo) is not
analysed: a name in it stays.

## What is processed

| Format | Processed |
|--------|-----------|
| Word (`.docx`) | body, every header and footer, footnotes and endnotes, comments, text boxes, fields, tracked changes and their authors, people, document properties (core, extended, custom), alternative texts, custom XML, building blocks, charts and their data, SmartArt, links (`mailto:`, paths, template); thumbnail and signatures removed |
| OpenDocument (`.odt`, `.ods`, `.odp`) | content and styles (all headers and footers), notes, annotations, tracked changes, author fields, frames, text boxes, titles and descriptions, sheet names, presentation notes, metadata, settings (printer removed), embedded objects; thumbnail and signatures removed |
| Excel (`.xlsx`) | cells, rich and inline text, formulas, sheet and table names, comments and threaded comments with their persons, pivot caches, headers and footers, data validation, revision logs, properties |
| PowerPoint (`.pptx`) | slides, notes, layouts and masters, comments and their authors, sections, tags, shape names and alternative texts, properties; thumbnail removed |
| Markdown, text, CSV, LaTeX, source files | the whole text; encoding, byte order mark and line ends kept |
| PDF | as a **PDF** (see above), or as a **text file**: text of the pages (lines rebuilt), annotations and their authors, form values, outline, names of attachments; metadata and attachments are not carried over; a page that is only a picture is marked *scanned page, not processed* |

Every other XML part of a package is checked too. **Pictures, embedded
objects and parts that cannot be read are not analysed**: they are listed
*to check visually* (pictures with a thumbnail), or replaced by a blank
picture and emptied with the option. With *Remove identifiers linking
documents to a computer* (on by default), Word revision identifiers, user
names in template paths and printer settings are removed too.

## The report

Each output is read again from its bytes by a second, independent check.
Its status is one of:

- **Residues**: a name of the list is still there (where, with an extract);
- **To check**: no residue, but something was not analysed (pictures,
  objects, scanned pages, a labelled value, a file attributed to nobody);
- **No residue found by the automatic check**, always followed by the
  reminder that an automatic check is not a guarantee.

The report shows real names: it stays on this device and is kept only in
the mapping table.

## Re-identify

**🗂 File → 🔓 Re-identify…**: open the table, then paste a text (the result
can be copied) or open a file (DOCX, ODT, Markdown, text…), which is saved
with the names. Pseudonyms are recognised whatever the way they were
written back (`ETU-012`, `ETU 012`, `etu-012`, `**ETU-012**`); those that
are not in the table are listed and left as they are.

## The mapping table

- It is created from the window itself — no file is needed beforehand.
- It is a **KDBX 4** file (the format of KeePass and KeePassXC), encrypted
  with your password (Argon2id). Each person is an entry named after their
  pseudonym; the files and reports of the runs are kept with them.
- Where the [application lock](./lock) is set, it can also be kept in this
  browser, encrypted by the lock; never in clear.
- It has a **deletion date** (one year by default). When it has passed, the
  table can only be used again with a reason to keep it, written in it.
- Even deleted, the table does not make the copies free of personal data.

## Safety

- Nothing leaves the device: the pseudonymisation makes no network request
  (only the application's own files, such as the PDF fonts, are read).
- Files over 50 MB, packages with too many entries, too large once
  decompressed or compressed suspiciously (zip bombs), with encrypted or
  duplicated entries, names leaving the package, or XML with a document type
  declaration are refused, with no output.
