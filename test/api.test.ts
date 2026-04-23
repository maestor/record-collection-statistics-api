import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.js';
import { seedFixtureImport } from './helpers.js';

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
      data: Array<{ releaseId: number; title: string }>;
      meta: { total: number; totalPages: number };
    };

    assert.equal(payload.meta.total, 2);
    assert.equal(payload.meta.totalPages, 2);
    assert.equal(payload.data[0]?.releaseId, 202);
    assert.equal(payload.data[0]?.title, 'Moonlit Session');

    const secondResponse = await app.request(
      '/records?page_size=1&sort=title&order=asc',
      {
        headers: {
          'if-none-match': response.headers.get('etag') ?? '',
        },
      },
    );
    assert.equal(secondResponse.status, 304);
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

    const payload = (await response.json()) as {
      breakdownDimensions: string[];
      capabilities: {
        discogsOnRequestPath: boolean;
        importerBackedCache: boolean;
        readOnlyApi: boolean;
      };
      endpoints: {
        filters: string;
        health: string;
        recordDetail: string;
        records: string;
        statsBreakdown: string;
        statsDashboard: string;
        statsSummary: string;
      };
      service: string;
    };

    assert.equal(payload.service, 'record-collection-statistics-api');
    assert.equal(payload.capabilities.readOnlyApi, true);
    assert.equal(payload.capabilities.discogsOnRequestPath, false);
    assert.equal(payload.endpoints.statsDashboard, '/stats/dashboard?limit=10');
    assert.ok(payload.breakdownDimensions.includes('artist'));

    const invalidResponse = await app.request('/?limit=1');
    assert.equal(invalidResponse.status, 400);
  } finally {
    seeded.cleanup();
  }
});

test('GET /records validates sort options and supports artist filtering', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
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

    const invalidResponse = await app.request('/records?sort=unknown');
    assert.equal(invalidResponse.status, 400);

    const unknownQueryResponse = await app.request(
      '/records?artist=Alpha%20Artist&artst=oops',
    );
    assert.equal(unknownQueryResponse.status, 400);
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
        formats: Array<{ name: string }>;
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
    assert.equal(payload.data.formats[0]?.name, 'CD');
    assert.deepEqual(payload.data.genres, ['Rock']);
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
        totals: {
          collectionItems: number;
          releases: number;
          uniqueArtists: number;
        };
      };
    };
    assert.equal(summaryPayload.data.totals.collectionItems, 3);
    assert.equal(summaryPayload.data.totals.releases, 2);
    assert.equal(summaryPayload.data.totals.uniqueArtists, 2);

    const breakdownResponse = await app.request('/stats/breakdowns/artist');
    assert.equal(breakdownResponse.status, 200);
    const breakdownPayload = (await breakdownResponse.json()) as {
      data: Array<{ itemCount: number; releaseCount: number; value: string }>;
    };

    assert.deepEqual(breakdownPayload.data[0], {
      value: 'Alpha Artist',
      itemCount: 2,
      releaseCount: 1,
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
  } finally {
    seeded.cleanup();
  }
});
