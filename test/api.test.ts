import assert from 'node:assert/strict';
import test from 'node:test';

import appHandler from '../src/app.js';
import { createApp } from '../src/http/app.js';
import indexHandler from '../src/index.js';
import { seedFixtureImport } from './helpers.js';

async function assertCacheRevalidation(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<void> {
  const response = await app.request(path);
  assert.equal(response.status, 200);

  const etag = response.headers.get('etag');
  assert.ok(etag);

  const revalidatedResponse = await app.request(path, {
    headers: {
      'if-none-match': etag,
    },
  });
  assert.equal(revalidatedResponse.status, 304);
}

test('Vercel entrypoints default-export Hono apps', () => {
  assert.equal(typeof appHandler.fetch, 'function');
  assert.equal(indexHandler, appHandler);
});

test('GET /records returns paginated release data and stable cache metadata', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const app = createApp(seeded.database);
    const response = await app.request(
      '/records?page_size=1&sort=title&order=asc',
    );

    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /max-age=60/);
    assert.ok(response.headers.get('etag'));

    const payload = (await response.json()) as {
      data: Array<{
        dateAdded: string | null;
        formats: Array<{
          descriptions: string[];
          freeText: string | null;
          name: string;
        }>;
        releaseId: number;
        title: string;
      }>;
      meta: { total: number; totalPages: number };
    };

    assert.equal(payload.meta.total, 2);
    assert.equal(payload.meta.totalPages, 2);
    assert.equal(payload.data[0]?.releaseId, 202);
    assert.equal(payload.data[0]?.title, 'Moonlit Session');
    assert.equal(payload.data[0]?.dateAdded, '2024-02-11T13:30:00.000Z');
    assert.deepEqual(payload.data[0]?.formats, [
      {
        name: 'Vinyl',
        descriptions: ['LP', 'Album'],
        freeText: null,
      },
    ]);

    const secondResponse = await app.request(
      '/records?page_size=1&sort=title&order=asc',
      {
        headers: {
          'if-none-match': response.headers.get('etag') ?? '',
        },
      },
    );
    assert.equal(secondResponse.status, 304);

    const singlePageResponse = await app.request('/records?page_size=2');
    const singlePagePayload = (await singlePageResponse.json()) as {
      meta: { totalPages: number };
    };
    assert.equal(singlePagePayload.meta.totalPages, 1);

    const emptyResponse = await app.request('/records?artist=Nope');
    const emptyPayload = (await emptyResponse.json()) as {
      meta: { total: number; totalPages: number };
    };
    assert.deepEqual(emptyPayload.meta, {
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    });
  } finally {
    seeded.cleanup();
  }
});

test('GET / exposes API discovery details', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const app = createApp(seeded.database);
    const response = await app.request('/');
    assert.equal(response.status, 200);

    assert.deepEqual(await response.json(), {
      service: 'record-collection-statistics-api',
      capabilities: {
        importerBackedCache: true,
        readOnlyApi: true,
        discogsOnRequestPath: false,
        localBypassAuth: true,
        remoteApiKeyAuth: true,
      },
      endpoints: {
        health: '/health',
        openapi: '/openapi.json',
        filters: '/filters?limit=25',
        records: '/records',
        recordDetail: '/records/:releaseId',
        statsSummary: '/stats/summary',
        statsDashboard: '/stats/dashboard?limit=10',
        statsBreakdown: '/stats/breakdowns/:dimension',
      },
      recordsQuery: {
        supportedFilters: [
          'q',
          'artist',
          'label',
          'genre',
          'style',
          'format',
          'country',
          'year_from',
          'year_to',
          'added_from',
          'added_to',
          'page',
          'page_size',
          'sort',
          'order',
        ],
        allowedSorts: [
          'date_added',
          'release_year',
          'artist',
          'title',
          'lowest_price',
        ],
      },
      breakdownDimensions: [
        'artist',
        'label',
        'format',
        'genre',
        'style',
        'country',
        'release_year',
        'added_year',
      ],
    });

    const invalidResponse = await app.request('/?limit=1');
    assert.equal(invalidResponse.status, 400);
    assert.deepEqual(await invalidResponse.json(), {
      error: '/ does not support query parameter(s): limit',
    });
  } finally {
    seeded.cleanup();
  }
});

