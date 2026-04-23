import { runMigrations } from '../db/migrate.js';
import { DiscogsClient } from '../discogs/client.js';
import { DiscogsImporter } from '../importer/discogs-importer.js';
import { loadDiscogsImportConfig } from '../lib/config.js';
import { openDatabase } from '../lib/database.js';
import { ImportRepository } from '../repositories/import-repository.js';

const config = loadDiscogsImportConfig();
const database = openDatabase(config.databasePath);
runMigrations(database);

const fullRefresh = process.argv.includes('--full-refresh');

const importer = new DiscogsImporter({
  client: new DiscogsClient({
    accessToken: config.discogsAccessToken,
    userAgent: config.discogsUserAgent,
    baseUrl: config.discogsBaseUrl,
    minIntervalMs: config.minIntervalMs,
  }),
  fullRefresh,
  releaseTtlDays: config.releaseTtlDays,
  repository: new ImportRepository(database),
});

const summary = await importer.run();

console.log(
  JSON.stringify(
    {
      ok: true,
      fullRefresh,
      ...summary,
    },
    null,
    2,
  ),
);
