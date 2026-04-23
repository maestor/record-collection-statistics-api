import assert from 'node:assert/strict';
import test from 'node:test';

import { DiscogsClient } from '../src/discogs/client.js';
import type {
  DiscogsCollectionReleasesPage,
  DiscogsReleaseDetail,
} from '../src/discogs/types.js';
import { DiscogsImporter } from '../src/importer/discogs-importer.js';
import { ImportRepository } from '../src/repositories/import-repository.js';
import {
  createFixtureClient,
  createTempDatabase,
  readFixture,
} from './helpers.js';

test('DiscogsImporter imports fixture data and is idempotent for fresh releases', async () => {
  const { database, cleanup } = createTempDatabase();

  try {
    const repository = new ImportRepository(database);
    const importer = new DiscogsImporter({
      client: createFixtureClient(),
      now: () => new Date('2026-04-23T10:00:00.000Z'),
      releaseTtlDays: 30,
      repository,
    });

    const firstRun = await importer.run();
    assert.equal(firstRun.collectionItemsSeen, 3);
    assert.equal(firstRun.pagesProcessed, 2);
    assert.equal(firstRun.releasesRefreshed, 2);

    const countsAfterFirstRun = database
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM collection_items) AS item_count,
          (SELECT COUNT(*) FROM releases) AS release_count,
          (SELECT COUNT(*) FROM collection_item_field_values) AS field_value_count
      `)
      .get() as
      | {
          field_value_count: number;
          item_count: number;
          release_count: number;
        }
      | undefined;

    assert.equal(countsAfterFirstRun?.item_count, 3);
    assert.equal(countsAfterFirstRun?.release_count, 2);
    assert.equal(countsAfterFirstRun?.field_value_count, 4);

    const secondRun = await importer.run();
    assert.equal(secondRun.releasesRefreshed, 0);

    const countsAfterSecondRun = database
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM collection_items) AS item_count,
          (SELECT COUNT(*) FROM releases) AS release_count
      `)
      .get() as { item_count: number; release_count: number } | undefined;

    assert.equal(countsAfterSecondRun?.item_count, 3);
    assert.equal(countsAfterSecondRun?.release_count, 2);
  } finally {
    cleanup();
  }
});

test('DiscogsImporter refreshes stale releases and prunes removed collection rows after a successful sync', async () => {
  const { database, cleanup } = createTempDatabase();

  try {
    const repository = new ImportRepository(database);
    const now = () => new Date('2026-04-23T10:00:00.000Z');

    await new DiscogsImporter({
      client: createFixtureClient(),
      now,
      releaseTtlDays: 30,
      repository,
    }).run();

    database
      .prepare(
        "UPDATE releases SET stale_after = '2000-01-01T00:00:00.000Z' WHERE release_id = 101",
      )
      .run();

    const updatedRelease =
      readFixture<DiscogsReleaseDetail>('release-101.json');
    updatedRelease.title = 'Northern Lights (Remastered)';
    const singlePage = readFixture<DiscogsCollectionReleasesPage>(
      'collection-page-1.json',
    );
    singlePage.pagination.pages = 1;
    singlePage.pagination.items = 2;

    const summary = await new DiscogsImporter({
      client: createFixtureClient({
        collectionPages: [singlePage],
        releases: {
          101: updatedRelease,
          202: readFixture('release-202.json'),
        },
      }),
      now: () => new Date('2026-05-01T10:00:00.000Z'),
      releaseTtlDays: 30,
      repository,
    }).run();

    assert.equal(summary.collectionItemsSeen, 2);
    assert.equal(summary.releasesRefreshed, 1);

    const remainingItemCount =
      (
        database
          .prepare('SELECT COUNT(*) AS count FROM collection_items')
          .get() as { count: number } | undefined
      )?.count ?? 0;
    const refreshedTitle =
      (
        database
          .prepare('SELECT title FROM releases WHERE release_id = 101')
          .get() as { title: string } | undefined
      )?.title ?? '';

    assert.equal(remainingItemCount, 2);
    assert.equal(refreshedTitle, 'Northern Lights (Remastered)');
  } finally {
    cleanup();
  }
});

test('DiscogsClient retries transient rate-limit responses with bounded backoff', async () => {
  const sleepCalls: number[] = [];
  let requestCount = 0;

  const client = new DiscogsClient({
    accessToken: 'test-token',
    userAgent: 'test-agent',
    baseUrl: 'https://api.discogs.com',
    minIntervalMs: 0,
    sleep: async (ms) => {
      sleepCalls.push(ms);
    },
    fetchImpl: async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return new Response('rate limited', {
          status: 429,
          headers: {
            'retry-after': '0.25',
          },
        });
      }

      return new Response(JSON.stringify(readFixture('identity.json')), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    },
  });

  const identity = await client.getIdentity();
  assert.equal(identity.username, 'fixture-user');
  assert.deepEqual(sleepCalls, [250]);
  assert.equal(requestCount, 2);
});
