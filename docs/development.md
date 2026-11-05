---
description: How to build, test and contribute to Progressive Web Office.
---

# Development

## Requirements

- Node.js ≥ 20 and npm
- [just](https://github.com/casey/just) (command runner)
- Chromium for end-to-end tests (Playwright)
- [bun](https://bun.sh) only for the QRShare integration tests
- [uv](https://docs.astral.sh/uv/) for `uvx reuse lint` (licensing check)

## Commands

| Command | Description |
|---------|-------------|
| `just install` | Install dependencies (`npm ci`) |
| `just dev` | Start the development server |
| `just test` | Run the unit tests (Vitest + jsdom) |
| `just typecheck` | Type-check with `tsc --noEmit` (strict mode) |
| `just build` | Production build into `dist/` (with service worker) |
| `just preview` | Serve the production build |
| `just e2e` | End-to-end smoke tests (Playwright) |
| `just e2e-qrshare` | Integration tests with a real [QRShare](https://github.com/s-celles/QRShare) build (requires [bun](https://bun.sh)) |
| `just docs` | Build this documentation, plus `llms.txt` and `llms-full.txt` |
| `just docs-dev` | Live-preview this documentation |
| `just reuse` | Check that every file has its copyright and licence ([REUSE](https://reuse.software/): `REUSE.toml`, `LICENSES/`) |
| `just check` | Everything a contributor must run before committing |

## Workflow

- Requirements are written with **EARS** (Easy Approach to Requirements
  Syntax) and prioritised with **MoSCoW**. Tests reference requirement IDs in
  their `describe()` titles (for example `DOC-001`).
- **Test-driven development**: write the failing test first, then the code.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- The project follows [Semantic Versioning](https://semver.org/): roadmap
  phases were `0.0.x` milestones up to `0.0.13`, then `0.1.0` (see
  `ROADMAP.md`); new features bump the minor version while in `0.x`.
- Every notable change is listed in `CHANGELOG.md`
  ([Keep a Changelog](https://keepachangelog.com/)).
- AI assistance is disclosed with an `Assisted-by: AI` commit trailer.

## Translations

User-visible strings live in `src/i18n/en.ts` (reference), `fr.ts` and
`zh.ts`, and are looked up with `t('key', { param })`. The French and Chinese
catalogs are typed as `Record<MessageKey, string>`, so a missing key fails the
type-check, and `tests/i18n.test.ts` also checks that placeholders match.
To add a language: create a catalog, register it in `src/i18n/index.ts`
(`LOCALES`, `CATALOGS`, `detectLocale`).
