# Integration testing

Unit and contract tests run by default and use mocked external dependencies.
Live integration tests are intentionally opt-in because they require access to
the same MariaDB, RabbitMQ, and attachment storage used by a mail deployment.

## Safe setup

1. Create a disposable database/schema and RabbitMQ vhost.
2. Set `MYSQL_URL`, `RABBITMQ_URL`, and `MAIL_STORAGE_PATH` in the shell or in
   `~/.config/mailctl/.env`.
3. Confirm that the credentials have only the permissions needed for the test
   schema and vhost.
4. Run the integration suite with `npm run test:integration`.

The suite must never be pointed at a live mailbox unless the operator has
explicitly accepted the risk. Tests should use reserved addresses such as
`agent@example.test` and remove any created rows and attachment objects during
cleanup.

## What to verify

- MariaDB connectivity and read queries.
- RabbitMQ connectivity and confirmation of an outbound publish.
- Attachment hashing, compression, deduplication, and cleanup in the shared
  storage path.
- `--dry-run` performs no writes.
- Failed database or queue operations return nonzero status without leaking
  credentials or credential-bearing URLs.

The integration suite is a scaffold for environment-specific smoke coverage;
the default CI workflow remains deterministic and does not require these
services.
