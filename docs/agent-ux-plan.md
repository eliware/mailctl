# mailctl Agent UX Plan

## Goal

Replace the current `mailctl` interface with a consistent, JSON-native
interface optimized for AI coding agents. Preserve all existing capabilities,
but do not preserve legacy command forms, flags, output formats, fallback
behavior, or backwards-compatible invocation. `--json` is the sole exception:
it may be accepted as a harmless no-op and never selects a separate mode.

`mailctl` should remain a thin client of the authenticated Mail API. The API
owns mail semantics and response contracts; `mailctl` owns configuration,
command routing, JSON input transport, local attachment writes, and process
exit codes.

## Command surface

The primary commands are:

```text
mailctl inbox
mailctl sent
mailctl read <id>...
mailctl send
mailctl reply <id>
mailctl reply-all <id>
mailctl forward <id>
```

Every command emits exactly one JSON document on success. Every failure emits
one structured JSON error on stderr and exits nonzero.

### `mailctl inbox`

Returns inbound message headers for the authenticated mailbox. It supports
query parameters for pagination, filtering, unread state, and limits. The
response identifies the applied mailbox scope and direction.

### `mailctl sent`

Returns outbound message headers for the authenticated mailbox. It is distinct
from `inbox`; a locally delivered copy of an outbound message must not be
presented as an inbound message.

### `mailctl read <id>...`

Reads one or more messages by ID. The API returns typed message records with
direction, headers, body, attachments, thread metadata, and applicable
delivery information.

### `mailctl send`

Reads one JSON object from stdin or `--input FILE` and sends a new message:

```json
{
  "to": ["recipient@example.test"],
  "cc": [],
  "bcc": [],
  "subject": "Update",
  "body": "The work is complete.",
  "html": null,
  "attachments": [],
  "idempotencyKey": "optional-key"
}
```

The sender is derived from authenticated mailbox scope. Arbitrary `from`
values are rejected.

### `mailctl reply <id>` and `mailctl reply-all <id>`

Read a JSON object from stdin or `--input FILE`. The normal input contains
message content only:

```json
{
  "body": "Thanks, I am taking care of this."
}
```

The minimal owner-agent calls must be directly supported:

```text
mailctl reply <id> '{"body":"thanks"}'
mailctl reply-all <id> '{"body":"thanks"}'
```

The CLI accepts the inline JSON object or an equivalent stdin/input-file
document. The API expands this minimal request using the source message and
the selected command’s reply mode.

The API derives recipients, subject, and threading headers from the source
message. Mailctl supplies `from`, derived from `MAIL_OWNER_ADDRESS`; callers
cannot choose a different sender. JSON may explicitly override recipients,
subject, and threading fields when needed. Additional content fields may be
supplied through JSON:

```json
{
  "body": "Updated message",
  "html": null,
  "attachments": [],
  "idempotencyKey": "optional-key"
}
```

The API receives the source message ID, reply mode, and mailctl-derived `from`.
It validates requested recipient, subject, and threading overrides and remains
responsible for subject normalization, `In-Reply-To`, `References`, and thread
association. The effective request contract is:

```json
{
  "replyToMessageId": "id",
  "replyMode": "reply-all",
  "from": "owner@example.test",
  "body": "Thanks",
  "html": null,
  "attachments": [],
  "idempotencyKey": "optional-key"
}
```

For the minimal CLI form, mailctl supplies `replyToMessageId`, `replyMode`,
and `from`; the owner only supplies `body`. Thus
`mailctl reply <id> {"body":"thanks"}` remains valid while the API receives
the expanded request. Reply JSON may override API-derived recipients, subject,
and threading fields, but cannot override `from`.

### `mailctl forward <id>`

Forwarding uses the same minimal JSON input and sender rule:

```text
mailctl forward <id> '{"body":"FYI"}'
```

Mailctl injects `from` from `MAIL_OWNER_ADDRESS` and sends the source message
ID, forward mode, content, and any approved recipients to the API. The API
owns validation, forwarded-message formatting, attachment association, and
delivery semantics.

### JSON input modes

Mutating commands accept exactly one of these equivalent input forms:

```text
mailctl reply <id> '{"body":"thanks"}'
```

```powershell
'{"body":"thanks"}' | mailctl reply <id>
```

```text
mailctl reply <id> --input request.json
```

Inline JSON is intended for short requests, piped stdin for generated or
multiline requests, and `--input FILE` for larger documents. Supplying more
than one input source is an error. Each form produces the same API request.

### Attachments

For sending, JSON identifies attachment file paths or attachment descriptors;
mailctl validates and streams local files through the Mail API’s multipart
send route. Attachment contents are not embedded in command-line JSON by
default. Mail owns attachment identity, storage, content type, size, checksum,
and delivery.

For receiving, the API returns attachment metadata with the message. Mailctl
requests attachment bytes through the attachment download route and writes
them to caller-selected local paths without overwriting unexpectedly. Binary
downloads are the intentional non-JSON API exception.

## Configuration and mailbox scope

`MAIL_API_URL` and `MAIL_API_TOKEN` are loaded from the mailctl project or
installation `.env`. Explicit process environment values take precedence.

