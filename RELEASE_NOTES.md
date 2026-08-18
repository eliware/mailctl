# Release notes

## Unreleased

- Refactored the CLI into independently testable source modules.
- Added per-user configuration loading from `~/.config/mailctl/.env`.
- Added baseline tests for every source module and improved coverage to about 50%.
- Added npm package metadata and a global `mailctl` executable entry.
- Added command-specific, agent-oriented help and `--version` support.
- Added CI validation on pushes to `main` and pull requests.
- Added npm publication with provenance for `v*` tags.
- Added safe `.env.example` configuration documentation.
