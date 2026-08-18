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

The CLI is designed for one-shot operator and AI-agent use. It never starts a
consumer, prompts for input, or connects to RabbitMQ for read/delete commands.
Add `--json` to every command for machine-readable output. Message bodies and
attachment metadata are stored in MariaDB; attachment bytes are read and
written under `MAIL_STORAGE_PATH`.

## Commands

```text
mailctl list
mailctl headers MESSAGE_ID...
mailctl read MESSAGE_ID...
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

The local `.env` file supplies direct MariaDB, RabbitMQ, and storage
configuration and is intentionally ignored by Git.