test('GET /openapi.json exposes the OpenAPI document', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const app = createApp(seeded.database);
    const response = await app.request('/openapi.json');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /max-age=60/);

    const payload = (await response.json()) as {
      components: {
        schemas: Record<string, unknown>;
      };
      info: {
        title: string;
      };
      openapi: string;
      paths: Record<string, unknown>;
    };

    assert.equal(payload.openapi, '3.1.0');
    assert.equal(payload.info.title, 'Record Collection Statistics API');
    assert.ok(payload.paths['/records']);
    assert.ok(payload.paths['/openapi.json']);
    assert.ok(payload.components.schemas.RecordDetail);
    assert.deepEqual(
      (
        payload.components.schemas.StatsSummary as {
          properties: Record<string, unknown>;
          required: string[];
        }
      ).required,
      ['totals', 'addedRange', 'collectionValue'],
    );
    assert.ok(
      (
        payload.components.schemas.StatsSummary as {
          properties: Record<string, unknown>;
        }
      ).properties.collectionValue,
    );
    assert.equal(
      (
        payload.components.schemas.StatsSummary as {
          properties: Record<string, unknown>;
        }
      ).properties.releaseYearRange,
      undefined,
    );
    assert.equal(
      (
        payload.paths['/records'] as {
          get: { parameters: Array<{ description?: string; name: string }> };
        }
      ).get.parameters.find((parameter) => parameter.name === 'q')?.description,
      'Case-insensitive free-text match against title, artist, label, format descriptions, and format free text.',
    );

    const invalidResponse = await app.request('/openapi.json?limit=1');
    assert.equal(invalidResponse.status, 400);
    assert.deepEqual(await invalidResponse.json(), {
      error: '/openapi.json does not support query parameter(s): limit',
    });
  } finally {
    seeded.cleanup();
  }
});

test('non-local requests require API key while localhost stays open', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const app = createApp(seeded.database, {
      apiReadKey: 'secret-read-key',
    });

    const localhostResponse = await app.request('/health');
    assert.equal(localhostResponse.status, 200);

    const ipv4LocalhostResponse = await app.request('http://127.0.0.1/health');
    assert.equal(ipv4LocalhostResponse.status, 200);

    const ipv6LocalhostResponse = await app.request('http://[::1]/health');
    assert.equal(ipv6LocalhostResponse.status, 200);

    const missingKeyResponse = await app.request('https://example.com/health');
    assert.equal(missingKeyResponse.status, 401);
    assert.deepEqual(await missingKeyResponse.json(), {
      error:
        'A valid API key is required for non-local requests. Provide x-api-key or Authorization: Bearer <key>.',
    });

    const wrongKeyResponse = await app.request('https://example.com/health', {
      headers: {
        'x-api-key': 'wrong-key',
      },
    });
    assert.equal(wrongKeyResponse.status, 401);

    const unsupportedAuthorizationResponse = await app.request(
      'https://example.com/health',
      {
        headers: {
          authorization: 'Token: secret-read-key',
        },
      },
    );
    assert.equal(unsupportedAuthorizationResponse.status, 401);

    const emptyBearerResponse = await app.request(
      'https://example.com/health',
      {
        headers: {
          authorization: 'Bearer   ',
        },
      },
    );
    assert.equal(emptyBearerResponse.status, 401);

    const xApiKeyResponse = await app.request('https://example.com/health', {
      headers: {
        'x-api-key': 'secret-read-key',
      },
    });
    assert.equal(xApiKeyResponse.status, 200);

    const bearerResponse = await app.request('https://example.com/health', {
      headers: {
        authorization: 'Bearer   secret-read-key  ',
      },
    });
    assert.equal(bearerResponse.status, 200);
  } finally {
    seeded.cleanup();
  }
});

test('non-local requests fail closed when API key is not configured', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const app = createApp(seeded.database);
    const response = await app.request('https://example.com/health');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error:
        'Remote API access is disabled because API_READ_KEY is not configured.',
    });
  } finally {
    seeded.cleanup();
  }
});

