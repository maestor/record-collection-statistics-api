import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database as DatabaseType } from 'better-sqlite3';
import { runMigrations } from '../src/db/migrate.js';
import type {
  DiscogsCollectionFieldsResponse,
  DiscogsCollectionReleasesPage,
  DiscogsIdentity,
  DiscogsReleaseDetail,
} from '../src/discogs/types.js';
import { DiscogsImporter } from '../src/importer/discogs-importer.js';
import { openDatabase } from '../src/lib/database.js';
import { ImportRepository } from '../src/repositories/import-repository.js';

export function readFixture<T>(name: string): T {
  const fixturePath = join(process.cwd(), 'test', 'fixtures', 'discogs', name);

  return JSON.parse(readFileSync(fixturePath, 'utf8')) as T;
}

export function createTempDatabase(): {
  cleanup: () => void;
  database: DatabaseType;
  databasePath: string;
} {
  const directory = mkdtempSync(join(tmpdir(), 'discogs-api-test-'));
  const databasePath = join(directory, 'test.sqlite');
  const database = openDatabase(databasePath);
  runMigrations(database);

  return {
    database,
    databasePath,
    cleanup: () => {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export function createFixtureClient(overrides?: {
  collectionPages?: DiscogsCollectionReleasesPage[];
  identity?: DiscogsIdentity;
  fields?: DiscogsCollectionFieldsResponse;
  releases?: Record<number, DiscogsReleaseDetail>;
}) {
  const identity =
    overrides?.identity ?? readFixture<DiscogsIdentity>('identity.json');
  const fields =
    overrides?.fields ??
    readFixture<DiscogsCollectionFieldsResponse>('collection-fields.json');
  const collectionPages = overrides?.collectionPages ?? [
    readFixture<DiscogsCollectionReleasesPage>('collection-page-1.json'),
    readFixture<DiscogsCollectionReleasesPage>('collection-page-2.json'),
  ];
  const releases = overrides?.releases ?? {
    101: readFixture<DiscogsReleaseDetail>('release-101.json'),
    202: readFixture<DiscogsReleaseDetail>('release-202.json'),
  };

  return {
    async getIdentity() {
      return identity;
    },
    async getCollectionFields() {
      return fields;
    },
    async getCollectionReleases(_username: string, page: number) {
      const response = collectionPages[page - 1];
      if (!response) {
        throw new Error(`Missing collection fixture page ${page}`);
      }

      return response;
    },
    async getRelease(releaseId: number) {
      const response = releases[releaseId];
      if (!response) {
        throw new Error(`Missing release fixture ${releaseId}`);
      }

      return response;
    },
  };
}

export async function seedFixtureImport(options?: { now?: () => Date }) {
  const tempDatabase = createTempDatabase();
  const repository = new ImportRepository(tempDatabase.database);

  const importer = new DiscogsImporter({
    client: createFixtureClient(),
    releaseTtlDays: 30,
    repository,
    ...(options?.now ? { now: options.now } : {}),
  });

  const summary = await importer.run();

  return {
    ...tempDatabase,
    summary,
    repository,
  };
}
