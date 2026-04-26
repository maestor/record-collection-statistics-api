import type { Hono } from 'hono';
import type { AppOptions } from './http/app.js';
import type { RuntimeConfig } from './lib/config.js';
import type {
  DatabaseClient,
  DatabaseConnectionOptions,
} from './lib/database.js';

export type RuntimeApp = Pick<Hono, 'fetch'>;

export interface RuntimeDependencies {
  buildDatabaseConnectionOptions: (
    config: RuntimeConfig,
  ) => DatabaseConnectionOptions;
  createApp: (database: DatabaseClient, options?: AppOptions) => RuntimeApp;
  loadRuntimeConfig: () => RuntimeConfig;
  openDatabase: (options: DatabaseConnectionOptions) => DatabaseClient;
  runMigrations: (database: DatabaseClient) => Promise<void>;
}
