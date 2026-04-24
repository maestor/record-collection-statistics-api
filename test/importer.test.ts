import assert from 'node:assert/strict';
import test from 'node:test';

import { DiscogsApiError, DiscogsClient } from '../src/discogs/client.js';
import type {
  DiscogsCollectionFieldsResponse,
  DiscogsCollectionRelease,
  DiscogsCollectionReleasesPage,
  DiscogsReleaseDetail,
} from '../src/discogs/types.js';
import {
  DiscogsImporter,
  type DiscogsImportProgressEvent,
} from '../src/importer/discogs-importer.js';
import { ImportRepository } from '../src/repositories/import-repository.js';
import { RecordsRepository } from '../src/repositories/records-repository.js';
import {
  createFixtureClient,
  createTempDatabase,
  readFixture,
} from './helpers.js';

function createCollectionRelease(
  releaseId: number,
  instanceId: number,
): DiscogsCollectionRelease {
  return {
    id: releaseId,
    instance_id: instanceId,
    folder_id: 0,
    date_added: '2026-04-23T10:00:00-07:00',
    rating: 0,
    basic_information: {
      id: releaseId,
      resource_url: `https://api.discogs.com/releases/${releaseId}`,
      title: `Release ${releaseId}`,
    },
  };
}

test('DiscogsImporter imports fixture data and is idempotent for fresh releases', async () => {
  const { database, cleanup } = await createTempDatabase();
  const progressEvents: DiscogsImportProgressEvent[] = [];

  try {
    const repository = new ImportRepository(database);
    const importer = new DiscogsImporter({
      client: createFixtureClient(),
      now: () => new Date('2026-04-23T10:00:00.000Z'),
      onProgress: (event) => {
        progressEvents.push(event);
      },
      releaseTtlDays: 30,
      repository,
    });

    const firstRun = await importer.run();
    const firstRunEvents = [...progressEvents];
    assert.equal(firstRun.collectionItemsSeen, 3);
    assert.equal(firstRun.pagesProcessed, 2);
    assert.equal(firstRun.releasesRefreshed, 2);
    assert.equal(
      firstRunEvents.some((event) => event.type === 'release_refresh_skipped'),
      false,
    );

    const countsAfterFirstRun = await database.queryOne<{
      field_value_count: number;
      item_count: number;
      release_count: number;
    }>(`
        SELECT
          (SELECT COUNT(*) FROM collection_items) AS item_count,
          (SELECT COUNT(*) FROM releases) AS release_count,
          (SELECT COUNT(*) FROM collection_item_field_values) AS field_value_count
      `);

    assert.equal(countsAfterFirstRun?.item_count, 3);
    assert.equal(countsAfterFirstRun?.release_count, 2);
    assert.equal(countsAfterFirstRun?.field_value_count, 4);

    const firstRunRecord = await database.queryOne<{
      completed_at: string | null;
      error_message: string | null;
      releases_refreshed: number;
      status: string;
      username: string | null;
    }>('SELECT * FROM sync_runs WHERE id = ?', [firstRun.runId]);
    const usernameState = await database.queryOne<{ value: string }>(
      "SELECT value FROM sync_state WHERE key = 'last_successful_username'",
    );

    assert.equal(firstRunRecord?.status, 'succeeded');
    assert.equal(firstRunRecord?.completed_at, '2026-04-23T10:00:00.000Z');
    assert.equal(firstRunRecord?.error_message, null);
    assert.equal(firstRunRecord?.releases_refreshed, 2);
    assert.equal(firstRunRecord?.username, 'fixture-user');
    assert.equal(usernameState?.value, 'fixture-user');

    const secondRun = await importer.run();
    const secondRunEvents = progressEvents.slice(firstRunEvents.length);
    assert.equal(secondRun.releasesRefreshed, 0);
    assert.deepEqual(
      secondRunEvents
        .filter((event) => event.type === 'release_refresh_skipped')
        .map((event) => event.releasesRefreshed),
      [0],
    );
    assert.equal(
      secondRunEvents.some((event) => event.type === 'release_refreshed'),
      false,
    );

    const countsAfterSecondRun = await database.queryOne<{
      item_count: number;
      release_count: number;
    }>(`
        SELECT
          (SELECT COUNT(*) FROM collection_items) AS item_count,
          (SELECT COUNT(*) FROM releases) AS release_count
      `);

    assert.equal(countsAfterSecondRun?.item_count, 3);
    assert.equal(countsAfterSecondRun?.release_count, 2);
  } finally {
    cleanup();
  }
});

