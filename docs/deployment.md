# Deployment

## Vercel
The API deployment entrypoints are `src/app.ts` and `src/index.ts`. Both default-export a Hono app, which matches Vercel's zero-configuration Hono backend entrypoint shape. `package.json` also points `main` at `src/index.ts` so Vercel has an explicit server entrypoint.

Local development still uses `src/server.ts` through `npm run dev`.

### Environment Variables
Set these in Vercel:

- `USE_REMOTE_DB=true`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `API_READ_KEY`

Do not set `DISCOGS_ACCESS_TOKEN` in Vercel unless importer scripts are intentionally being run there. Discogs tokens are importer-only and are not required for request-time API reads.

### Rollout
1. In a local shell or CI job, set `USE_REMOTE_DB=true`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `DISCOGS_ACCESS_TOKEN`, and `DISCOGS_USER_AGENT`.
2. Run `npm run import:discogs` to populate Turso directly.
3. Set `USE_REMOTE_DB=true`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `API_READ_KEY` in Vercel.
4. Deploy.
5. Smoke-test `/health`, `/openapi.json`, and one filtered `/records` request with the configured API key.