`MAIL_OWNER_ADDRESS` is loaded by mailctl from the caller’s project or
current-working-directory `.env`. An explicit process environment value takes
precedence. Mailctl injects this address into API query parameters or request
fields so owners do not need to repeat it on every command. The Mail service
does not read this environment variable; it receives the value only in the
authenticated request. The address identifies the mailbox the caller intends
to use, but is not itself authorization.

The token is the shared authenticated mailctl application bearer token.
`MAIL_OWNER_ADDRESS` is a convenience filter/assertion supplied by mailctl,
not a separate credential or server-side environment variable. Mailctl must
fail closed when it is missing and must never silently widen a request to all
mail. The Mail API authenticates the shared token and applies the supplied
mailbox filter as part of the request contract.

Missing or empty `MAIL_OWNER_ADDRESS` produces a structured actionable error
before any mailbox request or mutation is attempted. The Mail service must not
depend on that environment variable being present in its own process.

Configuration discovery must work from any current working directory without
manual `--env-file` handling.

## API direction

The Mail API should provide the semantics needed for a thin client:

- stable JSON response and error envelopes;
- first-class inbox and sent routes with explicit direction and scope;
- unified typed message reads;
- JSON-native send and reply requests;
- API-owned recipient and threading behavior;
- consistent attachment metadata and downloads;
- normalized retry, cancel, status, delete, and batch responses;
- mailbox filtering on every mailbox read and mutation;
- idempotency handling for non-idempotent operations;
- request or correlation IDs without secret leakage.

The preferred send/reply contract is one `POST /api/send` endpoint. A reply
includes the source message ID and reply mode; ordinary sends omit them. The
API returns a stable result identifying the queued outbound message, status,
and any request ID.

Binary attachment downloads remain byte streams with HTTP metadata. All other
command and API responses are JSON.

## Capabilities to preserve

The UX replacement must retain all current supported functionality, including:

- inbox and sent mail;
- message headers, reads, and threads;
- send, reply, reply-all, and forward;
- attachments and attachment downloads;
- retry, cancel, status, and outbound inspection;
- delete and batch operations;
- domains;
- health and service status;
- structured API errors and nonzero exit codes.

Capabilities may be reorganized under the new command and JSON contract, but
none are removed or silently replaced with a fallback.

## Input and output rules

- JSON is the only supported command output format.
- Mutating commands read exactly one JSON object from stdin or `--input FILE`.
- Read-only commands use explicit query arguments and return JSON.
- Unknown, ambiguous, malformed, or unauthorized fields fail before mutation.
- `--json` may be accepted as a harmless no-op for agent familiarity. It must
  never select a separate mode or change behavior; JSON output is unconditional
  whether the flag is present or omitted.
- Help and errors follow the structured JSON contract.
- Message bodies, tokens, private keys, and unrelated mailbox data never appear
  in errors.

## Safety and reliability

- The API applies the mailbox value supplied in every mailbox request.
- Mailctl fails closed when `MAIL_OWNER_ADDRESS` is missing.
- Sends and replies support idempotency keys.
- Automatic retries are allowed only for safe reads or explicitly idempotent
  mutations.
- Delete requires explicit confirmation in the JSON request and supports a
  dry-run mode.
- HTTP timeouts are bounded and transport, validation, authentication, and
  server failures have distinct stable error codes.
- Attachment writes remain local `mailctl` behavior and must not overwrite
  files unexpectedly.

## Implementation order

1. Finalize the JSON response and error envelopes.
2. Implement project-install and caller-CWD `.env` discovery, precedence, and
   fail-closed missing-address behavior.
3. Add or normalize scoped inbox and sent API routes.
4. Normalize unified message, header, thread, and attachment contracts.
5. Implement JSON-native send through the API.
6. Implement reply, reply-all, and forward through the unified send contract
   with mailctl-derived `from` and API-owned recipients, formatting, and
   threading.
7. Normalize retry, cancel, status, delete, batch, domains, health, and other
   existing operations under the same JSON contract.
8. Reduce `mailctl` to configuration, transport, input validation, routing,
   response passthrough, exit codes, and local attachment operations.
9. Update tests, help, README, integration documentation, and release notes.
10. Remove all old command forms, flags, output modes, and fallback behavior,
    except for the accepted `--json` no-op.

## Acceptance criteria

- `mailctl inbox` and `mailctl sent` return correctly scoped JSON headers.
- Missing or invalid `MAIL_OWNER_ADDRESS` fails clearly without widening scope.
- `read` handles one or multiple message IDs.
- `send` accepts a JSON document without shell quoting message bodies.
- `reply` and `reply-all` require only a body for the common case.
- `forward` requires only a body for the common case and mailctl injects
  `from` from `MAIL_OWNER_ADDRESS`.
- Reply recipients and threading are correct and API-owned.
- All existing capabilities remain available through the new interface.
- Invalid input causes no API mutation.
- Duplicate non-idempotent requests are prevented or detectable.
- The interface works from any directory through the normal launcher.
- No legacy invocation, fallback, or backwards-compatible behavior remains
  after migration.