test('DiscogsImporter can run with default clock and no progress callback', async () => {
  const { database, cleanup } = await createTempDatabase();

  try {
    const page = readFixture<DiscogsCollectionReleasesPage>(
      'collection-page-1.json',
    );
    page.pagination.pages = 1;
    page.pagination.items = page.releases.length;

    const repository = new ImportRepository(database);
    const summary = await new DiscogsImporter({
      client: createFixtureClient({
        collectionPages: [page],
      }),
      releaseTtlDays: 30,
      repository,
    }).run();

    assert.equal(summary.collectionItemsSeen, 2);
    assert.equal(summary.pagesProcessed, 1);
    assert.equal(summary.username, 'fixture-user');
  } finally {
    cleanup();
  }
});

test('DiscogsImporter replaces collection item field values on reimport', async () => {
  const { database, cleanup } = await createTempDatabase();

  try {
    const repository = new ImportRepository(database);
    const now = () => new Date('2026-04-23T10:00:00.000Z');
    await new DiscogsImporter({
      client: createFixtureClient(),
      now,
      releaseTtlDays: 30,
      repository,
    }).run();

    const pageOne = readFixture<DiscogsCollectionReleasesPage>(
      'collection-page-1.json',
    );
    const firstRelease = pageOne.releases[0];
    assert.ok(firstRelease);
    pageOne.releases[0] = {
      ...firstRelease,
      notes: [],
    };

    await new DiscogsImporter({
      client: createFixtureClient({
        collectionPages: [
          pageOne,
          readFixture<DiscogsCollectionReleasesPage>('collection-page-2.json'),
        ],
      }),
      now,
      releaseTtlDays: 30,
      repository,
    }).run();

    const valuesByInstance = await database.queryAll<{
      instance_id: number;
      total: number;
    }>(`
      SELECT ci.instance_id, COUNT(civ.field_id) AS total
      FROM collection_items ci
      LEFT JOIN collection_item_field_values civ
        ON civ.instance_id = ci.instance_id
      GROUP BY ci.instance_id
      ORDER BY ci.instance_id
    `);

    assert.deepEqual(valuesByInstance, [
      { instance_id: 1001, total: 0 },
      { instance_id: 1002, total: 1 },
      { instance_id: 2001, total: 1 },
    ]);
  } finally {
    cleanup();
  }
});

test('ImportRepository treats releases expiring exactly at the reference time as stale', async () => {
  const { database, cleanup } = await createTempDatabase();

  try {
    const repository = new ImportRepository(database);
    await new DiscogsImporter({
      client: createFixtureClient(),
      now: () => new Date('2026-04-23T10:00:00.000Z'),
      releaseTtlDays: 30,
      repository,
    }).run();

    const staleAfter =
      (
        await database.queryOne<{ stale_after: string }>(
          'SELECT stale_after FROM releases WHERE release_id = 101',
        )
      )?.stale_after ?? '';

    assert.deepEqual(
      await repository.listReleaseIdsNeedingRefresh([101], staleAfter),
      [101],
    );
  } finally {
    cleanup();
  }
});

