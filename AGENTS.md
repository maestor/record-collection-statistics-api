# Agent Instructions

## Principles
- Keep the API read-only unless the user explicitly asks for writes.
- Prefer strict TypeScript, integration-focused tests, and small dependency footprint.
- Discogs access tokens are importer-only; never require them for request-time API reads.
- Update docs when behavior, schema, or public interfaces change.
- Favor reachable, intentional code paths over defensive branches that can never fire in practice.

## Implementation Expectations
- Use plain SQL migrations and repository modules instead of an ORM.
- Keep Discogs client logic isolated from HTTP handlers.
- Treat SQLite as the cache boundary; request handlers must not call Discogs directly.
- Validate public query parameters and fail with clear `400` responses for invalid input.
- When tests already cover behavior through importer or API integration, avoid duplicate unit tests.

## Quality
- Run `npm run verify` after meaningful backend changes.
- Run `npm run test:mutation` for changes that materially affect validation, importer mapping, or other core logic covered by the mutation scope.
- Add integration fixtures for Discogs payload changes before changing importer mapping logic.
- Preserve backwards-compatible response shapes unless the user asks for a breaking change.
- Keep `npm run verify` fast for routine development, and use `npm run test:mutation` separately when you want the stronger mutation-testing signal.
- Keep README focused on project overview and user-facing basics. Put detailed deployment, development, and testing procedures under `docs/` and link to them from README when needed.
- Treat `docs/plans/` as local planning scratch space. Do not commit plan files by default; only commit them when the user explicitly asks for a plan to be preserved in the repository.

## Commit Strategy
- Commit in reasonable implementation batches instead of waiting until the very end.
- Prefer one coherent concern per commit, such as scaffold, importer, API, or tests.
- Prefix commit messages with the change type, for example `Feature:`, `Chore:`, `Fix:`, or `Refactor:`.
- Before creating a commit, make sure the batch is coherent and any available checks for that batch have been run.
