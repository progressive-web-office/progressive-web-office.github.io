---
description: MDZ Markdown packages — compatibility with the wflixu/mdz specification, JSON Schema, and ZIP import.
---

# MDZ packages (zipped Markdown)

An **MDZ** file (`.mdz`, MIME type `application/x-mdz`) is a ZIP archive that
bundles a Markdown document with its images and other assets, so that a
document stays a plain, open, human-readable format while remaining a single
file.

Progressive Web Office implements the
[MDZ specification v1.1.0](https://github.com/wflixu/mdz/blob/main/mdz-spec.md)
published by the [wflixu/mdz](https://github.com/wflixu/mdz) project (MIT),
both as a reader and a writer.

## Layout

```text
document.mdz (ZIP archive)
├── index.md          # main Markdown document (UTF-8, CommonMark + GFM)
├── manifest.json     # metadata and asset list (required)
└── assets/
    ├── images/       # images referenced as ./assets/images/...
    ├── videos/
    ├── audio/
    └── files/
```

## Manifest

```json
{
  "version": "1.1.0",
  "title": "Document Title",
  "author": "Ada Lovelace",
  "date": "2026-10-01",
  "filename": "index.md",
  "assets": [
    {
      "id": "3fa1c2d4e5f60718",
      "path": "assets/images/3fa1c2d4e5f60718.png",
      "type": "image",
      "alt": "A diagram"
    }
  ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | string | yes | MDZ specification version; major version `1` is supported |
| `title` | string | yes | Document title |
| `author` | string \| null | no | Author name |
| `date` | string \| null | no | ISO 8601 date recommended |
| `filename` | string \| null | no | Original Markdown file name |
| `assets` | array | no | `id`, `path`, `type` required; `alt`, `title` optional |
| `subject` | string \| null | no | Subject *(Progressive Web Office extension)* |
| `description` | string \| null | no | Summary *(extension)* |
| `keywords` | string[] | no | Keywords *(extension; a comma-separated string is also read)* |
| `language` | string \| null | no | BCP 47 language tag, e.g. `fr` *(extension)* |
| `license` | string \| null | no | Licence, preferably an SPDX identifier such as `CC-BY-4.0` *(extension)* |

The document properties (**ⓘ** in the editor) are stored in the manifest; the
`index.md` of a package written by Progressive Web Office has no front matter.
When an `index.md` does have one, its values fill the fields the manifest
leaves empty. The last five fields are proposed upstream to become part of the
MDZ specification.

Unknown fields — including `x-*` extensions — are accepted and **preserved**
when the package is saved again.

## JSON Schema

The manifest is validated against a JSON Schema (draft 2020-12), published at
[`schemas/mdz-manifest-1.schema.json`](/schemas/mdz-manifest-1.schema.json):

<<< ../../schemas/mdz-manifest-1.schema.json

The schema is a contribution of this project and is proposed upstream to
wflixu/mdz.

## How Progressive Web Office reads MDZ

- The manifest must be valid JSON and valid against the schema; the major
  version must be `1`. Otherwise the package is refused with an explanation.
- `index.md` is the document. Images referenced with relative links
  (`./assets/images/...`) are embedded in the editor.
- Paths that are absolute, contain `..` escaping the archive or backslashes
  are never resolved.
- Assets that the editor does not display (videos, audio, other files) are
  kept and written back on save.

## How it writes MDZ

- `index.md` is generated from the document (CommonMark + GFM tables).
- Each distinct image is stored once as
  `assets/images/<content-hash>.<ext>` and referenced as
  `./assets/images/<content-hash>.<ext>`.
- `manifest.json` is written with `version` `1.1.0` and validated by the
  test-suite against the JSON Schema.

## Turning a plain ZIP into an MDZ

A ZIP archive containing a single Markdown file and its images opens as a
document:

1. Its `.md` file is the document.
2. Relative image links are resolved inside the archive.

A ZIP holding several Markdown files is a set of notes: it opens as a folder
(see [ZIP archives](../guide/archives.md)). An MDZ package without `index.md`
that holds several Markdown files asks which one is the **entry point**
(`index.md`, then `README.md`, are pre-selected).

Choose **Save** (or *Save as → Markdown package (.mdz)*) to obtain a
conforming `.mdz`: the manifest is generated, images move to
`assets/images/`, and the other files (including other Markdown files) are
kept under `assets/files/`, with links rewritten accordingly.
