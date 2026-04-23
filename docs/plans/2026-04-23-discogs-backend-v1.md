# Discogs Collection Backend v1

## Goal
Create a local-first Discogs collection backend that:

- imports the authenticated collection into SQLite
- exposes a read-only API for browsing and statistics
- keeps implementation lightweight, testable, and future-friendly for Vercel + Turso

## Scope
- Incremental importer with configurable release refresh TTL
- Plain SQL migrations and normalized query tables
- Read-only HTTP API with pagination, filtering, and cache headers
- Integration-focused tests and repository-level agent guidance

## Batch Breakdown

### Batch 1
- Scaffold the TypeScript project, docs, configs, and repository guidance.
- Add the baseline Node.js, TypeScript, Biome, and test tooling.

### Batch 2
- Implement SQLite migrations and the importer.
- Sync Discogs collection items, custom collection fields, and release details into the local cache.
- Add importer verification coverage.

### Batch 3
- Implement the core read-only API surface:
- `GET /health`
- `GET /records`
- `GET /records/:releaseId`
- `GET /stats/summary`
- `GET /stats/breakdowns/:dimension`
- `GET /records` supports:
- `q`
- `artist`
- `label`
- `genre`
- `style`
- `format`
- `country`
- `year_from`
- `year_to`
- `added_from`
- `added_to`
- `page`
- `page_size`
- `sort`
- `order`
- Allowed `sort` values for `GET /records`:
- `date_added`
- `release_year`
- `artist`
- `title`
- `lowest_price`
- Cap `page_size` at `100`.

### Batch 4
- Return response metadata for pagination and filters applied.
- Expose community and marketplace fields on record detail.
- Keep statistics focused on catalog and collection dimensions rather than valuation math.
- Extend API usability with discovery-oriented read endpoints such as filter catalogs where helpful.

### Batch 5
- Lock in caching and security defaults:
- Discogs is never called on the request path.
- SQLite remains the cache boundary.
- Add `ETag` plus `Cache-Control: private, max-age=60, stale-while-revalidate=300` to read endpoints.
- Keep `DISCOGS_ACCESS_TOKEN` importer-only so the API process does not require it.
- Validate all query params, reject unknown sort and dimension values, redact secrets from logs, and keep the API read-only.

### Batch 6
- Add lightweight API-key protection for non-local API access.
- Bypass auth checks on localhost so local development stays frictionless.
- Keep the mechanism simple enough for Vercel deployment without introducing a full auth system.

### Batch 7
- Add OpenAPI documentation for the API surface.
- Let consumer applications generate types on their own side when needed.

### Batch 8
- Add Turso support behind `USE_REMOTE_DB`.
- Use `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` when remote mode is enabled.
- Support one-time bootstrap of remote data from the current local SQLite database so a full Discogs re-import is optional.

### Batch 9
- Document the Vercel deployment steps and any required config.
- If code changes are needed for Vercel compatibility, implement them in this batch.

## Status
- Batch 1: completed
- Batch 2: completed
- Batch 3: completed
- Batch 4: completed
- Batch 5: completed
- Batch 6: completed
- Batch 7: completed
- Batch 8: completed
- Batch 9: completed

## Public Commands
- `npm run db:migrate`
- `npm run import:discogs`
- `npm run dev`
- `npm run test`
- `npm run verify`

## Notes
- Discogs custom folders are not modeled as a separate domain object in v1.
- Raw Discogs release payloads are retained for completeness alongside query tables.
- Mutation testing is intentionally deferred until the integration suite is stable.
