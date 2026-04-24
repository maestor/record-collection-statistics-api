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
- libSQL client with local SQLite files today and Turso later

## Commands
- `npm run db:migrate` applies SQL migrations to the active database target
- `npm run db:copy-to-remote -- --force` copies the current local SQLite data into Turso as a one-time bootstrap
- `npm run import:discogs` syncs the Discogs collection and refreshes stale release details
- The importer prints progress to `stderr` during long runs and keeps the final JSON summary on `stdout`
- `npm run dev` starts the local read-only API
- `vercel dev` runs the same app through Vercel's local runtime when you want to test the deployment shape
- `npm run test` runs integration-style tests
- `npm run verify` runs typecheck, lint, and tests
- `npm run test:mutation` runs scoped mutation testing for core validation and importer logic

## Environment
Copy `.env.example` into `.env` and set at least:

- `DISCOGS_ACCESS_TOKEN`
- `DISCOGS_USER_AGENT`
- `DATABASE_PATH`

The API itself does not require the Discogs token. Only the importer does.

Database target selection:

- `USE_REMOTE_DB=false` uses the local SQLite file at `DATABASE_PATH`
- `USE_REMOTE_DB=true` uses Turso via `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`

For non-local API access, set:

- `API_READ_KEY`

Localhost requests bypass API-key checks. Non-local requests must send either `x-api-key` or `Authorization: Bearer <key>`.
The dedicated `db:copy-to-remote` command always copies from the local SQLite file to Turso and does not require `USE_REMOTE_DB=true`.

## API Overview
- `GET /health`
- `GET /openapi.json`
- `GET /filters`
- `GET /records`
- `GET /records/:releaseId`
- `GET /stats/summary`
- `GET /stats/breakdowns/:dimension`

The API returns cache headers and ETags for read responses. Validation errors return `400`.
When `API_READ_KEY` is configured, non-local requests require an API key and return `401` if it is missing or invalid.
The OpenAPI document is exposed at `GET /openapi.json` for consumers that want to generate client types or SDKs on their own side.

## Import Strategy
- Sync collection rows from Discogs folder `0` in pages of `100`
- Upsert collection-specific fields and custom field values
- Enrich only new or stale release details by default
- Respect Discogs rate limits with request throttling and retry handling
- Avoid deleting collection rows until a full sync succeeds

## Quality
- Tests focus on importer and API behavior rather than duplicating the same logic in isolated unit tests.
- Mutation testing is now wired through Stryker as a deeper quality signal, and it is intentionally kept out of the default `verify` path so routine local checks stay fast.
- The initial mutation scope targets `src/http/validation.ts`, `src/importer/mappers.ts`, and `src/db/copy.ts`.

## Future Direction
- Keep repository and SQL boundaries small enough to support local SQLite and remote Turso through the same repository API.
- Keep handlers stateless so deployment to Vercel is straightforward when the project is ready.

## Vercel Deployment
This repo uses Vercel-friendly `src/app.ts` and `src/index.ts` entries that default-export a request handler function, while local development uses `src/server.ts`.

Based on the current official Hono and Vercel docs:

- Hono's Vercel guide says a Vercel deployment can use a default export from `index.ts` or `src/index.ts`.
- Vercel's Node.js runtime docs say `src` entry points must default-export a function.
- Vercel's Node.js runtime docs say TypeScript functions are supported and Node.js `24.x` is currently available.

What to do when you deploy:

1. Create a Vercel project from this repository.
2. Set these environment variables in Vercel:
- `DATABASE_PATH=var/discogs.sqlite`
- `USE_REMOTE_DB=true`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `API_READ_KEY`
3. Do not set `DISCOGS_ACCESS_TOKEN` unless you intentionally want importer scripts available in that environment.
4. Make sure the project uses Node.js `24.x`. This repo already declares `>=24.0.0`, and Vercel currently supports `24.x`.
5. Deploy, then verify `/health`, `/openapi.json`, and one filtered `/records` request.

Suggested rollout order:

1. Import locally into SQLite.
2. Run `npm run db:copy-to-remote -- --force`.
3. Switch `USE_REMOTE_DB=true` in Vercel.
4. Deploy and smoke-test the read API.

Sources:
- https://hono.dev/docs/getting-started/vercel
- https://vercel.com/docs/functions/runtimes/node-js
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