test('DiscogsImporter refreshes stale releases and prunes removed collection rows after a successful sync', async () => {
  const { database, cleanup } = await createTempDatabase();

  try {
    const repository = new ImportRepository(database);
    const now = () => new Date('2026-04-23T10:00:00.000Z');

    await new DiscogsImporter({
      client: createFixtureClient(),
      now,
      releaseTtlDays: 30,
      repository,
    }).run();

    await database.execute(
      "UPDATE releases SET stale_after = '2000-01-01T00:00:00.000Z' WHERE release_id = 101",
    );

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
        await database.queryOne<{ count: number }>(
          'SELECT COUNT(*) AS count FROM collection_items',
        )
      )?.count ?? 0;
    const refreshedTitle =
      (
        await database.queryOne<{ title: string }>(
          'SELECT title FROM releases WHERE release_id = 101',
        )
      )?.title ?? '';

    assert.equal(remainingItemCount, 2);
    assert.equal(refreshedTitle, 'Northern Lights (Remastered)');
  } finally {
    cleanup();
  }
});

test('DiscogsImporter emits progress events for collection sync and release enrichment', async () => {
  const { database, cleanup } = await createTempDatabase();
  const progressEvents: DiscogsImportProgressEvent[] = [];

  try {
    const repository = new ImportRepository(database);
    const importer = new DiscogsImporter({
      client: createFixtureClient(),
      now: () => new Date('2026-04-23T10:00:00.000Z'),
      onProgress: (event) => {
        progressEvents.push(event);
      },
      releaseTtlDays: 30,
      repository,
    });

    await importer.run();

    assert.equal(progressEvents[0]?.type, 'run_started');
    assert.equal(progressEvents[1]?.type, 'collection_fields_loaded');

    const pageEvents = progressEvents.filter(
      (
        event,
      ): event is Extract<
        DiscogsImportProgressEvent,
        { type: 'collection_page_synced' }
      > => event.type === 'collection_page_synced',
    );
    assert.equal(pageEvents.length, 2);
    assert.deepEqual(
      pageEvents.map((event) => event.collectionItemsSeen),
      [2, 3],
    );

    const plannedEvent = progressEvents.find(
      (
        event,
      ): event is Extract<
        DiscogsImportProgressEvent,
        { type: 'release_refresh_planned' }
      > => event.type === 'release_refresh_planned',
    );
    assert.equal(plannedEvent?.releaseCountInCollection, 2);
    assert.equal(plannedEvent?.releaseCountToRefresh, 2);

    const refreshedEvents = progressEvents.filter(
      (
        event,
      ): event is Extract<
        DiscogsImportProgressEvent,
        { type: 'release_refreshed' }
      > => event.type === 'release_refreshed',
    );
    assert.equal(refreshedEvents.length, 2);
    assert.equal(progressEvents.at(-1)?.type, 'run_completed');
  } finally {
    cleanup();
  }
});

test('DiscogsImporter records failed runs and avoids successful-sync side effects', async () => {
  const { database, cleanup } = await createTempDatabase();

  try {
    const repository = new ImportRepository(database);
    const importer = new DiscogsImporter({
      client: {
        ...createFixtureClient(),
        async getCollectionReleases(_username: string, page: number) {
          if (page === 2) {
            throw new Error('Discogs collection page 2 failed');
          }

          return readFixture<DiscogsCollectionReleasesPage>(
            'collection-page-1.json',
          );
        },
      },
      now: () => new Date('2026-04-23T10:00:00.000Z'),
      releaseTtlDays: 30,
      repository,
    });

    await assert.rejects(
      () => importer.run(),
      /Discogs collection page 2 failed/,
    );

    const run = await database.queryOne<{
      collection_items_seen: number;
      error_message: string | null;
      pages_processed: number;
      status: string;
    }>('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1');
    const stateRows = await database.queryAll<{ key: string }>(
      'SELECT key FROM sync_state',
    );
    const itemCount =
      (
        await database.queryOne<{ count: number }>(
          'SELECT COUNT(*) AS count FROM collection_items',
        )
      )?.count ?? 0;

    assert.equal(run?.status, 'failed');
    assert.equal(run?.error_message, 'Discogs collection page 2 failed');
    assert.equal(run?.pages_processed, 1);
    assert.equal(run?.collection_items_seen, 2);
    assert.equal(itemCount, 2);
    assert.deepEqual(stateRows, []);
  } finally {
    cleanup();
  }
});

