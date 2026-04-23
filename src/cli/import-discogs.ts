import { runMigrations } from '../db/migrate.js';
import { DiscogsClient } from '../discogs/client.js';
import {
  DiscogsImporter,
  type DiscogsImportProgressEvent,
} from '../importer/discogs-importer.js';
import { loadDiscogsImportConfig } from '../lib/config.js';
import { openDatabase } from '../lib/database.js';
import { ImportRepository } from '../repositories/import-repository.js';

const config = loadDiscogsImportConfig();
const database = openDatabase({
  databasePath: config.databasePath,
  useRemoteDb: config.useRemoteDb,
  ...(config.tursoAuthToken ? { tursoAuthToken: config.tursoAuthToken } : {}),
  ...(config.tursoDatabaseUrl
    ? { tursoDatabaseUrl: config.tursoDatabaseUrl }
    : {}),
});
await runMigrations(database);

const fullRefresh = process.argv.includes('--full-refresh');
const quiet = process.argv.includes('--quiet');

function formatProgress(event: DiscogsImportProgressEvent): string | null {
  switch (event.type) {
    case 'run_started':
      return `Import run ${event.runId} started at ${event.startedAt}`;
    case 'collection_fields_loaded':
      return `Resolved Discogs user ${event.username} and loaded ${event.totalFields} collection fields`;
    case 'collection_page_synced':
      return `Collection sync page ${event.page}/${event.totalPages}: +${event.itemsOnPage} items (${event.collectionItemsSeen} seen total)`;
    case 'release_refresh_planned':
      return `Release enrichment: ${event.releaseCountToRefresh}/${event.releaseCountInCollection} releases need refresh`;
    case 'release_refresh_skipped':
      return 'Release enrichment skipped: all cached releases are still fresh';
    case 'release_refreshed': {
      const shouldLog =
        event.processed === 1 ||
        event.processed === event.totalToRefresh ||
        event.processed % 25 === 0;
      return shouldLog
        ? `Release enrichment ${event.processed}/${event.totalToRefresh} (latest release ${event.releaseId})`
        : null;
    }
    case 'run_completed':
      return `Import completed for ${event.username}: ${event.collectionItemsSeen} collection items across ${event.pagesProcessed} pages, ${event.releasesRefreshed} releases refreshed`;
    default:
      return null;
  }
}

const importer = new DiscogsImporter({
  client: new DiscogsClient({
    accessToken: config.discogsAccessToken,
    userAgent: config.discogsUserAgent,
    baseUrl: config.discogsBaseUrl,
    minIntervalMs: config.minIntervalMs,
  }),
  fullRefresh,
  ...(quiet
    ? {}
    : {
        onProgress: (event: DiscogsImportProgressEvent) => {
          const message = formatProgress(event);
          if (message) {
            console.error(`[discogs-import] ${message}`);
          }
        },
      }),
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
