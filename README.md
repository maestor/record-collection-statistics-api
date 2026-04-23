# Record Collection Statistics API

Local-first backend for importing a Discogs collection into SQLite and serving a read-only API for browsing records and collection statistics.

## What This Project Does
- Imports the authenticated Discogs collection into a lightweight relational database.
- Keeps release details cached locally so the API never depends on Discogs at request time.
- Exposes browse and statistics endpoints that are easy to extend later.
- Stays simple enough for local use today while keeping the code organized for a later move to Vercel and Turso.

## Principles
- Simple to run locally
- Read-only API
- SQLite as cache boundary
- Minimal third-party dependencies
- Strict TypeScript
- Integration-first testing
- Security-conscious handling of secrets and input validation

## Planned Runtime
- Node.js 24+
- TypeScript
- Hono HTTP app
- SQLite via `better-sqlite3`

## Commands
- `npm run db:migrate` applies SQL migrations to the local SQLite database
- `npm run import:discogs` syncs the Discogs collection and refreshes stale release details
- The importer prints progress to `stderr` during long runs and keeps the final JSON summary on `stdout`
- `npm run dev` starts the local read-only API
- `npm run test` runs integration-style tests
- `npm run verify` runs typecheck, lint, and tests

## Environment
Copy `.env.example` into `.env` and set at least:

- `DISCOGS_ACCESS_TOKEN`
- `DISCOGS_USER_AGENT`
- `DATABASE_PATH`

The API itself does not require the Discogs token. Only the importer does.

## API Overview
- `GET /health`
- `GET /records`
- `GET /records/:releaseId`
- `GET /stats/summary`
- `GET /stats/breakdowns/:dimension`

The API returns cache headers and ETags for read responses. Validation errors return `400`.

## Import Strategy
- Sync collection rows from Discogs folder `0` in pages of `100`
- Upsert collection-specific fields and custom field values
- Enrich only new or stale release details by default
- Respect Discogs rate limits with request throttling and retry handling
- Avoid deleting collection rows until a full sync succeeds

## Quality
- Tests focus on importer and API behavior rather than duplicating the same logic in isolated unit tests.
- Mutation testing is planned after the first integration suite stabilizes.

## Future Direction
- Keep repository and SQL boundaries small enough to support a later adapter for Turso/libSQL.
- Keep handlers stateless so deployment to Vercel is straightforward when the project is ready.
