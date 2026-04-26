import { Hono } from 'hono';
import { runMigrations } from './db/migrate.js';
import { createApp } from './http/app.js';
import {
  buildDatabaseConnectionOptions,
  loadRuntimeConfig,
} from './lib/config.js';
import { openDatabase } from './lib/database.js';
import type { RuntimeApp, RuntimeDependencies } from './runtime-types.js';

export type { RuntimeApp, RuntimeDependencies } from './runtime-types.js';

let appPromise: Promise<RuntimeApp> | undefined;

const defaultRuntimeDependencies: RuntimeDependencies = {
  buildDatabaseConnectionOptions,
  createApp,
  loadRuntimeConfig,
  openDatabase,
  runMigrations,
};

export async function createRuntimeApp(
  dependencies?: RuntimeDependencies,
): Promise<RuntimeApp> {
  const runtimeDependencies = dependencies ?? defaultRuntimeDependencies;
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

export function createRuntimeDelegatingApp(
  resolveApp: () => Promise<RuntimeApp> = getRuntimeApp,
): Hono {
  const app = new Hono();

  app.all('*', async (context) => {
    const runtimeApp = await resolveApp();
    return runtimeApp.fetch(context.req.raw);
  });

  return app;
}

export const handleRequest = createRequestHandler();
export const vercelApp = createRuntimeDelegatingApp();
