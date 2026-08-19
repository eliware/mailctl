# Release notes

## 1.2.7 — 2026-08-19

- Added durable event-outbox schema migration support for reliable mail event publication.
- Added Discord correlation and deletion provenance schema migrations for outbound mail.
- Enqueued soft-delete events for inbound and outbound messages.
- Added the `npm run audit` production dependency audit command.
- Restored migration and deletion coverage to strict 100×4.

## 1.2.5 — 2026-08-19

- Moved versioned database migrations and the migration runner into mailctl.
- Added the confirmed `mailctl migrate` command.
- Added outbound soft-delete support.

## 1.2.0 — 2026-08-18


## Unreleased

- Refactored the CLI into independently testable source modules.
- Added per-user configuration loading from `~/.config/mailctl/.env`.
- Added baseline tests for every source module and improved coverage to about 50%.
- Added npm package metadata and a global `mailctl` executable entry.
- Added command-specific, agent-oriented help and `--version` support.
- Added CI validation on pushes to `main` and pull requests.
- Added npm publication with provenance for `v*` tags.
- Added safe `.env.example` configuration documentation.
