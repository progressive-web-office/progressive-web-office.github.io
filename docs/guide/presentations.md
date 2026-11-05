---
description: Create and edit PowerPoint and OpenDocument presentations, and present them full screen.
---

# Presentations

The presentation editor opens **PowerPoint** (`.pptx`) and **OpenDocument
Presentation** (`.odp`) files.

## Layout

- **Left**: slide thumbnails — click one to edit it.
- **Centre**: the current slide.
- **Bottom**: speaker notes for the current slide.

## Slides

| Button | Action |
|--------|--------|
| **+ Slide** | add a slide (title + bullet list) after the current one |
| **+ Title** | add a title slide (a title and a subtitle, centred) after the current one |
| **+ Layout ▾** | add a slide with a layout: title slide, title and content, section header, two contents, comparison (two headings over two lists), title only, blank |
| ⧉ | duplicate the current slide |
| ↑ ↓ | move the current slide |
| 🗑 | delete the current slide |
| **▶ Present** (<kbd>F5</kbd>) | start the slideshow from the current slide |
| **🎤** | presenter view: the slideshow, and a console for you in a second window |

**Slide size and orientation.** The two lists next to the slide buttons set
the size of all the slides (widescreen 16:9, standard 4:3, A4 or Letter
paper) and their orientation (landscape or portrait). Shapes move and resize
with the slides, and text sizes follow, so that what fitted still fits;
<kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes the change. A4 and Letter suit slides
meant to be printed, such as posters and signs: printing then uses the
orientation of the slides. The size is kept in OpenDocument and PowerPoint
files.

## Shapes

- **T** text box, **▭** rectangle, **◯** ellipse, **🖼** image, **✍**
  signature (drawn or imported as in the [PDF viewer](./pdf#signing), put at
  the bottom right of the slide as a picture).
- Click a shape to select it; drag to move it, drag the corner handle to
  resize it. Arrow keys move the selected shape (<kbd>Shift</kbd>: 10 px).
- While you drag, the shape **snaps** to the edges and centres of the other
  shapes and of the slide, and a pink line shows what it is aligned with;
  hold <kbd>Alt</kbd> to place it freely.
- Double-click (or <kbd>Enter</kbd>) to edit its text; <kbd>Esc</kbd> to stop.
- <kbd>Delete</kbd> removes the selected shape; ⬆ ⬇ change its stacking
  order; the colour picker sets its fill colour, and the list next to it the
  vertical alignment of its text (top, middle, bottom).
- The last colour picker of the toolbar sets the **background of the slide**.
- **B / I / U**, font size, text colour, alignment and bullets apply to the
  selected text while editing, or to the whole shape otherwise.
- The font size field suggests the usual sizes, up to 300 pt, and takes
  any size from 1 to 999 pt: type it and press <kbd>Enter</kbd>.
  <kbd>↑</kbd> / <kbd>↓</kbd> step to the next size, by 20 % past the
  largest one.
- <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> undo and redo.

## Slideshow

| Key | Action |
|-----|--------|
| <kbd>→</kbd>, <kbd>↓</kbd>, <kbd>Space</kbd>, <kbd>Page Down</kbd>, <kbd>Enter</kbd>, click | next slide |
| <kbd>←</kbd>, <kbd>↑</kbd>, <kbd>Page Up</kbd>, <kbd>Backspace</kbd>, right-click | previous slide |
| <kbd>Home</kbd> / <kbd>End</kbd> | first / last slide |
| <kbd>Esc</kbd> | exit |

The slideshow uses the full screen when the browser allows it.

### Presenter view

**🎤 Presenter view** starts the slideshow and opens a second window, the
console, for you: drag it to the screen facing you (a laptop with a
projector), and the slideshow to the projector.

- The **current slide**, the **next slide** (or *End of the slideshow*), and
  the **speaker notes** of the current slide, in large letters (**A−** /
  **A+**).
- The **time spent** since the start (**⏸** to pause, **↺** to restart) and
  the time of day.
- **◀ ▶** and the same keys as the slideshow move both; moving in the
  slideshow moves the console too. **✕**, <kbd>Esc</kbd> or closing the
  console ends the slideshow.

If the browser blocks the second window, the console opens in this window
alone, to rehearse; allow pop-ups for the site to present on two screens.

## What is preserved

Slide size, text boxes and placeholders (title, subtitle, body — with
geometry inherited from the layout and master in `.pptx`), rectangles,
ellipses, pictures, solid fill and outline colours, theme colours, slide
backgrounds, bold/italic/underline/strikethrough, font size and colour,
alignment, bullets and numbering, speaker notes. Tables are imported as text.

Not preserved: animations and transitions, gradients and effects, SmartArt,
charts, embedded media, rotation, custom geometries (imported as rectangles),
master and layout designs (slides are saved with a blank master).
