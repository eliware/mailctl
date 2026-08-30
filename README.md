# mailctl

Standalone command-line client for the Eliware Mail service.

The package is intentionally separate from the mail server so it can be
installed globally. All commands use the authenticated mail REST API.

## Installation

```bash
npm install --global @eliware/mailctl
```

## Configuration

Configure mailctl’s project or installation `.env` with `MAIL_API_URL` and
`MAIL_API_TOKEN`. Configure the invoking project’s `.env` with
`MAIL_OWNER_ADDRESS`.
Keep the token in local configuration or runtime secret injection;
never commit or print it. Existing environment
variables take precedence over values in that file. The configuration file is
local-only and must never be committed.

Configuration contract:

| Variable            | Required                          | Default | Format and effect                                                                    | Sensitive                   |
| ------------------- | --------------------------------- | ------- | ------------------------------------------------------------------------------------ | --------------------------- |
| `MAIL_API_URL`      | Required                          | None    | HTTPS base URL for the mail REST API                                                 | No                         |
| `MAIL_API_TOKEN`    | Required                          | None    | Bearer token for the operator API                                                   | Yes                        |
| `MAIL_OWNER_ADDRESS` | Required for mailbox commands   | None    | Caller mailbox scope assertion                                                      | No                         |

The CLI loads API settings from its installation/project configuration and the
owner address from the caller’s current-working-directory configuration.
Process environment values take precedence. Missing owner scope fails closed.
Never print credentials or commit private configuration.

The CLI is designed for one-shot operator and AI-agent use. It never starts a
consumer or prompts for input.
Every command emits JSON. `--json` is accepted as a harmless no-op. Message
bodies and attachment bytes are transferred through the mail service API.

## Help and agent quick start

Help is the default when no command is supplied. Every command also has
focused usage, flags, safety notes, and an agent-oriented example:

```bash
mailctl
mailctl inbox --help
mailctl send --help
mailctl health
```

For a typical agent workflow, run `mailctl inbox`, use `mailctl read ID`, and
send JSON requests through stdin, inline input, or `--input FILE`. Destructive
requests require explicit JSON confirmation; use the JSON dry-run field to
preview them safely.

## Commands

```text
mailctl list
mailctl inbox
mailctl headers MESSAGE_ID...
mailctl read MESSAGE_ID...
mailctl sent
mailctl sent-read OUTBOUND_ID...
mailctl search QUERY
mailctl thread MESSAGE_ID
mailctl retry
mailctl cancel
mailctl health
mailctl attachments MESSAGE_ID
mailctl save-attachments MESSAGE_ID DIRECTORY
mailctl send
mailctl reply MESSAGE_ID
mailctl reply-all MESSAGE_ID
mailctl delete
mailctl domains
```

Send and reply commands accept one JSON object from inline input, stdin, or
`--input FILE`. Outbound attachments are uploaded through the mail service
API. Destructive commands require explicit JSON confirmation. JSON `dryRun`
previews supported operations without changing server state.

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

Use `mailctl outbound-status OUTBOUND_ID` to inspect each recipient's
delivery state, latest recorded SMTP attempt, elapsed attempt age, and whether
the delivery is stale. This read-only diagnostic uses the
`MAIL_OUTBOUND_STALE_DELIVERY_MS` threshold, five minutes by default.

`search` searches inbound and outbound headers and bodies. Results include a
service relevance and rank content matches ahead of
sender, subject, recipient, and header matches. `thread` follows
stored message-reference headers. `retry` republishes retryable deliveries;
`cancel` prevents queued deliveries from being sent. Both use JSON confirmation
or dry-run requests. `health` returns component status and exits with code 0
when the API reports `readiness.ready: true`; degraded, unready, or API
failures exit with code 1. Failures are emitted as one JSON object on stderr
with a stable `error` and `code` shape.

The mailctl installation/project `.env` supplies API configuration and is
intentionally outside source control. The invoking project `.env` supplies
`MAIL_OWNER_ADDRESS`. API mode requires
HTTPS in deployed environments; do not place bearer tokens in URLs or logs.

## Development

```bash
npm ci
npm test
npm run lint
npm run pack
```

Live testing requires a disposable mail-service endpoint as described in
[`docs/integration-testing.md`](docs/integration-testing.md).

The `v*` tag workflow publishes the package to npm with provenance after
tests, lint, and package validation pass. Publishing requires the repository's
`NPM_TOKEN` secret.

## Security

The CLI connects only to the configured mail service API.
Keep credentials in environment files or secret injection, use `--json` only
when its output is safe for the receiving agent, and never include passwords or
credential-bearing URLs in command output or bug reports.
