# Working on `@eliware/mailctl`

## Purpose

`mailctl` is a non-interactive CLI for reading, searching, sending, and
managing mail through the authenticated mail service REST API.

## Repository rules

- Keep private domains, hosts, addresses, credentials, tokens, and filesystem
  locations out of source, tests, documentation, logs, and Git history.
- Use `example.test`, reserved documentation addresses, and safe placeholder
  paths in examples and tests.
- Keep `.env` and user configuration outside source control.
- Do not run destructive commands or connect to production services without
  explicit operator intent.
- Do not push, publish, tag, or deploy unless explicitly requested.

## Development

- Use Node.js 26+ and native ESM.
- Keep parsing, validation, API access, attachment downloads, and output
  formatting in separate focused modules.
- Preserve stable JSON output and nonzero exit codes for automation.
- Keep `--help` useful when invoked without arguments.
- Require confirmation for destructive operations and preserve `--dry-run`.
- Add or update tests for success, validation, failure, retry, cleanup, and
  boundary behavior.

Run the standard checks before committing:

```sh
npm test
npm run test:gaps
npm run lint
npm run pack
node --check mailctl.mjs
for file in src/*.mjs; do node --check "$file"; done
git diff --check
```

Live integration checks are opt-in. See `docs/integration-testing.md` and do
not run them against production accidentally.
- Do not over-engineer simple tasks.
- Do not guess when confused.
- Do not make random, pointless changes.
- Check your own work before saying you're done.
