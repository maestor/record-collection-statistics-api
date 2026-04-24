import type { Hono } from 'hono';
import type { AppOptions } from './http/app.js';
import type { RuntimeConfig } from './lib/config.js';
import type {
  DatabaseClient,
  DatabaseConnectionOptions,
} from './lib/database.js';

type RuntimeApp = Pick<Hono, 'fetch'>;

export interface RuntimeDependencies {
  buildDatabaseConnectionOptions: (
    config: RuntimeConfig,
  ) => DatabaseConnectionOptions;
  createApp: (database: DatabaseClient, options?: AppOptions) => RuntimeApp;
  loadRuntimeConfig: () => RuntimeConfig;
  openDatabase: (options: DatabaseConnectionOptions) => DatabaseClient;
  runMigrations: (database: DatabaseClient) => Promise<void>;
}

let appPromise: Promise<RuntimeApp> | undefined;

async function loadRuntimeDependencies(): Promise<RuntimeDependencies> {
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

  return {
    buildDatabaseConnectionOptions,
    createApp,
    loadRuntimeConfig,
    openDatabase,
    runMigrations,
  };
}

export async function createRuntimeApp(
  dependencies?: RuntimeDependencies,
): Promise<RuntimeApp> {
  const runtimeDependencies = dependencies ?? (await loadRuntimeDependencies());
  const config = runtimeDependencies.loadRuntimeConfig();
  const database = runtimeDependencies.openDatabase(
    runtimeDependencies.buildDatabaseConnectionOptions(config),
  );
  await runtimeDependencies.runMigrations(database);

  return runtimeDependencies.createApp(database, {
    ...(config.apiReadKey ? { apiReadKey: config.apiReadKey } : {}),
  });
}

export function getRuntimeApp(): Promise<RuntimeApp> {
  appPromise ??= createRuntimeApp();
  return appPromise;
}

export function createRequestHandler(
  resolveApp: () => Promise<RuntimeApp> = getRuntimeApp,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const app = await resolveApp();
    return app.fetch(request);
  };
}

export const handleRequest = createRequestHandler();
