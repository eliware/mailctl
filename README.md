# mailctl

Standalone command-line client for the Eliware Mail service.

The package is intentionally separate from the mail server so it can be
installed globally. It connects directly to MariaDB and RabbitMQ and reads
attachment objects from the configured shared storage path; it does not use
the web API or SMTP.

## Installation

```bash
npm install --global @eliware/mailctl
```

## Configuration

Copy `.env.example` to `.env` and set the direct MariaDB and RabbitMQ
connection URLs. `MAIL_STORAGE_PATH` must point to the shared attachment
volume. `.env` is local-only and must never be committed.

The CLI is designed for one-shot operator and AI-agent use. It never starts a
consumer, prompts for input, or connects to RabbitMQ for read/delete commands.
Add `--json` to every command for machine-readable output. Message bodies and
attachment metadata are stored in MariaDB; attachment bytes are read and
written under `MAIL_STORAGE_PATH`.

## Help and agent quick start

Help is the default when no command is supplied. Every command also has
focused usage, flags, safety notes, and an agent-oriented example:

```bash
mailctl
mailctl list --help
mailctl send --help
mailctl health --json
```

For a typical agent workflow, run `health --json`, discover IDs with
`list --json` or `sent --json`, use `read`/`sent-read` for complete records,
and use `send --json --idempotency KEY ...` followed by `sent --json` to verify
delivery state. Destructive operations require `--yes`; use `--dry-run` to
preview them safely.

## Commands

```text
mailctl list
mailctl headers MESSAGE_ID...
mailctl read MESSAGE_ID...
mailctl sent
mailctl sent-read OUTBOUND_ID...
mailctl search QUERY
mailctl thread MESSAGE_ID
mailctl retry OUTBOUND_ID... --yes
mailctl cancel OUTBOUND_ID... --yes
mailctl health
mailctl attachments MESSAGE_ID
mailctl save-attachments MESSAGE_ID DIRECTORY
mailctl send
mailctl delete MESSAGE_ID... --yes
mailctl domains
```

Text and HTML bodies can be supplied inline or from a file with `@path`.
Outbound attachments are SHA-256 hashed, gzip-compressed, deduplicated, and
queued through the durable `mail.outbound.submit` RabbitMQ queue. Destructive
commands require `--yes`. `--dry-run` previews send and delete operations
without changing MariaDB, RabbitMQ, or shared storage.

`sent` lists outbound messages with aggregate and per-recipient delivery
status. Use `--status queued`, `--status retryable`, `--status failed`, or
`--status sent` to find work needing attention. `sent-read` returns the full
outbound message, headers, body, attachments, delivery records, and SMTP
attempt history. These commands are read-only and are suitable for agent
monitoring and reconciliation.

`search` searches inbound and outbound headers and bodies. Results include a
MariaDB FULLTEXT relevance score and rank content matches ahead of fallback
sender, subject, recipient, and header matches. `thread` follows
stored message-reference headers. `retry` republishes retryable deliveries;
`cancel` prevents queued deliveries from being sent. Both require `--yes` or
support `--dry-run`. `health` returns component status and exits with code 2
when degraded. With `--json`, failures are emitted as one JSON object on
stderr with a stable `error` and `code` shape.

The local `.env` file supplies direct MariaDB, RabbitMQ, and storage
configuration and is intentionally ignored by Git.

## Development

```bash
npm ci
npm test
npm run lint
npm run pack
```

The `v*` tag workflow publishes the package to npm with provenance after
tests, lint, and package validation pass. Publishing requires the repository's
`NPM_TOKEN` secret.

## Security

The CLI connects directly to database, queue, and shared storage resources.
Keep credentials in environment files or secret injection, use `--json` only
when its output is safe for the receiving agent, and never include passwords or
credential-bearing URLs in command output or bug reports.
