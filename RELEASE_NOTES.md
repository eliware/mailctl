# Release notes

## 2.1.0 — 2026-08-30

### Agent UX

- Added JSON-native `inbox`, `reply`, `reply-all`, and `forward` workflows.
- Added inline, stdin, and `--input FILE` JSON request handling for mutations.
- Standardized command output and errors as JSON; `--json` is an accepted
  no-op.
- Added caller-project `MAIL_OWNER_ADDRESS` loading with fail-closed mailbox
  filtering.
- Preserved existing attachment, retry, cancel, delete, search, status,
  health, domain, thread, and outbound inspection capabilities.
- Added API passthrough coverage for owner-scoped reads and unified send,
  reply, and forward requests.

## 2.0.0 — 2026-08-30

### Breaking

- Mailctl now uses the authenticated Mail REST API for every command.
- Removed direct MariaDB, RabbitMQ, shared-storage, and migration support.
- Removed legacy service configuration variables and direct-service dependencies.

### Added

- Added API configuration through `MAIL_API_URL` and `MAIL_API_TOKEN`.
- Added API contract coverage for reads, sends, attachments, search, deletion,
  retry/cancel, domains, and health readiness.

### Security

- API credentials are sent only as bearer authorization headers and are
  redacted from transport errors.

## 1.2.8 — 2026-08-20

- Added `outbound-status` diagnostics for per-recipient delivery state, latest
  SMTP attempts, elapsed attempt age, and stale delivery detection.
- Added the `MAIL_OUTBOUND_STALE_DELIVERY_MS` configuration threshold for
  outbound delivery diagnostics.

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
