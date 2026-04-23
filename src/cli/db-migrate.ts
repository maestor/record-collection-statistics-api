import { runMigrations } from '../db/migrate.js';
import { loadRuntimeConfig } from '../lib/config.js';
import { openDatabase } from '../lib/database.js';

const config = loadRuntimeConfig();
const database = openDatabase({
  databasePath: config.databasePath,
  useRemoteDb: config.useRemoteDb,
  ...(config.tursoAuthToken ? { tursoAuthToken: config.tursoAuthToken } : {}),
  ...(config.tursoDatabaseUrl
    ? { tursoDatabaseUrl: config.tursoDatabaseUrl }
    : {}),
});

await runMigrations(database);

console.log(`Migrations applied to ${config.databasePath}`);
