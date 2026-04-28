# Development

## Local Setup
Copy `.env.example` to `.env` and configure at least:

- `DISCOGS_ACCESS_TOKEN`
- `DISCOGS_USER_AGENT`
- `DATABASE_PATH`

The Discogs token is importer-only. Request-time API reads use SQLite or Turso-backed cached data and must not call Discogs directly.

Database target selection:

- `USE_REMOTE_DB=false` uses the local SQLite file at `DATABASE_PATH`
- `USE_REMOTE_DB=true` uses Turso via `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`

## Common Commands
- `npm run db:migrate` applies SQL migrations to the active database target.
- `npm run import:discogs` imports Discogs collection data into the configured database target.
- `npm run dev` starts the local read-only API through `src/server.ts`.
- `vercel dev` runs the same app through Vercel's local runtime when you want to test the deployment shape.
- `npm run test` runs the Node integration-style test suite.
- `npm run test:coverage` runs the test suite with strict `100%` line, function, and branch coverage gates.
- `npm run verify` runs `typecheck`, `lint`, and `test:coverage`.
- `npm run test:mutation` runs Stryker mutation testing for the backend files listed in [stryker.config.mjs](/Users/maestor/Projects/record-collection-statistics-api/stryker.config.mjs).

The importer prints the target database and progress to `stderr`, and keeps the final JSON summary on `stdout`.

## Verification Expectations
- Prefer `npm run verify` for the default backend quality gate after meaningful code changes.
- For new development work that falls within `npm run test:coverage` scope and needs tests, default to `$intelligence-testing` so behavior-first TDD and realistic integration coverage drive the implementation.
- Use `npm run test:mutation` selectively when backend branching, validation, SQL, importer behavior, or other mutation-sensitive logic changes.
- Mutation runs are incremental, capped to concurrency `4`, and expected to stay clean with `100%` score and `0` survived, `0` no-coverage, and `0` timed-out mutants.
- Keep tests behavior-focused and integration-first where practical so API, repository, and importer changes are exercised through real boundaries.

## Project-Local Agent Skills
This repository includes project-local skills under `.agents/skills/` to help Codex work in the style this backend expects.

- `$api-contract-sync`: Use when API response shapes, OpenAPI output, generated clients, or cross-repo consumers need to stay in sync.
- `$intelligence-testing`: Default for new development work that is covered by `npm run test:coverage` and requires tests, so implementation is driven by behavior-first TDD and realistic integration scenarios.
- `$local-first-verification`: Use when deciding the lightest honest local verification path before handoff or commit.
- `$mutation-testing`: Use when backend mutation testing is relevant enough to justify a Stryker run and follow-up mutant triage.

If these skills are installed locally but not yet committed, keep this document aligned with the skill names and intent so future contributors know which workflows already exist.
