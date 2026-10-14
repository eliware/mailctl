# AGENTS.md

## Project

Build the mailctl command-line client with Node.js 26 or later. Use native ESM.

## Scope and boundaries

Use the Mail REST API for all mail operations.
Do not access SQL, RabbitMQ, or shared file storage from this client.

## Layout

Keep implementation modules in `src/` and launchers in `bin/`.
Keep tests in `tests/`, examples in `examples/`, and docs in `docs/`.
Keep specifications in `specs/` and index each directory.

## Development

Give each source and test module one clear purpose.
Keep one matching test for each source module under `tests/`.
Use Node.js 26 and native ESM.

## Validation

Use Node.js 26 or later and npm 12 or later.
Run `npm test` for aggregate validation.
Run `npm run lint` for lint checks.
Run `npm run audit` for dependency checks.
Run `npm run format` to format files.
Run `npm run format:check` to check file format.
Run `npm run pack` before publication review.

## Security

Keep credentials, secret values, private data, and runtime state out of Git.
Do not print API tokens or credentials.

## Changes

Keep changes within this repository scope.
Use Eliware Operations for external changes.

## Application

The `mailctl` command runs `bin/mailctl.mjs`.
The client sends mail requests to the configured Mail REST API.
The client does not connect to SQL, RabbitMQ, or shared file storage.

## CLI

Use `mailctl --help` to read usage.
Use `mailctl --version` to read the package version.
With no arguments, show help.
Commands emit JSON. Errors go to stderr.
Destructive commands require explicit confirmation or a dry-run request.

## npm publication

The public package is `@eliware/mailctl`.
The package version is in `package.json`.
The package publishes with npm provenance.
Run `npm run pack` before publication review.