test('DiscogsImporter uses fallback error text for non-Error failures', async () => {
  const { database, cleanup } = await createTempDatabase();

  try {
    const repository = new ImportRepository(database);
    const importer = new DiscogsImporter({
      client: {
        ...createFixtureClient(),
        async getIdentity() {
          throw 'discogs exploded';
        },
      },
      now: () => new Date('2026-04-23T10:00:00.000Z'),
      releaseTtlDays: 30,
      repository,
    });

    await assert.rejects(() => importer.run(), /discogs exploded/);

    const run = await database.queryOne<{
      error_message: string | null;
      status: string;
    }>('SELECT status, error_message FROM sync_runs ORDER BY id DESC LIMIT 1');

    assert.equal(run?.status, 'failed');
    assert.equal(run?.error_message, 'Unknown Discogs import error');
  } finally {
    cleanup();
  }
});

test('DiscogsImporter full refresh ignores fresh release TTLs', async () => {
  const { database, cleanup } = await createTempDatabase();

  try {
    const repository = new ImportRepository(database);
    await new DiscogsImporter({
      client: createFixtureClient(),
      now: () => new Date('2026-04-23T10:00:00.000Z'),
      releaseTtlDays: 30,
      repository,
    }).run();

    const refreshedRelease =
      readFixture<DiscogsReleaseDetail>('release-202.json');
    refreshedRelease.title = 'Moonlit Session (Full Refresh)';
    const summary = await new DiscogsImporter({
      client: createFixtureClient({
        releases: {
          101: readFixture('release-101.json'),
          202: refreshedRelease,
        },
      }),
      fullRefresh: true,
      now: () => new Date('2026-04-24T10:00:00.000Z'),
      releaseTtlDays: 30,
      repository,
    }).run();
    const releaseTitle =
      (
        await database.queryOne<{ title: string }>(
          'SELECT title FROM releases WHERE release_id = 202',
        )
      )?.title ?? '';

    assert.equal(summary.releasesRefreshed, 2);
    assert.equal(releaseTitle, 'Moonlit Session (Full Refresh)');
  } finally {
    cleanup();
  }
});

test('DiscogsImporter ignores unknown collection note fields', async () => {
  const { database, cleanup } = await createTempDatabase();

  try {
    const page = readFixture<DiscogsCollectionReleasesPage>(
      'collection-page-1.json',
    );
    page.releases[0]?.notes?.push({
      field_id: 999,
      value: 'Should not be stored',
    });
    const fields = readFixture<DiscogsCollectionFieldsResponse>(
      'collection-fields.json',
    );
    fields.fields = fields.fields.filter((field) => field.id !== 999);

    const repository = new ImportRepository(database);
    await new DiscogsImporter({
      client: createFixtureClient({
        collectionPages: [
          {
            ...page,
            pagination: {
              ...page.pagination,
              items: page.releases.length,
              pages: 1,
            },
          },
        ],
        fields,
      }),
      now: () => new Date('2026-04-23T10:00:00.000Z'),
      releaseTtlDays: 30,
      repository,
    }).run();

    const unknownFieldValues = await database.queryAll<{ value_text: string }>(
      'SELECT value_text FROM collection_item_field_values WHERE field_id = 999',
    );

    assert.deepEqual(unknownFieldValues, []);
  } finally {
    cleanup();
  }
});

