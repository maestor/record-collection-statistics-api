# Record Collection Statistics API

Read-only backend for importing a Discogs collection into SQLite/libSQL and serving cached browsing and statistics endpoints.

Production API: https://record-collection-statistics-api.vercel.app/
React Native app: https://github.com/maestor/record-collection-statistics-expo-app

## What This Project Does
- Imports an authenticated Discogs collection into a lightweight relational database.
- Keeps release details cached in SQLite/libSQL so request-time API reads never depend on Discogs.
- Exposes browse, random-pick, filter, and statistics endpoints for client apps.
- Runs locally with SQLite and is deployed to Vercel with Turso in production.

## Principles
- Simple to run locally
- Read-only API
- SQLite/libSQL as the cache boundary
- Minimal third-party dependencies
- Strict TypeScript
- Integration-first testing
- Security-conscious handling of secrets and input validation

## Runtime
- Node.js 24+
- TypeScript
- Hono HTTP app
- libSQL client for local SQLite files and Turso

## Commands
- `npm run db:migrate` applies SQL migrations to the active database target
- `npm run import:discogs` syncs the Discogs collection and refreshes stale release details
- `npm run dev` starts the local read-only API
- `npm run verify` runs the default backend quality gate

## Docs
- [docs/development.md](docs/development.md) for local setup, command references, and verification guidance
- [docs/deployment.md](docs/deployment.md) for Vercel and Turso deployment details

## Environment
Copy `.env.example` into `.env`.

For local importer and API work, set:

- `DISCOGS_ACCESS_TOKEN`
- `DISCOGS_USER_AGENT`
- `DATABASE_PATH`

For Turso-backed runs, also set:

- `USE_REMOTE_DB=true`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

For non-local API access protection, set:

- `API_READ_KEY`

The Discogs token is importer-only. Request-time API reads use cached database data only.

Database target selection:

- `USE_REMOTE_DB=false` uses the local SQLite file at `DATABASE_PATH`
- `USE_REMOTE_DB=true` uses Turso via `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`

Localhost requests bypass API-key checks. Non-local requests must send either `x-api-key` or `Authorization: Bearer <key>` when `API_READ_KEY` is configured.

## Deployment
The production API is deployed on Vercel at https://record-collection-statistics-api.vercel.app/ and reads from Turso with `USE_REMOTE_DB=true`.

Useful production endpoints:

- `GET /health`
- `GET /openapi.json`

See [docs/deployment.md](docs/deployment.md) for rollout steps and deployment environment details.

## API Overview
- `GET /health`
- `GET /openapi.json`
- `GET /filters`
- `GET /records`
- `GET /records/random`
- `GET /records/:releaseId`
- `GET /stats/summary`
- `GET /stats/breakdowns/:dimension`

The API returns cache headers and ETags for read responses unless noted otherwise. Validation errors return `400`.
`GET /records/random` returns the same detailed payload shape as `GET /records/:releaseId`, but for one random cached release. It is intentionally served with `Cache-Control: no-store` and no ETag so each request can return a fresh random pick. If the cache is empty, it returns `404`.
`GET /records/random` accepts the same browse filters as `GET /records`, excluding pagination and sorting, so clients can request a random pick from a subset such as `/records/random?genre=Jazz&year_from=1970&year_to=1979`. If no cached release matches the filters, it returns `404`.
`GET /filters` accepts optional `dimensions=artist,format,genre` style narrowing and returns empty arrays for omitted dimensions so the response shape stays stable. Stats and filter breakdown payloads intentionally omit placeholder values like `artist = "Various"` and `release_year = 0`, while `GET /records` still returns those releases for browsing.
When `API_READ_KEY` is configured, non-local requests require an API key and return `401` if it is missing or invalid.
The OpenAPI document is exposed at `GET /openapi.json` for consumers that want to generate client types or SDKs on their own side.
`GET /stats/summary` includes collection totals, numeric collection value fields, and first/last added timestamps from the latest successful cached import. The `uniqueArtists` total excludes the placeholder artist name `Various`.

## Import Strategy
- Sync collection rows from Discogs folder `0` in pages of `100`
- Upsert collection-specific fields and custom field values
- Enrich only new or stale release details by default
- Respect Discogs rate limits with request throttling and retry handling
- Avoid deleting collection rows until a full sync succeeds
