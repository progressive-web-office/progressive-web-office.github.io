---
description: Canvases in the open JSON Canvas format (.canvas) — cards of text, files of the folder, web addresses and groups on an infinite plane, connected by arrows; opened, edited and saved in the same format.
---

# Canvases

A **canvas** is a large plane on which you place **cards** and connect them
with **arrows**: a mind map, a storyboard, a plan of a project, the outline of
a talk. Canvases are kept in the open **JSON Canvas 1.0** format (`.canvas`
files), which other note-taking applications read and write too.

## Opening and making a canvas

- Open a `.canvas` file like any other file, or click it in the folder panel
  (🧩).
- In an open folder, **New canvas (.canvas)** in the folder panel's toolbar
  makes an empty one.

## What a canvas holds

| Card | Shown as |
|------|----------|
| Text | its Markdown: headings, emphasis, lists, links, equations… |
| File | a note of the folder shown as its text, a picture as the picture, another file as its name (with the folder open) |
| Link | its web address |
| Group | a frame with its label (and its background picture, if any) |

Arrows go from a side of a card to a side of another, with an arrow head at
one end, both or none, an optional label and a colour. Colours are the six
preset ones (red, orange, yellow, green, cyan, purple) or any colour you
choose.

## Moving around

- **Move** by dragging the empty plane (or with the middle button, two
  fingers, the scroll bars).
- **Zoom** with the wheel (where the pointer is), a pinch, the **−** and **+**
  buttons, or the **+** and **−** keys; **Fit** (or **0**) shows the whole
  canvas.
- **Double-click** a file card to open its file, a link card to open its
  address (after a confirmation).

## Editing

- **Text**, **File…**, **Link…** and **Group** add cards; a double click on
  the empty plane adds a text card there. **Group** frames the cards
  selected.
- **Drag** a card to move it — moving a group moves the cards inside it —
  and its bottom-right corner to resize it. The arrow keys move the
  selection (with Shift, by larger steps).
- **Double-click** a text card to edit its Markdown (Ctrl+Enter or a click
  outside to finish, Escape to cancel), a group's label or an arrow to edit
  its label.
- **Connect** two cards by dragging from one of the dots on the sides of a
  card to another card.
- Choose a **colour** for the selected cards and arrows, **Delete** (or the
  Delete key) removes them — with the arrows of the cards removed.
- Shift+click adds to the selection; Ctrl+A selects every card.
- Every change can be undone (**Ctrl+Z**) and redone (**Ctrl+Y**).

## Saving

The canvas is saved in the JSON Canvas 1.0 format. Fields and kinds of cards
the application does not know — written by other applications or later
versions of the format — are kept as they are, in their place. A file that is
not a valid canvas is shown read-only and saved unchanged.
