import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import {
  buildDatabaseConnectionOptions,
  loadRuntimeConfig,
} from './lib/config.js';
import { openDatabase } from './lib/database.js';

const config = loadRuntimeConfig();
const database = openDatabase(buildDatabaseConnectionOptions(config));
await runMigrations(database);

const app = createApp(database, {
  ...(config.apiReadKey ? { apiReadKey: config.apiReadKey } : {}),
});

export default app;
