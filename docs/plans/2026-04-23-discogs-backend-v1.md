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
