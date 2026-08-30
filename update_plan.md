# mailctl REST API migration update plan

Goal: provide a focused REST API client for the mail service.

## Finalized mail API handoff

Authentication uses the static `MAIL_API_TOKEN` as a bearer token:

```http
Authorization: Bearer <MAIL_API_TOKEN>
```

The token grants the existing unlimited operator behavior. It is sent only in
the authorization header and must never appear in logs, command output, or
error text. Browser CSRF rules do not apply to bearer-authenticated requests.

The first implementation contract is:

- `GET /api/messages/:messageId/headers` returns
  `{ message_id, headers }`.
- `GET /api/search?q=<term>` returns `{ results }`; each result includes an
  identifier and `kind` (`inbound` or `outbound`) plus the available message
  summary fields.
- `GET /api/messages/:messageId/thread` returns `{ message_id, messages }`.
- `GET /api/sent/:outboundId/status` returns
  `{ outbound_id, status, deliveries, attempts }`.
- `POST /api/sent/:outboundId/retry` returns
  `{ outbound_id, status: "queued", action: "retry" }`.
- `POST /api/sent/:outboundId/cancel` returns
  `{ outbound_id, status: "canceled", action: "cancel" }`.
- `GET /api/attachments/:attachmentId` streams the original attachment bytes
  for both inbound and outbound messages, with the service-provided content
  type and filename.

All non-2xx responses are failures. The client should preserve any available
request/correlation identifier, use explicit timeouts, and avoid retrying
non-idempotent sends unless an idempotency key is provided. Additive response
fields are compatible; changes to field meaning or identifier types require a
coordinated update.

## Agent UX API dependency

The next mailctl UX migration depends on the Mail API providing these
authoritative behaviors before the corresponding client commands are enabled:

- Stable JSON envelopes and structured errors for every command/control
  endpoint; transport failures remain mailctl errors.
- Scoped inbox and sent listing responses with explicit direction, pagination,
  counts, and applied mailbox scope.
- Typed message reads covering headers, body, attachments, thread metadata,
  direction, and applicable outbound delivery data.
- One JSON `POST /api/send` contract for ordinary sends and replies. Replies
  include the source message ID and reply mode; the API derives reply fields by
  default and validates explicit recipient, subject, and threading overrides.
  Sender identity cannot be overridden.
- Consistent JSON responses for attachments, retry, cancel, status, delete,
  batch operations, domains, health, and service status. Attachment bytes are
  the intentional binary-response exception.
- Server-side mailbox-scope authorization and idempotency handling for
  non-idempotent operations.

Mailctl will remain responsible only for configuration discovery, bearer
authentication, JSON input transport, command routing, local attachment file
writes, response passthrough, and process exit codes. This is a contract
dependency for the UX migration, not a request to change the Mail API in this
repository.

## Implementation steps

1. **Complete.** Add `MAIL_API_URL` and `MAIL_API_TOKEN` configuration and document them in
   `.env.example` and the README.
2. **Complete.** Add a small built-in `fetch` HTTP client that sends the bearer token on
   every request and applies a bounded timeout.
3. **Complete.** Preserve the existing CLI commands and output formats where practical.
4. **Complete.** Convert list, headers, read, search, thread, sent, sent-read, outbound
   status, domains, health, and delete commands to API requests, using the
   finalized response shapes above for headers, search, threads, and status.
5. **Complete.** Convert retry and cancel commands to their API operations.
6. **Complete.** Convert send to `/api/send` and multipart send to `/api/send-multipart`.
7. **Complete.** Convert attachment listing and save commands to API metadata/download
   operations. Download both inbound and outbound attachments through
   `GET /api/attachments/:attachmentId`, writing streamed bytes to the
   requested local directory.
8. **Complete.** Remove all direct-service code, migration code, fallback routing, and
   direct-service dependencies.
10. **Complete.** Update help text, errors, configuration validation, and documentation for
    API mode.
11. **Mocked tests complete; dev integration pending.** Add mocked API contract tests and a dev integration test covering reads,
    sends, attachments, deletion, retry/cancel, domains, and status.

## Verification

Local verification is complete: tests, 100×4 coverage, lint, package dry-run,
syntax checks, audit, and diff check pass. Live verification requires a
disposable mail-service API endpoint. Verify message reads, attachment
downloads, multipart sends, outbound status, and destructive commands.
Confirm tokens are never printed, logged, or included in error output.
