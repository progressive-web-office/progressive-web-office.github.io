---
description: View PDF files, fill in PDF forms and add a handwritten signature.
---

# PDF

## Viewing

Open a `.pdf` file to display its pages.

- **◀ ▶** or the page box: navigate (the current page follows scrolling).
- **− / +**: zoom; **↔**: fit to width (default); **↕**: whole page, its
  height and width in view.
- **🔍 Find** (<kbd>Ctrl</kbd>+<kbd>F</kbd>): type a word; the matches are
  highlighted, the current one in orange, with their count. <kbd>Enter</kbd>
  and <kbd>Shift</kbd>+<kbd>Enter</kbd> (or ▼ ▲) go to the next and previous
  ones; case and accents are ignored. A scanned PDF without text layer has
  nothing to find.
- **Pages side by side**: 1, 2, 3, 4 or 6 pages per row; with two pages,
  the document reads like an open book. Fitting to the width or to the page
  then applies to the whole row. The choice is kept for the next PDF.
- **📄 Page by page** shows one page (or one spread) at a time, without
  scrolling; **📜 Scroll** shows them one after the other. Single-key
  shortcuts turn the pages (<kbd>k</kbd>/<kbd>j</kbd>, <kbd>Space</kbd>…),
  ⛶ goes full screen without distractions and ⌨ lists the shortcuts: see
  [Reading and reviewing](./review).
- Text can be **selected and copied** (text layer).
- **Print** opens the PDF (with your changes) in the browser's PDF viewer,
  from which you can print it.

Pages are rendered only when they come into view, so large documents open
quickly. Fonts, CMaps and image decoders are bundled with the application:
viewing works offline.

## Filling forms

If the PDF contains an interactive form (AcroForm), its fields become
editable directly on the page: text fields, checkboxes, radio buttons,
drop-down and list boxes. Saving writes the values into the PDF and
regenerates their appearance, so that every PDF reader shows them.

Two ways to save a filled form:

- **Save** (or **Save as… → PDF document**) keeps the fields editable, so
  you or someone else can change the answers later.
- **Save as… → Flattened PDF – fields locked** writes a *copy* named
  `…-flattened.pdf` in which the answers, signatures and added text become
  part of the page: the form can no longer be changed. Send this version
  when the form is final. The open document is not affected; you can keep
  editing it and save it normally.

## Annotating

- **🖍 Highlight**: select text on a page, then click 🖍. The highlight
  appears in the **Annotations** panel, where you can type a comment.
- **💬 Note**: click 💬, then click on the page where the note goes, and type
  its comment in the panel.

Annotations are signed with your name (asked the first time) and the date.
**Delete** removes one before saving; **Show** goes to its page. **Save**
writes them as standard PDF annotations (highlight and note), which other
PDF readers show with their author and comment. The annotations already in a
PDF, from other readers too, are listed in the panel with their comments.

## Drawing and text boxes

**✏ Draw** opens the [drawing editor](./drawing) over the current page, the
page shown underneath:

- The editor takes the whole window, the page as wide as it allows; **⌘**
  and **☰** show the symbols and the list of objects when needed.
- The **text** tool is chosen: click where the text goes and type it.
  <kbd>Enter</kbd> starts a new line; <kbd>Escape</kbd> (or
  <kbd>Ctrl</kbd>+<kbd>Enter</kbd>, or a click elsewhere) is done. A double
  click on a text edits it again.
- **Size**, **B**, **I**, **U** and **Colour** apply to the part of the text
  selected while typing — one word in bold, a larger first line — or to the
  whole text when it is selected with the arrow tool (see
  [Formatting text](./drawing#formatting-text)). Bold and italic are written
  with Helvetica Bold and Oblique.
- **Arrows**, lines, rectangles, ellipses and freehand strokes point at,
  frame or underline what matters. A white rectangle without border hides
  what is under it.
- **Done** puts the drawing on the page; **✏** at the top right of the page
  opens it again.

**Save** writes the drawing as an annotation drawn with vectors, its text
kept as text: every PDF reader shows it, prints it and lets you move or
delete it. Opened again here, the drawing can be edited. **Save as… →
Flattened PDF** makes it part of the page. Text in a script the standard PDF
font cannot write (Chinese, for example) is saved as a picture of the
drawing.

## Signing

1. Click **✍ Sign**.
2. Draw your signature with the mouse, a finger or a stylus (pressure is
   used when available), or **Import image…** (PNG, JPEG, WebP).
3. Click **Place signature**: it appears on the current page.
4. Drag it to move it, drag the corner handle to resize it, or focus it and
   use the arrow keys (<kbd>Shift</kbd> for larger steps). <kbd>Delete</kbd>
   or **×** removes it.

To sign again without drawing, tick **Remember this signature on this
device** before placing it: next time, **Use this signature** places it in
one click. It is kept only in this browser (never sent, never in a
document) and only if you tick the box; **Forget it** deletes it.

**T+ Text** adds free text (today's date by default), for example a name or a
date next to the signature.

::: warning Visual signature only
The signature is an image added to the page. It is **not** a cryptographic
digital signature (certificate-based, PAdES) and does not prove the
document's integrity.
:::

## Limits

- Encrypted PDFs and XFA forms are displayed **read-only**, with an
  explanation.
- PDF JavaScript is never executed.
- The text already in the pages cannot be edited: cover it with a white
  rectangle and type the new text over it (see *Drawing and text boxes*).
