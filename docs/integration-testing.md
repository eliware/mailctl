# Integration testing

Unit and contract tests run by default and use mocked external dependencies.
Live integration testing is intentionally external to this repository because
mailctl communicates only with the authenticated mail service API.

## Safe setup

1. Obtain a disposable mail-service test endpoint.
2. Set `MAIL_API_URL` and `MAIL_API_TOKEN` in mailctl’s project/install
   configuration and `MAIL_OWNER_ADDRESS` in the test caller’s `.env` or
   shell.
3. Confirm the token is scoped only to the test service.
4. Run the CLI contract and smoke commands against that endpoint.

The repeatable local-checkout harness is `npm run test:live`. It invokes the
repository entrypoint directly, creates one self-addressed message with a
small attachment, records PASS/BLOCKED results as JSON, and deletes only its
own test record during cleanup. It does not substitute for owner-provided
fixtures needed for inbound replies or queued retry/cancel behavior.

The suite must never be pointed at a live mailbox unless the operator has
explicitly accepted the risk. Tests should use reserved addresses such as
`agent@example.test` and remove any created rows and attachment objects during
cleanup.

## What to verify

- Authenticated API connectivity and read queries.
- Owner-scoped inbox and sent queries, including missing-scope failure.
- Outbound send, retry, cancel, and status behavior.
- Attachment upload, download, and cleanup through the API.
- `--dry-run` performs no writes.
- JSON command responses and errors are stable and machine-parseable.
- Failed API operations return nonzero status without leaking credentials or
  credential-bearing URLs.

The integration suite is a scaffold for environment-specific smoke coverage;
the default CI workflow remains deterministic and does not require these
services.
