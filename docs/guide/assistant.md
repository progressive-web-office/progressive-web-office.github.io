---
description: AI assistant (Claude, OpenAI, Mistral, Albert, Ollama or any OpenAI-compatible server) that reads and edits documents, spreadsheets and presentations through tools; WebMCP tools for in-browser AI agents.
---

# AI assistant

Progressive Web Office includes an optional assistant powered by the AI of
your choice — **Claude** (Anthropic), **OpenAI**, **Mistral AI**, **Albert**
(the AI API of the French State), a model running on your own computer with
**Ollama**, or any server offering the OpenAI API. It works on the open document through *tools* — the same
operations you could do by hand — so every change is visible and can be
undone.

| Document | What the assistant can do |
|----------|---------------------------|
| Text document | read it (as Markdown, block by block), rewrite, insert or delete blocks, find and replace — including LaTeX equations `$…$` |
| Spreadsheet | list and read sheets (values, formulas, results), write values and formulas, add sheets |
| Presentation | read slides and shapes, change text, add slides with bullet points, add text boxes, delete slides |
| PDF file | read the text of its pages, list and fill its form fields (only with values they accept), list its annotations, place a note on a page, highlight a text it finds |
| Open folder | list the notes and documents of the folder, search them (with extracts) and read one as text — never outside the folder, never changing them |

## Set up

1. Open or create a document, then click **✨** (*AI assistant*).
2. Choose the **provider**, then fill in what it needs:

   | Provider | Key | Model | Notes |
   |----------|-----|-------|-------|
   | Anthropic (Claude) | from [console.anthropic.com](https://console.anthropic.com/) | default `claude-opus-5-5` | **Effort** setting (lower is faster and cheaper) |
   | OpenAI | from [platform.openai.com](https://platform.openai.com/) | the model name of your choice | |
   | Mistral AI | from [console.mistral.ai](https://console.mistral.ai/) | default `mistral-large-latest` | |
   | Albert (API de l’État) | from Etalab, for public servants | see the server's `/v1/models` list | address editable for other Albert instances |
   | Ollama (local) | none | a model you pulled (`ollama pull …`) | address `http://localhost:11434/v1` by default; see below |
   | OpenAI-compatible server | if the server needs one | as listed by the server | LM Studio, vLLM, LocalAI, OpenRouter…: give the address ending in `/v1` |

3. Optionally tick **Save the key in this browser**.
4. Click **Save**, type a request and press **Send** (<kbd>Ctrl</kbd>+<kbd>Enter</kbd>).

Each provider keeps its own key, model and address: you can switch between
them in the settings (⚙). Switching starts a new conversation. Every provider
gets the same tools, confirmations and undo; how well a model uses the tools
depends on the model — small local models may need simpler requests.

### Local models (Ollama, LM Studio)

With a local server, your documents never leave your computer or network.
The browser only lets a web page call a server that accepts it (CORS):

- **Ollama**: start it with the address of this application allowed, for
  example `OLLAMA_ORIGINS=https://progressive-web-office.github.io ollama serve`.
- **LM Studio**: enable *CORS* in the local server settings.

Servers on `localhost` / `127.0.0.1` can use plain HTTP; any other address
must use HTTPS.

Examples: *“Summarise this document in five bullet points at the end”*,
*“Add a TOTAL row under the table with SUM formulas”*, *“Turn this outline
into one slide per section”*, *“Write the quadratic formula as a display
equation after the second paragraph”*.

## Privacy and control

- **Consent first.** Before the first request of a session — and again
  whenever you change the provider, its address or the model — the assistant
  tells you which provider and model will receive your message and the
  content of the open document, and asks for your agreement. Nothing is sent
  otherwise; nothing else leaves the device.
- **Your key, your browser.** By default the key is used for the current
  session only: it is never written to storage and is forgotten as soon as the
  page is closed or reloaded. Tick **Save the key in this browser** to keep it
  between sessions (it is then stored in this browser's local storage). Each
  key is sent only to the API of its provider. **Forget the key** removes all
  keys.
- **Visible actions.** Each tool call is listed in the conversation (✓ or ✗
  with its result).
- **Undo.** After a request that changed the document, **Undo the assistant’s
  changes** restores it as it was before the request. In spreadsheets and
  presentations, <kbd>Ctrl</kbd>+<kbd>Z</kbd> also undoes changes one tool
  call at a time.
- With Claude, if a request is declined by the model's safety systems, it is
  retried automatically on a recommended fallback model (server-side
  fallback); otherwise the assistant says so.

## WebMCP: tools for other AI agents

When the browser exposes the experimental **WebMCP** API
(`document.modelContext`, previously `navigator.modelContext`), Progressive
Web Office registers the same tools — prefixed `pwo_`, for example
`pwo_read_document`, `pwo_set_cells`, `pwo_add_slide`, `pwo_fill_pdf_fields`
— for the open document, and `pwo_list_notes`, `pwo_search_notes` and
`pwo_read_note` while a folder is open. An AI agent running in the browser (an assistant built into the
browser, an extension…) can then read and edit the document.

Read-only tools are marked as such; **every modification asks for your
approval** in a dialog showing the tool and its arguments. Tools are
unregistered when the document (or the folder) is closed.

For example, an agent of the browser can read a letter in another tab and
fill the PDF form it asks for, or answer a question from your notes, citing
the notes it read.
