import type { Hono } from 'hono';

let appPromise: Promise<Hono> | undefined;

export async function createRuntimeApp(): Promise<Hono> {
  const [
    { runMigrations },
    { createApp },
    { buildDatabaseConnectionOptions, loadRuntimeConfig },
    { openDatabase },
  ] = await Promise.all([
    import('./db/migrate.js'),
    import('./http/app.js'),
    import('./lib/config.js'),
    import('./lib/database.js'),
  ]);
  const config = loadRuntimeConfig();
  const database = openDatabase(buildDatabaseConnectionOptions(config));
  await runMigrations(database);

  return createApp(database, {
    ...(config.apiReadKey ? { apiReadKey: config.apiReadKey } : {}),
  });
}

export function getRuntimeApp(): Promise<Hono> {
  appPromise ??= createRuntimeApp();
  return appPromise;
}

export async function handleRequest(request: Request): Promise<Response> {
  const app = await getRuntimeApp();
  return app.fetch(request);
}
