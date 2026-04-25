import { runMigrations } from '../db/migrate.js';
import {
  buildDatabaseConnectionOptions,
  describeDatabaseTarget,
  loadRuntimeConfig,
} from '../lib/config.js';
import { openDatabase } from '../lib/database.js';

const config = loadRuntimeConfig();
const database = openDatabase(buildDatabaseConnectionOptions(config));

await runMigrations(database);

console.log(`Migrations applied to ${describeDatabaseTarget(config)}`);
