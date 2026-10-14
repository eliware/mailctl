# Release Notes

## Unreleased

### Added

- Added manual retry for uncertain recipient delivery after explicit confirmation.
- Added recipient delivery status and attempt details to outbound inspection.

## 12.0.0 — 2026-10-14

### Changed

- Updated dependencies and repository validation workflows.
- Aligned package metadata and documentation with current Eliware conventions.

### Fixed

- Split mail API commands into focused modules.

## 3.0.0 — 2026-10-07

### Added

- Added safe API attachment downloads and the local API contract test harness.
- Added user guides, examples, and indexed specifications.

### Changed

- Updated test tooling and package dependencies.

### Fixed

- Sanitized attachment file names and prevented accidental file overwrite.
- Removed partial attachment files after a failed download.

## 2.1.1 — 2026-08-30

### Fixed

- Added the caller's `MAIL_OWNER_ADDRESS` to send requests.
- Applied caller configuration before installation configuration.

## 2.1.0 — 2026-08-30

### Added

- Added JSON-native inbox, reply, reply-all, and forward commands.
- Added inline, standard input, and file input for JSON requests.
- Added owner-scoped mailbox commands and API contract tests.

### Changed

- Standardized command output and errors as JSON.
- Kept `--json` as a no-op because JSON output is always enabled.

## 2.0.0 — 2026-08-30

### Breaking changes

- Switched all mailctl commands to the authenticated Mail REST API.
- Removed direct database, RabbitMQ, shared storage, and migration access.

### Added

- Added API configuration through `MAIL_API_URL` and `MAIL_API_TOKEN`.
- Added API contract tests for reads, sends, attachments, and mailbox actions.

### Security

- Sent API credentials only in bearer authorization headers.
- Redacted credentials from transport errors.

## 1.2.8 — 2026-08-20

### Added

- Added `outbound-status` for recipient delivery state and SMTP attempt details.
- Added `MAIL_OUTBOUND_STALE_DELIVERY_MS` for stale delivery checks.

## 1.2.7 — 2026-08-19

### Added

- Added migrations for event outbox and message tracking data.

### Changed

- Added events for inbound and outbound soft deletes.

### Fixed

- Restored migration and deletion coverage to 100 percent.

## 1.2.5 — 2026-08-19

### Added

- Added versioned database migrations and the migration runner.
- Added the confirmed `mailctl migrate` command.
- Added outbound soft delete support.