test('GET /records validates sort options and supports artist and format text filtering', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    await seeded.database.execute(
      `
        INSERT INTO release_formats (
          release_id,
          position,
          name,
          qty,
          format_text,
          descriptions_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [202, 1, 'Vinyl', '1', 'Test Pressing', '["Promo"]'],
    );

    const app = createApp(seeded.database);

    const filteredResponse = await app.request(
      '/records?artist=Alpha%20Artist',
    );
    assert.equal(filteredResponse.status, 200);
    const filteredPayload = (await filteredResponse.json()) as {
      data: Array<{ releaseId: number; instanceCount: number }>;
    };
    assert.equal(filteredPayload.data.length, 1);
    assert.equal(filteredPayload.data[0]?.releaseId, 101);
    assert.equal(filteredPayload.data[0]?.instanceCount, 2);

    const descriptionQueryResponse = await app.request('/records?q=Promo');
    assert.equal(descriptionQueryResponse.status, 200);
    const descriptionQueryPayload = (await descriptionQueryResponse.json()) as {
      data: Array<{ releaseId: number }>;
    };
    assert.deepEqual(
      descriptionQueryPayload.data.map((record) => record.releaseId),
      [202],
    );

    const freeTextQueryResponse = await app.request(
      '/records?q=Test%20Pressing',
    );
    assert.equal(freeTextQueryResponse.status, 200);
    const freeTextQueryPayload = (await freeTextQueryResponse.json()) as {
      data: Array<{ releaseId: number }>;
    };
    assert.deepEqual(
      freeTextQueryPayload.data.map((record) => record.releaseId),
      [202],
    );

    const invalidResponse = await app.request('/records?sort=unknown');
    assert.equal(invalidResponse.status, 400);

    const unknownQueryResponse = await app.request(
      '/records?artist=Alpha%20Artist&artst=oops',
    );
    assert.equal(unknownQueryResponse.status, 400);

    const fullQueryResponse = await app.request(
      '/records?q=Northern&artist=Alpha%20Artist&label=Aurora%20Audio&genre=Rock&style=Indie%20Rock&format=CD&country=Finland&year_from=1999&year_to=1999&added_from=2024-01-01&added_to=2024-03-10&page=1&page_size=2&sort=release_year&order=asc',
    );
    assert.equal(fullQueryResponse.status, 200);
    const fullQueryPayload = (await fullQueryResponse.json()) as {
      data: Array<{ releaseId: number }>;
      filters: Record<string, unknown>;
    };
    assert.deepEqual(
      fullQueryPayload.data.map((record) => ({ releaseId: record.releaseId })),
      [{ releaseId: 101 }],
    );
    assert.deepEqual(fullQueryPayload.filters, {
      q: 'Northern',
      artist: 'Alpha Artist',
      label: 'Aurora Audio',
      genre: 'Rock',
      style: 'Indie Rock',
      format: 'CD',
      country: 'Finland',
      yearFrom: 1999,
      yearTo: 1999,
      addedFrom: '2024-01-01T00:00:00.000Z',
      addedTo: '2024-03-10T23:59:59.999Z',
      sort: 'release_year',
      order: 'asc',
    });
  } finally {
    seeded.cleanup();
  }
});

test('GET /records/:releaseId returns detailed release data with collection field values', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const app = createApp(seeded.database);
    const response = await app.request('/records/101');
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      data: {
        collectionItems: Array<{ fieldValues: Array<{ fieldName: string }> }>;
        dateAdded: string;
        formats: Array<{
          descriptions: string[];
          freeText: string | null;
          name: string;
        }>;
        genres: string[];
        labels: Array<{ name: string }>;
        title: string;
      };
    };

    assert.equal(payload.data.title, 'Northern Lights');
    assert.equal(payload.data.collectionItems.length, 2);
    assert.equal(
      payload.data.collectionItems[0]?.fieldValues[0]?.fieldName,
      'Media Condition',
    );
    assert.equal(payload.data.labels[0]?.name, 'Aurora Audio');
    assert.equal(payload.data.dateAdded, '2024-01-10T15:00:00.000Z');
    assert.deepEqual(payload.data.formats, [
      {
        name: 'CD',
        descriptions: ['Album'],
        freeText: null,
      },
    ]);
    assert.deepEqual(payload.data.genres, ['Rock']);

    const missingResponse = await app.request('/records/999');
    assert.equal(missingResponse.status, 404);
    assert.deepEqual(await missingResponse.json(), {
      error: 'Release 999 was not found in the local collection cache.',
    });
  } finally {
    seeded.cleanup();
  }
});

test('stats endpoints return collection summary and breakdowns', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const app = createApp(seeded.database);

    const summaryResponse = await app.request('/stats/summary');
    assert.equal(summaryResponse.status, 200);
    const summaryPayload = (await summaryResponse.json()) as {
      data: {
        addedRange: {
          first: string | null;
          last: string | null;
        };
        collectionValue: {
          maximum: number | null;
          median: number | null;
          minimum: number | null;
        };
        totals: {
          collectionItems: number;
          genres: number;
          labels: number;
          releases: number;
          styles: number;
          uniqueArtists: number;
        };
      };
    };
    assert.deepEqual(summaryPayload.data, {
      totals: {
        collectionItems: 3,
        releases: 2,
        uniqueArtists: 2,
        labels: 2,
        genres: 2,
        styles: 2,
      },
      addedRange: {
        first: '2024-01-10T15:00:00.000Z',
        last: '2024-03-05T00:00:00.000Z',
      },
      collectionValue: {
        minimum: 41.75,
        median: 58.5,
        maximum: 72.25,
      },
    });

    const breakdownResponse = await app.request('/stats/breakdowns/artist');
    assert.equal(breakdownResponse.status, 200);
    const breakdownPayload = (await breakdownResponse.json()) as {
      data: Array<{ itemCount: number; releaseCount: number; value: string }>;
      meta: { dimension: string };
    };

    assert.deepEqual(breakdownPayload.data[0], {
      value: 'Alpha Artist',
      itemCount: 2,
      releaseCount: 1,
    });
    assert.deepEqual(breakdownPayload.meta, {
      dimension: 'artist',
    });
  } finally {
    seeded.cleanup();
  }
});

test('GET /stats/dashboard returns summary plus top breakdowns', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const app = createApp(seeded.database);
    const response = await app.request('/stats/dashboard?limit=1');
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      data: {
        addedYears: Array<{ value: string }>;
        countries: Array<{ value: string }>;
        formats: Array<{ value: string }>;
        genres: Array<{ value: string }>;
        labels: Array<{ value: string }>;
        styles: Array<{ value: string }>;
        summary: {
          collectionValue: {
            maximum: number | null;
            median: number | null;
            minimum: number | null;
          };
          totals: {
            collectionItems: number;
            releases: number;
          };
        };
        topArtists: Array<{ itemCount: number; value: string }>;
      };
      meta: { limit: number };
    };

    assert.equal(payload.meta.limit, 1);
    assert.equal(payload.data.summary.totals.collectionItems, 3);
    assert.equal(payload.data.summary.totals.releases, 2);
    assert.deepEqual(payload.data.summary.collectionValue, {
      minimum: 41.75,
      median: 58.5,
      maximum: 72.25,
    });
    assert.deepEqual(payload.data.topArtists, [
      {
        value: 'Alpha Artist',
        itemCount: 2,
        releaseCount: 1,
      },
    ]);
    assert.equal(payload.data.labels[0]?.value, 'Aurora Audio');
    assert.equal(payload.data.formats[0]?.value, 'CD');
    assert.equal(payload.data.genres[0]?.value, 'Rock');
    assert.equal(payload.data.styles[0]?.value, 'Indie Rock');
    assert.equal(payload.data.countries[0]?.value, 'Finland');
    assert.equal(payload.data.addedYears[0]?.value, '2024');
    assert.equal(payload.data.labels.length, 1);
    assert.equal(payload.data.formats.length, 1);
    assert.equal(payload.data.genres.length, 1);
    assert.equal(payload.data.styles.length, 1);
    assert.equal(payload.data.countries.length, 1);

    const invalidResponse = await app.request(
      '/stats/dashboard?limit=1&page=2',
    );
    assert.equal(invalidResponse.status, 400);
  } finally {
    seeded.cleanup();
  }
});

test('GET /filters returns available filter values and respects limit validation', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const app = createApp(seeded.database);

    const response = await app.request('/filters?limit=1');
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      data: {
        addedYears: Array<{ value: string }>;
        artists: Array<{ itemCount: number; value: string }>;
        countries: Array<{ value: string }>;
        formats: Array<{ value: string }>;
        genres: Array<{ value: string }>;
        labels: Array<{ value: string }>;
        ranges: {
          added: { first: string; last: string };
          releaseYears: { max: number; min: number };
        };
        releaseYears: Array<{ value: string }>;
        styles: Array<{ value: string }>;
      };
      meta: { limit: number };
    };

    assert.equal(payload.meta.limit, 1);
    assert.deepEqual(payload.data.artists, [
      {
        value: 'Alpha Artist',
        itemCount: 2,
        releaseCount: 1,
      },
    ]);
    assert.equal(payload.data.labels[0]?.value, 'Aurora Audio');
    assert.equal(payload.data.formats[0]?.value, 'CD');
    assert.equal(payload.data.genres[0]?.value, 'Rock');
    assert.equal(payload.data.styles[0]?.value, 'Indie Rock');
    assert.equal(payload.data.countries[0]?.value, 'Finland');
    assert.equal(payload.data.releaseYears[0]?.value, '1999');
    assert.equal(payload.data.addedYears[0]?.value, '2024');
    assert.equal(payload.data.labels.length, 1);
    assert.equal(payload.data.formats.length, 1);
    assert.equal(payload.data.genres.length, 1);
    assert.equal(payload.data.styles.length, 1);
    assert.equal(payload.data.countries.length, 1);
    assert.equal(payload.data.releaseYears.length, 1);
    assert.equal(payload.data.ranges.releaseYears.min, 1999);
    assert.equal(payload.data.ranges.releaseYears.max, 2005);

    const invalidResponse = await app.request('/filters?limit=0');
    assert.equal(invalidResponse.status, 400);

    const unknownQueryResponse = await app.request(
      '/filters?limit=1&genre=Rock',
    );
    assert.equal(unknownQueryResponse.status, 400);
  } finally {
    seeded.cleanup();
  }
});

test('GET /filters can narrow populated dimensions while preserving response shape', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const app = createApp(seeded.database);
    const response = await app.request(
      '/filters?limit=1&dimensions=artist,format,genre',
    );
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      data: {
        addedYears: Array<{ value: string }>;
        artists: Array<{ value: string }>;
        countries: Array<{ value: string }>;
        formats: Array<{ value: string }>;
        genres: Array<{ value: string }>;
        labels: Array<{ value: string }>;
        releaseYears: Array<{ value: string }>;
        styles: Array<{ value: string }>;
      };
      meta: { dimensions: string[]; limit: number };
    };

    assert.deepEqual(payload.meta, {
      limit: 1,
      dimensions: ['artist', 'format', 'genre'],
    });
    assert.equal(payload.data.artists[0]?.value, 'Alpha Artist');
    assert.equal(payload.data.formats[0]?.value, 'CD');
    assert.equal(payload.data.genres[0]?.value, 'Rock');
    assert.deepEqual(payload.data.labels, []);
    assert.deepEqual(payload.data.styles, []);
    assert.deepEqual(payload.data.countries, []);
    assert.deepEqual(payload.data.releaseYears, []);
    assert.deepEqual(payload.data.addedYears, []);

    const invalidResponse = await app.request('/filters?dimensions=decade');
    assert.equal(invalidResponse.status, 400);
    assert.deepEqual(await invalidResponse.json(), {
      error:
        'dimensions must be a comma-separated list of: artist, label, format, genre, style, country, release_year, added_year',
    });
  } finally {
    seeded.cleanup();
  }
});

test('GET /health reports a successful local sync snapshot', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const app = createApp(seeded.database);
    const response = await app.request('/health');
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      database: {
        lastSuccessfulSyncAt: string;
        releaseCount: number;
        totalItems: number;
      };
      ok: boolean;
    };

    assert.equal(payload.ok, true);
    assert.equal(payload.database.totalItems, 3);
    assert.equal(payload.database.releaseCount, 2);
    assert.equal(
      payload.database.lastSuccessfulSyncAt,
      '2026-04-23T10:00:00.000Z',
    );

    const invalidResponse = await app.request('/health?verbose=true');
    assert.equal(invalidResponse.status, 400);
    assert.deepEqual(await invalidResponse.json(), {
      error: '/health does not support query parameter(s): verbose',
    });
  } finally {
    seeded.cleanup();
  }
});

test('cacheable API endpoints support ETag revalidation', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const app = createApp(seeded.database);

    await assertCacheRevalidation(app, '/');
    await assertCacheRevalidation(app, '/openapi.json');
    await assertCacheRevalidation(app, '/health');
    await assertCacheRevalidation(app, '/records/101');
    await assertCacheRevalidation(app, '/stats/summary');
    await assertCacheRevalidation(app, '/stats/dashboard?limit=1');
    await assertCacheRevalidation(app, '/filters?limit=1');
    await assertCacheRevalidation(
      app,
      '/filters?limit=1&dimensions=artist,format,genre',
    );
    await assertCacheRevalidation(app, '/stats/breakdowns/artist');
  } finally {
    seeded.cleanup();
  }
});

test('collection-version ETags short-circuit expensive filter queries on revalidation', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const seededApp = createApp(seeded.database);
    const initialResponse = await seededApp.request('/filters?limit=1');
    const etag = initialResponse.headers.get('etag');
    assert.ok(etag);

    let queryAllCalls = 0;
    const revalidationDatabase = Object.create(
      seeded.database,
    ) as typeof seeded.database;
    revalidationDatabase.queryOne = async <T>(sql: string) => {
      if (
        sql ===
        "SELECT value FROM sync_state WHERE key = 'last_successful_sync_at'"
      ) {
        return {
          value: '2026-04-23T10:00:00.000Z',
        } as T;
      }

      throw new Error('unexpected queryOne during revalidation');
    };
    revalidationDatabase.queryAll = async () => {
      queryAllCalls += 1;
      throw new Error('unexpected queryAll during revalidation');
    };

    const revalidationApp = createApp(revalidationDatabase);
    const revalidatedResponse = await revalidationApp.request(
      '/filters?limit=1',
      {
        headers: {
          'if-none-match': etag ?? '',
        },
      },
    );

    assert.equal(revalidatedResponse.status, 304);
    assert.equal(queryAllCalls, 0);
  } finally {
    seeded.cleanup();
  }
});

test('API validation errors include the endpoint that rejected extra query parameters', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const app = createApp(seeded.database);
    const cases = [
      {
        path: '/records/101?extra=true',
        error: '/records/:releaseId does not support query parameter(s): extra',
      },
      {
        path: '/stats/summary?extra=true',
        error: '/stats/summary does not support query parameter(s): extra',
      },
      {
        path: '/stats/dashboard?extra=true',
        error: '/stats/dashboard does not support query parameter(s): extra',
      },
      {
        path: '/filters?extra=true',
        error: '/filters does not support query parameter(s): extra',
      },
      {
        path: '/stats/breakdowns/artist?extra=true',
        error:
          '/stats/breakdowns/:dimension does not support query parameter(s): extra',
      },
    ];

    for (const { error, path } of cases) {
      const response = await app.request(path);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error });
    }
  } finally {
    seeded.cleanup();
  }
});

test('application error handler returns validation errors as 400 and unexpected errors as 500', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const validationFailureDatabase = Object.create(
      seeded.database,
    ) as typeof seeded.database;
    validationFailureDatabase.queryOne = async () => {
      throw new Error('releaseId must be a positive integer.');
    };
    const validationFailureApp = createApp(validationFailureDatabase);
    const validationFailureResponse =
      await validationFailureApp.request('/health');

    assert.equal(validationFailureResponse.status, 400);
    assert.deepEqual(await validationFailureResponse.json(), {
      error: 'releaseId must be a positive integer.',
    });

    const unexpectedFailureDatabase = Object.create(
      seeded.database,
    ) as typeof seeded.database;
    unexpectedFailureDatabase.queryOne = async () => {
      throw new Error('database offline');
    };
    const unexpectedFailureApp = createApp(unexpectedFailureDatabase);
    const unexpectedFailureResponse =
      await unexpectedFailureApp.request('/health');

    assert.equal(unexpectedFailureResponse.status, 500);
    assert.deepEqual(await unexpectedFailureResponse.json(), {
      error: 'database offline',
    });
  } finally {
    seeded.cleanup();
  }
});
