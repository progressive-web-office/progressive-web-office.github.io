---
description: File formats that Progressive Web Office can open and save.
---

# Supported formats

| Family | Open | Save |
|--------|------|------|
| Text documents | `.odt`, `.docx`, `.md`, `.mdz`, `.tex`, LaTeX project `.zip`, `.odm` (master document) | `.odt`, `.docx`, `.md`, `.mdz`, `.tex`, LaTeX project `.zip` |
| Spreadsheets | `.ods`, `.xlsx`, `.csv`, `.tsv` | `.ods`, `.xlsx`, `.csv` |
| Presentations | `.odp`, `.pptx` | `.odp`, `.pptx` |
| [Templates](../guide/templates#template-files) | `.ott`, `.dotx`, `.ots`, `.xltx`, `.otp`, `.potx` (opened as new documents) | the same |
| PDF | `.pdf` | `.pdf` with filled form fields and signatures, or a flattened copy |
| [Canvases](../guide/canvas) | `.canvas` (JSON Canvas 1.0) | `.canvas` |

## Open formats first

New files are created in **OpenDocument** formats — `.odt` for text, `.ods`
for spreadsheets, `.odp` for presentations — and *Save as* lists them first.
OpenDocument is an open international standard (ISO/IEC 26300), readable by
LibreOffice, Collabora, OnlyOffice, Microsoft Office and many others, with no
vendor controlling it: your files stay readable in the long term.

If you mostly exchange files with Microsoft Office users, choose **New files
in: Microsoft Office** on the start screen. New files are then created as
`.docx`, `.xlsx` and `.pptx`, and these come first in *Save as*. Either way,
an opened file keeps its format when you save it, and every format remains
available in *Save as*.

## Detection

The format is detected from the file **content** (ZIP package type, PDF
signature), not only from the extension, so a renamed file still opens
correctly. Legacy binary formats (`.doc`, `.xls`, `.ppt`) are not supported.
