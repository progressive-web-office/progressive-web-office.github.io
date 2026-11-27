---
description: Run Python (Pyodide, numpy, matplotlib…) and JavaScript code cells in text documents, safely sandboxed; reactive cells and their dependency graph; interactive widgets (anywidget); how cells and outputs are stored.
---

# Code cells

Text documents can contain **code cells**, in Python or JavaScript, that you
run on demand — like a notebook, inside a normal document. Useful for a
practical session, a lab report or a small calculation whose result should
stay next to the explanation. Cells are **reactive** (a cell knows the cells
it depends on) and can show **interactive widgets** (knobs, sliders,
gauges…). The examples *Lab report with Python plots*, *Interactive widgets*
and *Instrument panel* (Templates and examples) show them at work.
[Math cells](#math-cells-computer-algebra) compute an equation written in a
math field with SymPy.

## Inserting and running

1. Click **{ }** in the toolbar (or **Code cell to run…** in the
   [context menu](./documents.md#the-context-menu): right click, long press
   or **⋮**), choose the language and type the code (<kbd>Tab</kbd> indents).
   Typing ```` ``` ```` and a language at the start of a line, then
   <kbd>Enter</kbd> (```` ```python ````, ```` ```lua ````, ```` ```r ````…),
   opens it in that language.
2. Click **Insert**: the cell is added on its own line.
3. Click **▶** to run the cell, or **⏩** to run all the cells of the document
   (in the order of what they use, see below).

Print results with `print()` (Python) or `console.log()` (JavaScript); in
Python, the value of the last line is shown too. Figures drawn with
**matplotlib** are added below the output. Cells of the same language share
their names: define `x` in one cell and use it in another, in Python as in
JavaScript (where `const`, `let`, functions, classes and imports declared at
the top level of a cell are shared).

Click the code or **✎** to edit a cell; changing the code removes its previous
output. **■** stops a running cell (for example an endless loop) — the next run
starts afresh.

```python {run}
import numpy as np
import matplotlib.pyplot as plt

t = np.linspace(0, 10, 500)
plt.plot(t, np.exp(-0.3 * t) * np.sin(2 * np.pi * t))
plt.title("Damped signal")
```

## Reactive cells

The cells of a document know what they use: a cell **depends** on the cells
that define the names it uses. So:

- cells run in the order of their dependencies, wherever they are in the
  document: a cell using `a` runs after the cell defining `a`, even if that
  cell comes later;
- when you change or run a cell, the cells using what it defines are marked
  **⟳ out of date** (their output is dimmed): it is no longer the result of
  the current code. Run one of them: the out-of-date cells it uses run first;
- a cell you have just changed is out of date too, until it runs.

*Settings › Writing › When a code cell runs* chooses what happens to the
cells using it:

| Setting | Behaviour |
|---------|-----------|
| mark them as out of date (default) | they keep their output, marked ⟳, until you run them — good for long computations |
| run them too | they run right away, like a spreadsheet |
| run it alone (no dependencies) | the classic notebook: cells run in the order of the document, and JavaScript cells do not share their names |

Two rules keep the results reproducible, with no hidden state:

- **a name is defined in one cell only.** A name defined in two cells is
  reported in both (“`x` is defined in several cells”), and they do not run.
  Names starting with `_` (`_i`, `_tmp`) stay inside their cell and may be
  reused anywhere;
- two cells cannot use each other (a cycle): they are reported and do not
  run.

A name no cell defines any more (you deleted or changed the cell defining it)
is removed from the interpreter at the next run, so a cell still using it
fails instead of using an old value.

### Seeing the dependencies

*View › Dependencies of the cells* (or **🔀** in the bar of a cell) shows,
next to the document, the graph of the cells: one box per cell (its number,
its language and the names it defines), an arrow from a cell to each cell
using it, labelled with the names it carries. The colour tells the state of
each cell:

| Colour | State |
|--------|-------|
| green | run |
| grey, dashed | out of date |
| red | failed (or a name defined twice, a cycle) |
| yellow, dashed | a cell it uses failed (the arrow carrying the failure is red) |
| white | not run yet |

Click a box to go to its cell; **🔀** on a cell draws its box out in the
graph. The graph follows the changes of the document and the runs. *As a
list* gives the same information as text: what each cell defines, which cells
it uses (and through which names), and which cells use it.

Showing the graph starts the Python interpreter to read the cells (no code of
the document runs).

## Widgets

Cells can show **interactive widgets**: knobs, gauges, sliders, charts…
Progressive Web Office is a host of [anywidget](https://anywidget.dev)
widgets: a widget is a web module (its *front end*) and a set of values
(*traits*) shared with the code. Moving a knob changes the value in the code;
changing the value in the code moves the knob.

### From Python

Write widgets as in Jupyter or marimo, with `anywidget` and `traitlets`; the
widget on the last line of a cell (or given to `display()`) is shown below
it:

```python {run}
import anywidget, traitlets, pwo

class Counter(anywidget.AnyWidget):
    _esm = """
    export default {
      render({ model, el }) {
        const b = document.createElement("button");
        const show = () => { b.textContent = `count is ${model.get("count")}`; };
        b.onclick = () => { model.set("count", model.get("count") + 1); model.save_changes(); };
        model.on("change:count", show);
        show();
        el.append(b);
      },
    };
    """
    count = traitlets.Int(0).tag(sync=True)

counter = pwo.ui(Counter())
counter
```

- `anywidget`, `ipywidgets`, `comm` and `psygnal` come with the application
  (they work offline); they are loaded the first time a cell mentions them.
- **`pwo.ui(widget)`** makes the widget *reactive*: when the user changes
  it, the cells using it run again (like `mo.ui.anywidget` in marimo). A
  widget without `pwo.ui` only changes its values (and calls its
  `observe` / `on_change` callbacks).
- Layout widgets of `ipywidgets` are drawn too: `HBox`, `VBox`, `Box`,
  `GridBox` with their `Layout`, `Label`, `HTML`. Other `ipywidgets`
  controls (sliders, buttons…) are not: use an anywidget.
- Widgets composed of other widgets (AFM references `anywidget:<id>`) work.

### Packages of widgets

**`await pwo.install(...)`** installs packages of pure Python wheels:

- a wheel URL: `await pwo.install("https://example.org/x-1.0-py3-none-any.whl")`;
- a list of wheels, one per line, relative to the list (`wheel.txt`, as
  published with the anywidget instruments demos):
  `await pwo.install("https://example.org/demo/public/wheel.txt")`;
- a project name of the Python package index: `await pwo.install("some-widget")`.

The first download from a site asks you (**Download code for this
document?**): allow only sites you trust. Downloaded packages are kept for
offline use. Their requirements that come with Python in the browser
(`numpy`…) are loaded with them.

### From JavaScript

JavaScript cells create widgets from the text of a module and its traits:

```javascript {run}
const esm = await importWidget("https://example.org/widgets/index.js");
const css = await importWidget("https://example.org/widgets/index.css");
const gauge = widget(esm, { value: 3.2, min: 0, max: 5, label: "Level" }, { css });
const gain = ui(widget(esm, { value: 2.5 }, { css }));
display(gauge, gain);
```

- `widget(esm, traits, { css })` creates a widget; `w.get(name)`,
  `w.set(name, value)`, `w.on("change:name", callback)`, `w.send(message)`.
- `display(...)` shows widgets below the cell; `ui(w)` re-runs the cells
  using `w` when the user changes it.
- `importWidget(url)` gives the text of a module (or a style sheet), after
  you allowed the site.

### Instrument panels

The [anywidget instruments](https://anywidgetinstruments.github.io/)
(industrial, automotive, aeronautics) work in both ways: from Python with
their package (`await pwo.install(".../wheel.txt")` then
`import anywidget_instruments_industrial as ai`), or from JavaScript with
their front end and the traits of their contract (`_kind` selects the
instrument). The examples *Instrument panel*, *Automation panel*, *Flight
instruments* and *Car dashboard* show each family from Python:

```javascript {run}
const esm = await importWidget("https://example.org/instruments/index.js");
const css = await importWidget("https://example.org/instruments/index.css");
const level = widget(esm, { _kind: "tank", value: 3.2, min: 0, max: 5, unit: "m", label: "Level" }, { css });
const gain = ui(widget(esm, { _kind: "knob", mode: "control", value: 2.5, max: 10, unit: "dB", label: "Gain" }, { css }));
display(level, gain);
```

These instruments are for visualization, teaching and simulation: they are
not certified instruments.

### Safety, saving and printing

Each widget runs in a frame of its own, isolated like the cells: no access
to the page, your files or other documents, and no network. When the
document is saved or printed, each widget is kept as a **picture**: it is
shown in print, in Word, OpenDocument and LaTeX exports, in Markdown
(`![Widget](… "widget")`) and when the document is reopened, until the cell
runs again.

## Hiding the code

**🙈** in the bar of a cell hides its code: only its output (text and
figures) stays, on screen, in print and in the Word, OpenDocument and LaTeX
exports — for example to hand out a sheet of results, or plots without the
program behind them. The cell can still be run; **👁** shows the code again.
*View › Hide the code of every cell* (or *Show…*) does it for the whole
document. In Markdown, the code is kept, with the `hide` flag:
```` ```python {run hide} ````.

## Completion

The code editor of a cell highlights the code, indents it (<kbd>Tab</kbd>),
closes brackets and quotes, and **completes as you type**: keywords,
built-in functions, the names of the cell, and for JavaScript the standard
objects and their members (`Math.floor`, `JSON.stringify`…). JavaScript cells
are understood by the TypeScript language service: the members of a value
after a dot (`words.flatMap` for an array), signatures and documentation,
syntax errors underlined.
<kbd>Ctrl</kbd>+<kbd>Space</kbd> opens the list, <kbd>↑</kbd> <kbd>↓</kbd>
choose, <kbd>Enter</kbd> inserts, <kbd>Esc</kbd> closes it.

Once Python has run a cell of the document, its completions come from the
running interpreter (jedi): the **variables, functions and modules of the
earlier cells** are known, a module's members are listed after a dot
(`statistics.mean`, `np.linspace`), with each function's **signature** and
**documentation** beside the list. Python is not started only to complete:
before the first run, the completion knows the language and the cell.

## Safety

A document can come from anyone, so its code is treated as untrusted:

- **Nothing runs when you open a document.** The first time you run a cell
  in a document, Progressive Web Office explains what running it means and
  asks for confirmation.
- The code runs in an **isolated sandbox**: it cannot read the page, your
  other documents, your recent files, your AI or Git keys, or your settings,
  and it has **no network access**. It cannot open windows or dialogs either.
- It runs in the background: the application stays responsive and **■**
  stops it at any time.
- Widgets run each in a frame of their own, isolated in the same way (no
  access to the page, no network).
- Code can download packages or widget modules (`pwo.install`,
  `importWidget`) only from a site you allowed, when the code first asks
  for it (**Download code for this document?**).

The code can still compute wrong or misleading results — run code only from
documents you trust.

## Python and offline use

Python is provided by [Pyodide](https://pyodide.org/) (Python 3.14 compiled
to WebAssembly). The interpreter and the standard library (about 13 MB) are
served by the application and loaded the first time you run Python; they are
then kept for offline use.

Packages that are not part of the standard library — numpy, matplotlib,
pandas, scipy, sympy and the
[other Pyodide packages](https://pyodide.org/en/stable/usage/packages-in-pyodide.html) —
are detected from the `import` lines and downloaded from the Pyodide CDN
(`cdn.jsdelivr.net`) the first time they are used, then kept for offline use.
Each package is checked against the fingerprints shipped with the
application.

The widget packages (anywidget, ipywidgets, comm, psygnal) come with the
application. Other pure-Python packages can be installed by a cell with
`await pwo.install(...)`, from a wheel URL, a `wheel.txt` list or the Python
package index, once you allowed the site (see [widgets](#packages-of-widgets)).
Packages with compiled code are only those of Pyodide.

## Other languages: Lua, SQL, C/C++, R

The example *Languages* (Templates and examples) has a ready-to-run cell in
each of them.

Python and JavaScript are part of the application. Other languages run with a
**runtime downloaded the first time it is needed**, from the npm CDN
(`cdn.jsdelivr.net`), after you agree for that site; it is then kept in the
browser and works offline. Each file is a pinned version, checked against its
SHA-256 before use.

| Language | Files | Runtime | Download |
| --- | --- | --- | --- |
| Lua 5.4 | `.lua`, ```` ```lua {run} ```` cells | wasmoon | about 0.5 MB |
| SQL (SQLite) | `.sql`, ```` ```sql {run} ```` cells | sql.js | about 0.7 MB |
| C, C++ | `.c`, `.cpp`, ```` ```cpp {run} ```` cells | Clang/LLD (YoWASP) | about 105 MB |
| R | `.R`, ```` ```r {run} ```` cells | webR, from `webr.r-wasm.org` | about 40 MB |

A `.lua` or `.sql` file opened in the code viewer shows **▶ Run**; in a
document, cells of these languages run like the others, in document order
(they share no names with Python or JavaScript cells). Successive runs share
their state: Lua globals, and the tables of the SQL database (in memory,
for the session). A SQL query shows its rows as a table.

C and C++ code is compiled by Clang to WebAssembly, then run: what it prints
appears below, compiler errors and warnings first. A program on its own reads
no input and no files; one of a [project](#projects-several-files) reads the
files of its folder and may have an input. C++ is built without exceptions (`-fno-exceptions`), as the C++
library for WebAssembly has none. Whether code is C++ is told by what it uses
(`#include <iostream>`, `std::`, classes…).

R runs with webR in a sandbox of its own, which downloads its files itself:
it may reach only `webr.r-wasm.org` and the R package repository
`repo.r-wasm.org`, nothing else, and has no access to the application's
data. What R prints appears below the code, and **plots** as pictures.
R packages built for webR install with `webr::install("dplyr")`. Unlike the
other runtimes, webR is not kept by the application for offline use: the
browser's cache usually keeps it, but the first run of a session may need the
network.

## Any other language

Cells can hold code of languages that do not run in the browser (CODE-020):
**Bash**, **PowerShell**, **Julia**, Java, C#, Visual Basic, Rust, Fortran,
Go, Pascal / Delphi, PHP, assembly, Ada, Swift, Objective-C, COBOL, Kotlin,
TypeScript, MATLAB / Octave, VHDL, Verilog, Modelica… and formats such as
HTML, JSON, YAML, TOML or LaTeX. Choose the language under *Shown and
edited only* in the cell’s window, or type ```` ``` ```` and its name (`sh`, `ps1`,
`jl`, `cs`…) then <kbd>Enter</kbd>.

Their code is shown in colour and written with **completion** — the
keywords and usual commands of the language (`grep`, `Get-ChildItem`,
`println`…) and the words already in the code — but has no ▶ Run: run it
in a terminal or the language's own tools. In Markdown such a cell is kept
as ```` ```bash {cell} ````; other Markdown tools show it as a code block.

## Projects: several files

A code file opened **from an open folder** runs with the other files of its
**project**, so it can import its own modules and read its data:

- the project is the **folder of the file** — or, when a folder above it holds
  a project file (`pwo.toml`, `pyproject.toml`, `setup.py`, `package.json`,
  `tsconfig.json`, `CMakeLists.txt`, `Makefile`, `DESCRIPTION`), that folder;
- its files are copied into the sandbox, under `/project`, which is the
  **working folder**: paths are relative to the project's folder. Hidden
  folders, `node_modules`, `__pycache__`, virtual environments, `build` and
  `target` are left out, and so are files over 10 MB (the run says how many);
- the **entry point** is the file you run — with the text as it is in the
  editor, saved or not — unless `pwo.toml` names another one;
- the sandbox still has no network and no access to your other files; what a
  program writes stays in the sandbox for that run, the folder is not changed.

The output is titled *Output of main.py (project stats)*.

| Language | What a project offers |
| --- | --- |
| Python | `import` of the modules and packages of the file's folder and of the project; `open()` of its files; `sys.argv`, standard input (`input()`). Packages imported by the modules are installed as for the file. Modules are imported afresh at each run. |
| JavaScript, TypeScript | `import` of relative modules (`./lib/util.js`, `./util` or `./util.ts`, `./data.json`, `./lib` for `lib/index.js`); TypeScript modules lose their types. `readText(path)` and `readBytes(path)` read a file of the project. |
| Lua | `require "module"` finds the `.lua` files of the file's folder and of the project (afresh at each run); `io.open` reads their files; `arg` holds the arguments. |
| SQL | `.read schema.sql` runs a file of the project; `.open data.db` opens a copy of a SQLite database of the project. |
| C, C++ | the `.c`/`.cpp` files of the entry point's folder (or those of `sources`) are compiled together; `#include "util.h"` finds the headers of that folder and of the project; `fopen` reads the files (and writes in memory, for the run); `argv`, `stdin`. |
| R | `source("helpers.R")`, `read.csv("data/values.csv")`…; `commandArgs(trailingOnly = TRUE)` gives the arguments. |

### pwo.toml

An optional `pwo.toml` at the root of the project says how to run it. Every
key is optional; paths are relative to the project:

```toml
# The file run, whatever file is open (by default, the open one).
main = "src/main.c"
# Arguments: sys.argv[1:], argv, arg, commandArgs(TRUE).
args = ["data/values.txt", "--verbose"]
# C/C++: compiler options (default: -O2) and the files compiled together.
cflags = ["-O2", "-std=c17", "-DDEBUG"]
sources = ["src/*.c", "lib/**/*.c"]
# Standard input of the program (C/C++, Python).
stdin = "data/input.txt"
```

It is a subset of TOML: keys with a string or a list of strings; comments
after `#`. A mistake is shown with its line number.

## marimo notebooks

A [marimo](https://marimo.io) notebook — a `.py` file whose cells are
`@app.cell` functions — opens as a document: cells holding only
`mo.md("""…""")` become text, the others Python cells (those marked
`hide_code=True` show their output only). The cells run here like any Python
cells, reactively: `import marimo as mo` gives a small stand-in offering
`mo.md` and `marimo.App`; the rest of marimo (`mo.ui`…) needs marimo itself.
**Save** writes the notebook back as marimo reads it: unchanged cells exactly
as they were, edited cells with their arguments (the names they use from other
cells) and returned names computed again. A `.py` file that is no marimo
notebook opens as Python source code, which runs with **▶ Run**; when it
imports a package the offline Python lacks, a button downloads it from the
package index (pure-Python packages) and runs the file again.

## Math cells (computer algebra)

A **math cell** holds an expression written in a **math field** (the editor
of equations, with its virtual keyboard on touch screens), computed by
**SymPy** — the computer algebra library of Python — and its result is shown
as an equation under it. The example *Computer algebra* (Templates and
examples) shows every operation.

1. Click **Insert math cell** (∑= in the toolbar, or **Math cell to compute…**
   in the context menu), or type ```` ```math {run} ```` at the start of a
   line, then <kbd>Enter</kbd>.
2. Type the expression in the math field (or its LaTeX). To apply an
   **operation**, choose it — *Simplify*, *Expand*, *Factor*, *Solve for a
   variable*, *Differentiate*, *Integrate* (with bounds or not), *Limit*,
   *Series expansion*, *Numerical value* — fill in the variable and the
   bounds it asks for, and click **Apply**: the expression is wrapped in the
   notation of the operation (`\operatorname{factor}(…)`, `\int_0^1 … \,dx`,
   `\frac{d}{dx}(…)`, `\lim_{x\to 0}`…), which you can also type yourself.
   *Code sent to SymPy* shows what will run.
3. Click **Insert**, then **▶** (or **⏩** for every cell).

What a math field writes is understood: numbers (exact: `\frac{1}{3}` stays
a fraction; `3.5` is a decimal), letters and Greek letters, with subscripts
(`x_1`), `\pi`, `e`, `i` and `\infty`, the four operations and implicit
products (`2x`), powers, roots, factorials, absolute values, the usual
functions (`\sin`, `\ln`, `\exp`…), matrices (`pmatrix`, `bmatrix`; a
`vmatrix` is a determinant), equations and inequalities, integrals,
derivatives (`\frac{d}{dx}`, `f'(x)`), limits (`0^+` for one side), sums and
products.

**Definitions** use `:=`: `a := 3`, `f(x) := x^2 e^{-x}`. They are known to
the next cells — `f(2)`, `\frac{d}{dx}(f(x))` — which run after the cell
defining what they use, as code cells do. The names of math cells are kept
apart from those of Python cells.

SymPy runs in the sandbox of Python cells: the first run downloads Python and
SymPy (about 10 MB), then it works offline. An expression that cannot be read
says why, without running anything; an error of SymPy shows its message.

````md
```math {run sympy}
\int_0^{\infty}x^2e^{-x}\,\mathrm{d}x
```

```math {output}
2
```
````

In Markdown, a math cell is a ```` ```math {run sympy} ```` block holding its
LaTeX, followed by a ```` ```math {output} ```` block holding the LaTeX of its
result: other tools that draw `math` blocks show both as equations. In Word,
OpenDocument and LaTeX, it is written as its equation followed by the
equation of its result.

## KaimonSlate notebooks (Julia)

A [KaimonSlate](https://github.com/kahliburke/KaimonSlate.jl) notebook — a
`.jl` file whose cells start with `#%% md` or `#%% code` lines — opens as a
document: text cells as formatted text, code cells as **Julia** cells showing
their header (`#%% code id=… tags`). You can read, edit, comment, version and
share it like any document, and **Save** writes the notebook back: headers,
ids and tags are kept, and the text cells you did not change keep their
Markdown exactly as written. A `.jl` file without `#%%` cells opens as Julia
source code.

Julia does not run in the browser: run the notebook in KaimonSlate itself
(`slate notebook.jl`). Here, Julia cells have no ▶ button.

## Storage in each format

| Format | Cell | Output |
|--------|------|--------|
| Markdown / MDZ | a fenced block with the `{run}` attribute: ```` ```python {run} ```` or ```` ```javascript {run} ```` | a following ```` ```text {output} ```` block (```` {output error} ```` for an error) and figures as images titled `output` (MDZ stores them as image assets) |
| Word, OpenDocument, LaTeX | the code as a code block | the last output as a code block and the figures as pictures |

Widgets are kept as their picture, taken when the document is saved or
printed: in Markdown, an image titled `widget`; in other formats, a picture
after the output. Out-of-date marks are not saved: a reopened document
starts with no run.

In Markdown, other tools show the cells as ordinary code blocks with their
results. Word, OpenDocument and LaTeX files keep the code and its last output
for reading and printing, but not as runnable cells.

When printing, the code and its last output are printed; the buttons are not.
