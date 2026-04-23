import { runMigrations } from '../db/migrate.js';
import { loadRuntimeConfig } from '../lib/config.js';
import { openDatabase } from '../lib/database.js';

const config = loadRuntimeConfig();
const database = openDatabase(config.databasePath);

runMigrations(database);

console.log(`Migrations applied to ${config.databasePath}`);