test('DiscogsImporter handles sparse optional Discogs payloads through the cache boundary', async () => {
  const { database, cleanup } = await createTempDatabase();

  try {
    const sparsePage: DiscogsCollectionReleasesPage = {
      pagination: {
        page: 1,
        pages: 1,
        per_page: 100,
        items: 2,
      },
      releases: [
        createCollectionRelease(303, 9303),
        createCollectionRelease(404, 9404),
      ],
    };
    const sparseRelease: DiscogsReleaseDetail = {
      id: 303,
      title: 'Sparse Release',
    };
    const thumbFallbackRelease: DiscogsReleaseDetail = {
      id: 404,
      title: 'Thumb Fallback Release',
      community: {
        data_quality: 'Needs Vote',
      },
      images: [
        {
          resource_url: 'https://example.test/release-404-resource.jpg',
        },
      ],
      thumb: 'https://example.test/release-404-thumb.jpg',
      tracklist: [
        {
          title: 'Untitled',
          extraartists: [
            {
              name: 'Guest Artist',
            },
          ],
        },
      ],
    };
    const repository = new ImportRepository(database);
    const summary = await new DiscogsImporter({
      client: createFixtureClient({
        collectionPages: [sparsePage],
        fields: {
          fields: [],
        },
        releases: {
          303: sparseRelease,
          404: thumbFallbackRelease,
        },
      }),
      now: () => new Date('2026-04-23T10:00:00.000Z'),
      releaseTtlDays: 30,
      repository,
    }).run();

    const sparseRecord = await database.queryOne<{
      artists_sort: string | null;
      community_have: number | null;
      cover_image: string | null;
      data_quality: string | null;
      lowest_price: number | null;
      release_year: number | null;
      thumb: string | null;
    }>('SELECT * FROM releases WHERE release_id = 303');
    const fallbackRecord = await database.queryOne<{
      cover_image: string | null;
      data_quality: string | null;
    }>('SELECT cover_image, data_quality FROM releases WHERE release_id = 404');
    const track = await database.queryOne<{
      extraartists_json: string;
      track_position: string | null;
      track_type: string;
    }>('SELECT * FROM release_tracks WHERE release_id = 404');
    const recordsRepository = new RecordsRepository(database);
    const sparseDetail = await recordsRepository.getRecordDetail(303);
    const fallbackDetail = await recordsRepository.getRecordDetail(404);

    assert.equal(summary.collectionItemsSeen, 2);
    assert.equal(sparseRecord?.artists_sort, null);
    assert.equal(sparseRecord?.release_year, null);
    assert.equal(sparseRecord?.data_quality, null);
    assert.equal(sparseRecord?.community_have, null);
    assert.equal(sparseRecord?.lowest_price, null);
    assert.equal(sparseRecord?.cover_image, null);
    assert.equal(sparseRecord?.thumb, null);
    assert.equal(
      fallbackRecord?.cover_image,
      'https://example.test/release-404-thumb.jpg',
    );
    assert.equal(fallbackRecord?.data_quality, 'Needs Vote');
    assert.equal(track?.track_position, null);
    assert.equal(track?.track_type, 'track');
    assert.match(track?.extraartists_json ?? '', /Guest Artist/);
    assert.equal(sparseDetail?.releaseYear, null);
    assert.equal(sparseDetail?.lowestPrice, null);
    assert.equal(sparseDetail?.community.have, null);
    assert.deepEqual(sparseDetail?.artists, []);
    assert.deepEqual(sparseDetail?.formats, []);
    assert.deepEqual(sparseDetail?.collectionItems[0]?.fieldValues, []);
    assert.equal(
      fallbackDetail?.coverImage,
      'https://example.test/release-404-thumb.jpg',
    );
    assert.equal(fallbackDetail?.tracks[0]?.position, null);
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

test('DiscogsClient retries server errors with exponential fallback delays', async () => {
  const sleepCalls: number[] = [];
  let requestCount = 0;

  const client = new DiscogsClient({
    accessToken: 'test-token',
    userAgent: 'test-agent',
    baseUrl: 'https://api.discogs.com/',
    minIntervalMs: 0,
    sleep: async (ms) => {
      sleepCalls.push(ms);
    },
    fetchImpl: async (input, init) => {
      requestCount += 1;
      const headers = new Headers(init?.headers);
      assert.equal(input, 'https://api.discogs.com/oauth/identity');
      assert.equal(headers.get('authorization'), 'Discogs token=test-token');
      assert.equal(headers.get('user-agent'), 'test-agent');
      assert.equal(headers.get('accept'), 'application/json');

      if (requestCount < 3) {
        return new Response('temporary outage', {
          status: 503,
          headers: {
            'retry-after': 'not-a-number',
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
  assert.deepEqual(sleepCalls, [1000, 2000]);
  assert.equal(requestCount, 3);
});

test('DiscogsClient throws non-retryable API errors without retrying', async () => {
  let requestCount = 0;

  const client = new DiscogsClient({
    accessToken: 'test-token',
    userAgent: 'test-agent',
    baseUrl: 'https://api.discogs.com',
    minIntervalMs: 0,
    fetchImpl: async () => {
      requestCount += 1;
      return new Response('bad token', {
        status: 401,
      });
    },
  });

  await assert.rejects(
    () => client.getCollectionFields('space user'),
    (error) =>
      error instanceof DiscogsApiError &&
      error.status === 401 &&
      error.message === 'Discogs request failed with status 401: bad token',
  );
  assert.equal(requestCount, 1);
});

test('DiscogsClient reads collection pages and releases with encoded paths', async () => {
  const requests: string[] = [];
  const client = new DiscogsClient({
    accessToken: 'test-token',
    userAgent: 'test-agent',
    baseUrl: 'https://api.discogs.com/',
    minIntervalMs: 0,
    fetchImpl: async (input) => {
      requests.push(String(input));

      if (String(input).includes('/collection/folders/0/releases')) {
        return new Response(
          JSON.stringify(readFixture('collection-page-1.json')),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        );
      }

      return new Response(JSON.stringify(readFixture('release-101.json')), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    },
  });

  const collectionPage = await client.getCollectionReleases(
    'space user',
    2,
    50,
  );
  const release = await client.getRelease(101);

  assert.equal(collectionPage.pagination.page, 1);
  assert.equal(release.title, 'Northern Lights');
  assert.deepEqual(requests, [
    'https://api.discogs.com/users/space%20user/collection/folders/0/releases?page=2&per_page=50',
    'https://api.discogs.com/releases/101',
  ]);
});

test('DiscogsClient waits between successful requests when rate limiting is enabled', async () => {
  const sleepCalls: number[] = [];
  let now = 1_000;

  const originalDateNow = Date.now;
  try {
    Date.now = () => now;
    const client = new DiscogsClient({
      accessToken: 'test-token',
      userAgent: 'test-agent',
      baseUrl: 'https://api.discogs.com',
      minIntervalMs: 25,
      sleep: async (ms) => {
        sleepCalls.push(ms);
        now += ms;
      },
      fetchImpl: async () =>
        new Response(JSON.stringify(readFixture('identity.json')), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }),
    });

    await client.getIdentity();
    await client.getIdentity();

    assert.deepEqual(sleepCalls, [25]);
  } finally {
    Date.now = originalDateNow;
  }
});

test('DiscogsClient uses default fetch, retry count, and rate-limit sleep when not overridden', async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  try {
    globalThis.fetch = async () => {
      requestCount += 1;

      if (requestCount <= 3) {
        return new Response('temporary outage', {
          status: 503,
          headers: {
            'retry-after': '0',
          },
        });
      }

      return new Response(JSON.stringify(readFixture('identity.json')), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    };

    const client = new DiscogsClient({
      accessToken: 'test-token',
      userAgent: 'test-agent',
      baseUrl: 'https://api.discogs.com',
      minIntervalMs: 1,
    });
    const identity = await client.getIdentity();

    assert.equal(identity.username, 'fixture-user');
    assert.equal(requestCount, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
