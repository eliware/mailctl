# mailctl

Standalone command-line client for the Eliware Mail service.

The package is intentionally separate from the mail server so it can be
installed globally without pulling in server, SMTP, database, or RabbitMQ
dependencies.

## Installation

```bash
npm install --global @eliware/mailctl
```

The CLI is currently a scaffold. Authentication, reading, searching, and
sending commands will be implemented against the Mail HTTP API.
