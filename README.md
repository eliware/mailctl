# [![eliware.org](https://eliware.org/logos/brand.png)](https://discord.gg/M6aTR9eTwN)

## @eliware/mailctl [![npm](https://img.shields.io/npm/v/@eliware/mailctl)](https://www.npmjs.com/package/@eliware/mailctl) [![License](https://img.shields.io/github/license/eliware/mailctl)](https://github.com/eliware/mailctl/blob/main/LICENSE) [![CI](https://github.com/eliware/mailctl/actions/workflows/ci.yaml/badge.svg)](https://github.com/eliware/mailctl/actions/workflows/ci.yaml)

Non-interactive mail service REST API CLI for humans and AI agents.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Setup](#setup)
- [Usage](#usage)
- [Development](#development)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Configuration](#configuration)
- [Operations](#operations)
- [Commands](#commands)
- [Exit codes](#exit-codes)
- [Support](#support)
- [Links](#links)
- [License](#license)

## Features

Mailctl uses the authenticated Mail REST API for every mail operation.
It emits JSON and does not prompt for input.
It supports inbox, message, attachment, search, send, reply, retry, and delete commands.
It requires confirmation for uncertain delivery retries and destructive requests.

## Requirements

Use Node.js 26 or later and npm 12 or later.
Use an account with access to the Mail REST API.

## Setup

Install the public package:

```text
npm install --global @eliware/mailctl
```

Set `MAIL_API_URL` and `MAIL_API_TOKEN` in mailctl's local configuration.
Set `MAIL_OWNER_ADDRESS` in the calling project's local configuration.
Use environment variables when a deployment supplies settings that way.

## Usage

Run help and version checks:

```text
mailctl --help
mailctl --version
```

Read messages and check service status:

```text
mailctl inbox
mailctl read MESSAGE_ID
mailctl sent
mailctl health
```

Send JSON requests through standard input, inline input, or `--input FILE`.
See the [usage guide](docs/usage.md) for command details.
See [examples](examples/README.md) for example files.
See [local documentation](docs/README.md) for all guides.
See [release notes](RELEASE_NOTES.md) for published changes.

## Development

Install locked dependencies and run validation:

```text
npm ci
npm test
npm run lint
npm run pack
```

Read [development and API requirements](specs/README.md).
Read [integration test instructions](docs/integration-testing.md) before live tests.

## Testing

`npm test` runs lint, format, audit, package, convention, and Jest checks.
The test suite requires 100 percent statement, branch, function, and line coverage.
Live tests need a disposable Mail service endpoint.

## Troubleshooting

Check `MAIL_API_URL`, `MAIL_API_TOKEN`, and `MAIL_OWNER_ADDRESS` when a request fails.
Run `mailctl health` to check API readiness.
Read the [troubleshooting guide](docs/troubleshooting.md) for common errors.

## Security

Keep API tokens in local configuration or secret injection.
Do not put tokens in URLs, logs, examples, or issue reports.
Mailctl sends requests only to the configured Mail API.

## Configuration

| Variable                          | Required         | Default | Purpose                                  |
| --------------------------------- | ---------------- | ------- | ---------------------------------------- |
| `MAIL_API_URL`                    | Yes              | None    | Base URL for the Mail REST API.          |
| `MAIL_API_TOKEN`                  | Yes              | None    | Bearer token for API access.             |
| `MAIL_OWNER_ADDRESS`              | Mailbox commands | None    | Mailbox scope for the caller.            |
| `MAIL_OUTBOUND_STALE_DELIVERY_MS` | No               | 300000  | Age threshold for stale delivery status. |

Environment values take precedence over local configuration files.
Missing owner scope fails closed.

## Operations

Mailctl makes no direct database, RabbitMQ, or file storage connections.
The Mail service owns message data and attachments.
The `vMAJOR.MINOR.PATCH` tag workflow validates and publishes the package to npm.
Publication requires the repository's npm provenance setup.
Publication does not deploy the Mail service.

## Commands

| Command                                                    | Purpose                                     |
| ---------------------------------------------------------- | ------------------------------------------- |
| `inbox`, `list`, `headers`, `read`                         | Read inbound messages.                      |
| `sent`, `sent-read`, `outbound-status`                     | Read outbound messages and delivery status. |
| `search`, `thread`, `domains`, `health`                    | Search or inspect service data.             |
| `attachments`, `save-attachments`, `save-sent-attachments` | Read and save attachments.                  |
| `send`, `reply`, `reply-all`, `forward`                    | Submit outbound messages.                   |
| `retry`, `retry-uncertain`, `cancel`                       | Manage outbound delivery.                   |
| `delete`                                                   | Soft-delete messages after confirmation.    |

`retry-uncertain` requires confirmation that the recipient may receive a duplicate.
`delete` requires explicit JSON confirmation or a dry-run request.
Every command emits one JSON result. Errors use one JSON object on stderr.

## Exit codes

Exit code 0 means the command succeeded.
Exit code 1 means the command or API request failed.
`mailctl --help` and `mailctl --version` return exit code 0.

## Support

For help, questions, or to chat with the author and community, visit:

[![Discord](https://eliware.org/logos/discord_96.png)](https://discord.gg/M6aTR9eTwN)[![eliware.org](https://eliware.org/logos/eliware_96.png)](https://discord.gg/M6aTR9eTwN)

**[eliware.org on Discord](https://discord.gg/M6aTR9eTwN)**

## Links

- [Home Page](https://eliware.org)
- [GitHub Org](https://github.com/eliware)
- [GitHub Repo](https://github.com/eliware/mailctl)
- [Bug Reports](https://github.com/eliware/mailctl/issues)
- [npm](https://www.npmjs.com/package/@eliware/mailctl)
- [Discord](https://discord.gg/M6aTR9eTwN)

## License

[MIT © Eliware](LICENSE)
