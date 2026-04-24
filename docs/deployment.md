# Deployment

## Vercel
The API deployment entrypoints are `src/app.ts` and `src/index.ts`. Both default-export a request handler function. `package.json` also points `main` at `src/index.ts` so Vercel has an explicit server entrypoint.

Local development still uses `src/server.ts` through `npm run dev`.

### Environment Variables
Set these in Vercel:

- `DATABASE_PATH=var/discogs.sqlite`
- `USE_REMOTE_DB=true`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `API_READ_KEY`

Do not set `DISCOGS_ACCESS_TOKEN` in Vercel unless importer scripts are intentionally being run there. Discogs tokens are importer-only and are not required for request-time API reads.

### Rollout
1. Import the collection locally into SQLite.
2. Run `npm run db:copy-to-remote -- --force`.
3. Set `USE_REMOTE_DB=true` in Vercel.
4. Deploy.
5. Smoke-test `/health`, `/openapi.json`, and one filtered `/records` request with the configured API key.

## Turso Bootstrap
`npm run db:copy-to-remote -- --force` copies the current local SQLite cache into the configured Turso database. Use this when bootstrapping remote data without running a full Discogs import in the deployment environment.
