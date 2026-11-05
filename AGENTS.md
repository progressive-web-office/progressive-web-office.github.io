# Instructions for AI agents

Follow [CONTRIBUTING.md](CONTRIBUTING.md) and these rules.

## Process

- Spec-driven: the requirement comes first, in `docs/requirements.md`,
  written with the Easy Approach to Requirements Syntax (EARS) and a MoSCoW
  priority, a new ID per feature. Show it to the maintainer before coding.
- Write the tests before the code (TDD); each test names its requirement ID.
- Run the tests, and build the documentation without warnings, before
  committing code changes.
- Document every new feature in `docs/`; the documentation build also
  writes `llms.txt` and `llms-full.txt`.
- Record every notable change in `CHANGELOG.md` ("Keep a Changelog" format).
- The project follows Semantic Versioning.
- Write code, comments and documentation in English.
- The `justfile` holds the main entry points.
- Follow the REUSE convention (<https://reuse.software/>).
- An upstream bug goes into `upstream-bugs.md`, with the version numbers
  needed to reproduce it.

## Git

- Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`,
  `chore:`…).
- Disclose AI use with the trailer `Assisted-by: AI`, without a model name,
  and prefix pull request titles with `[AI]`.
- Never add "Generated with [Claude Code]", a `Co-Authored-By:` line or any
  other attribution, in commit messages, pull request descriptions, issues,
  comments or anywhere in the project.
- `.gitignore` uses an allow-list ("gitallow") pattern. Do NOT modify it;
  if a change is necessary, ask the maintainer first, in CAPITAL LETTERS.
- Never `git add` `CLAUDE.md`, `spec.md`, nor the `.agent/`, `.claude/`,
  `.specify/` and `specs/` folders. This `AGENTS.md` is the exception, kept
  by the maintainer's choice.

## Project files

- `SECURITY.md` (reporting through GitHub Security Advisories, no personal
  email address), `CODE_OF_CONDUCT.md` (latest Contributor Covenant) and
  `LICENSE.md` must be present.
