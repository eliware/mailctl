# mailctl

Standalone command-line client for the Eliware Mail service.

The package is intentionally separate from the mail server so it can be
installed globally. Normal commands are being migrated to the mail REST API;
database migrations remain a deliberate direct MariaDB operation during the
transition.

## Installation

```bash
npm install --global @eliware/mailctl
```

## Configuration

Create `~/.config/mailctl/.env` and set `MAIL_API_URL` and `MAIL_API_TOKEN` for
API mode. Keep the token in local configuration or runtime secret injection;
never commit or print it. Direct MariaDB, RabbitMQ, and shared-storage values
remain available for migration and transition workflows. Existing environment
variables take precedence over values in that file. The configuration file is
local-only and must never be committed.

Configuration contract:

| Variable            | Required                          | Default | Format and effect                                                                    | Sensitive                   |
| ------------------- | --------------------------------- | ------- | ------------------------------------------------------------------------------------ | --------------------------- |
| `MAIL_API_URL`      | For API mode                      | None    | HTTPS base URL for the mail REST API                                                 | No                         |
| `MAIL_API_TOKEN`    | For API mode                      | None    | Bearer token for the operator API                                                 | Yes                        |
| `MYSQL_URL`         | For database commands             | None    | `mysql://USER:PASSWORD@HOST/DATABASE`; selects the MariaDB endpoint and schema       | Yes                         |
| `RABBITMQ_URL`      | For `send`, `retry`, and `cancel` | None    | `amqp://USER:PASSWORD@HOST/VHOST`; selects the RabbitMQ vhost used for outbound work | Yes                         |
| `MAIL_STORAGE_PATH` | For attachment commands           | None    | Absolute readable/writable directory containing hashed attachment objects            | No, but deployment-specific |

The CLI validates configuration when a command opens the relevant dependency.
Values may be supplied by the process environment or the per-user dotenv file;
process environment values take precedence. Never print these URLs or commit
them.

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
mailctl delete MESSAGE_ID_OR_OUTBOUND_ID... --yes
mailctl migrate --yes
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

`delete` soft-deletes inbound or outbound messages by setting `deleted_at`;
it never removes message records or relational data. Deleted messages are
excluded from listing, reading, searching, threading, attachment export,
retry, and cancellation commands.

`migrate` is the schema authority for the mail service. It applies eligible
semver-prefixed ESM migrations while holding a MariaDB advisory lock. Run it
deliberately with `--yes` or `MIGRATE_CONFIRM=apply`; it never runs as a side
effect of another command.

Use `mailctl outbound-status OUTBOUND_ID --json` to inspect each recipient's
delivery state, latest recorded SMTP attempt, elapsed attempt age, and whether
the delivery is stale. This read-only diagnostic uses the
`MAIL_OUTBOUND_STALE_DELIVERY_MS` threshold, five minutes by default.

`search` searches inbound and outbound headers and bodies. Results include a
MariaDB FULLTEXT relevance score and rank content matches ahead of fallback
sender, subject, recipient, and header matches. `thread` follows
stored message-reference headers. `retry` republishes retryable deliveries;
`cancel` prevents queued deliveries from being sent. Both require `--yes` or
support `--dry-run`. `health` returns component status and exits with code 0
when the API reports `readiness.ready: true`; degraded, unready, or API
failures exit with code 1. With `--json`, failures are emitted as one JSON object on
stderr with a stable `error` and `code` shape.

The per-user `~/.config/mailctl/.env` file supplies API or direct-service
configuration and is intentionally outside the package. API mode requires
HTTPS in deployed environments; do not place bearer tokens in URLs or logs.

## Development

```bash
npm ci
npm test
npm run lint
npm run pack
```

Live service checks are deliberately separate from the default test command:

```bash
npm run test:integration
```

That command requires disposable MariaDB, RabbitMQ, and attachment-storage
resources configured as described in [`docs/integration-testing.md`](docs/integration-testing.md).
It is not run by CI unless explicitly enabled.

The `v*` tag workflow publishes the package to npm with provenance after
tests, lint, and package validation pass. Publishing requires the repository's
`NPM_TOKEN` secret.

## Security

The CLI connects directly to database, queue, and shared storage resources.
Keep credentials in environment files or secret injection, use `--json` only
when its output is safe for the receiving agent, and never include passwords or
credential-bearing URLs in command output or bug reports.
