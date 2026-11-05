# Contributing to Progressive Web Office

Thank you for your interest. Bug reports, translations, documentation and
code are all welcome.

## Report a bug or ask for a feature

Open an [issue](https://github.com/progressive-web-office/progressive-web-office.github.io/issues).
For a bug, please give:

- what you did, what you expected and what happened;
- the browser and its version, and the device (computer or phone);
- if possible a small file that shows the problem (remove anything private).

Security problems should not be reported in public issues: see
[SECURITY.md](SECURITY.md).

Issues labelled
[good first issue](https://github.com/progressive-web-office/progressive-web-office.github.io/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
are a good place to start.

## Set up

Requirements: Node.js 20 or later, [just](https://github.com/casey/just),
and Chromium for the end-to-end tests (`npx playwright install chromium`).

```sh
just install    # install dependencies
just dev        # development server with live reload
```

More details: [docs/development.md](docs/development.md) and
[docs/architecture.md](docs/architecture.md).

## Make a change

1. Look for the requirement in [docs/requirements.md](docs/requirements.md)
   (EARS wording, MoSCoW priority). A new feature gets a new requirement ID.
2. Write the test first (Vitest in `tests/`, Playwright in `e2e/`) and name
   the requirement ID in its `describe()` or test title, for example
   `DOC-026`.
3. Write the code. TypeScript strict mode, no UI framework; keep modules
   small and independent of the application shell where possible.
4. Update the documentation in `docs/` for anything a user can see, and add
   a line to [CHANGELOG.md](CHANGELOG.md) under *Unreleased*
   ([Keep a Changelog](https://keepachangelog.com/)).
5. User-visible text goes in `src/i18n/en.ts`, with its French and Chinese
   translations in `fr.ts` and `zh.ts` (the type check fails when a key is
   missing). A machine translation marked in the pull request is fine.
6. **A template or an example must be one a user could make with the
   application itself.** Everything it uses — a field, a column break, a
   chart, a column width, a bend in a line, a gradient, a layer — needs a
   command in the interface (a toolbar button, a menu, the command palette),
   not only in the code that builds the template. Add the command with the
   template, and say in the pull request where it is.
7. Run everything before committing:

   ```sh
   just check   # type check, unit tests, build, documentation
   just e2e     # end-to-end tests
   ```

## Commits and pull requests

- Small commits, with [Conventional Commits](https://www.conventionalcommits.org/)
  messages (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- If an AI tool helped write a commit, add the trailer `Assisted-by: AI`
  (without a model name), and prefix the pull request title with `[AI]`.
- One topic per pull request. Describe what changes for users and how you
  tested it.

## License

By contributing, you agree that your contribution is licensed under the
[GNU Affero General Public License v3.0 or later](LICENSE.md), like the rest
of the project.

The repository follows the [REUSE](https://reuse.software/) convention: the
copyright and licence of every file are declared in `REUSE.toml`, the licence
texts are in `LICENSES/`. A file under another licence (a third-party file
served as it is, for example) gets its own annotation in `REUSE.toml`.
`just reuse` (or `uvx reuse lint`) checks it; the CI runs it too.
