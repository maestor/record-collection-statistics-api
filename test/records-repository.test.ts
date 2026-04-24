import assert from 'node:assert/strict';
import test from 'node:test';

import type { RecordsQueryInput } from '../src/http/validation.js';
import { RecordsRepository } from '../src/repositories/records-repository.js';
import { createTempDatabase, seedFixtureImport } from './helpers.js';

function recordsQuery(
  overrides: Partial<RecordsQueryInput> = {},
): RecordsQueryInput {
  return {
    order: 'asc',
    page: 1,
    pageSize: 10,
    sort: 'title',
    ...overrides,
  };
}

async function insertCollectedRelease(
  database: Awaited<ReturnType<typeof createTempDatabase>>['database'],
  input: {
    artistName: string;
    country: string;
    dateAdded: string;
    instanceId: number;
    labelName: string;
    releaseId: number;
    releaseYear: number;
    title: string;
  },
): Promise<void> {
  await database.execute(
    `
      INSERT INTO releases (
        release_id,
        title,
        artists_sort,
        release_year,
        country,
        raw_json,
        fetched_at,
        stale_after
      ) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)
    `,
    [
      input.releaseId,
      input.title,
      input.artistName,
      input.releaseYear,
      input.country,
      input.dateAdded,
      input.dateAdded,
    ],
  );
  await database.execute(
    `
      INSERT INTO collection_items (
        instance_id,
        release_id,
        folder_id,
        rating,
        date_added,
        raw_json,
        created_at,
        updated_at
      ) VALUES (?, ?, 0, 0, ?, '{}', ?, ?)
    `,
    [
      input.instanceId,
      input.releaseId,
      input.dateAdded,
      input.dateAdded,
      input.dateAdded,
    ],
  );
  await database.execute(
    `
      INSERT INTO release_artists (release_id, position, name)
      VALUES (?, 0, ?)
    `,
    [input.releaseId, input.artistName],
  );
  await database.execute(
    `
      INSERT INTO release_labels (release_id, position, name)
      VALUES (?, 0, ?)
    `,
    [input.releaseId, input.labelName],
  );
}

test('RecordsRepository filters records across the supported query facets', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const repository = new RecordsRepository(seeded.database);
    const cases: Array<{
      expectedReleaseIds: number[];
      query: Partial<RecordsQueryInput>;
    }> = [
      {
        query: { q: 'Moonlit' },
        expectedReleaseIds: [202],
      },
      {
        query: { q: 'Aurora Audio' },
        expectedReleaseIds: [101],
      },
      {
        query: { label: 'Moon Records' },
        expectedReleaseIds: [202],
      },
      {
        query: { genre: 'Rock' },
        expectedReleaseIds: [101],
      },
      {
        query: { style: 'Fusion' },
        expectedReleaseIds: [202],
      },
      {
        query: { format: 'Vinyl' },
        expectedReleaseIds: [202],
      },
      {
        query: { country: 'finland' },
        expectedReleaseIds: [101],
      },
      {
        query: { yearFrom: 2000 },
        expectedReleaseIds: [202],
      },
      {
        query: { yearTo: 2000 },
        expectedReleaseIds: [101],
      },
      {
        query: { addedFrom: '2024-03-01T00:00:00.000Z' },
        expectedReleaseIds: [101],
      },
      {
        query: { addedTo: '2024-02-01T00:00:00.000Z' },
        expectedReleaseIds: [101],
      },
    ];

    for (const { expectedReleaseIds, query } of cases) {
      const fullQuery = recordsQuery(query);
      const records = await repository.listRecords(fullQuery);
      const total = await repository.countRecords(fullQuery);

      assert.deepEqual(
        records.map((record) => record.releaseId),
        expectedReleaseIds,
      );
      assert.equal(total, expectedReleaseIds.length);
    }
  } finally {
    seeded.cleanup();
  }
});

test('RecordsRepository applies each supported sort expression', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const repository = new RecordsRepository(seeded.database);
    const cases: Array<{
      expectedReleaseIds: number[];
      query: Pick<RecordsQueryInput, 'order' | 'sort'>;
    }> = [
      {
        query: { sort: 'artist', order: 'asc' },
        expectedReleaseIds: [101, 202],
      },
      {
        query: { sort: 'date_added', order: 'asc' },
        expectedReleaseIds: [202, 101],
      },
      {
        query: { sort: 'lowest_price', order: 'desc' },
        expectedReleaseIds: [202, 101],
      },
      {
        query: { sort: 'release_year', order: 'desc' },
        expectedReleaseIds: [202, 101],
      },
      {
        query: { sort: 'title', order: 'asc' },
        expectedReleaseIds: [202, 101],
      },
    ];

    for (const { expectedReleaseIds, query } of cases) {
      const records = await repository.listRecords(recordsQuery(query));

      assert.deepEqual(
        records.map((record) => record.releaseId),
        expectedReleaseIds,
      );
    }
  } finally {
    seeded.cleanup();
  }
});

test('RecordsRepository applies pagination offsets and maps list item aggregates', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    await insertCollectedRelease(seeded.database, {
      releaseId: 303,
      instanceId: 3001,
      title: 'Zenith Echo',
      artistName: 'Gamma Trio',
      labelName: 'Summit Sound',
      country: 'Norway',
      releaseYear: 2010,
      dateAdded: '2024-04-01T00:00:00.000Z',
    });

    const repository = new RecordsRepository(seeded.database);
    const records = await repository.listRecords(
      recordsQuery({
        page: 2,
        pageSize: 2,
        sort: 'title',
        order: 'asc',
      }),
    );

    assert.equal(records.length, 1);
    assert.equal(records[0]?.releaseId, 303);

    const northernLightsRecords = await repository.listRecords(
      recordsQuery({
        page: 2,
        pageSize: 1,
        sort: 'title',
        order: 'asc',
      }),
    );
    assert.deepEqual(northernLightsRecords[0], {
      releaseId: 101,
      title: 'Northern Lights',
      artistsSort: 'Alpha Artist',
      releaseYear: 1999,
      country: 'Finland',
      thumb: 'https://example.test/release-101-thumb.jpg',
      instanceCount: 2,
      dateAdded: '2024-01-10T15:00:00.000Z',
      formats: [
        {
          name: 'CD',
          descriptions: ['Album'],
          freeText: null,
        },
      ],
    });
  } finally {
    seeded.cleanup();
  }
});

test('RecordsRepository preserves nullable list and detail fields', async () => {
  const { database, cleanup } = await createTempDatabase();

  try {
    await database.execute(
      `
        INSERT INTO releases (
          release_id,
          title,
          raw_json,
          fetched_at,
          stale_after
        ) VALUES (505, 'Nullable Detail', '{}', ?, ?)
      `,
      ['2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'],
    );
    await database.execute(
      `
        INSERT INTO collection_items (
          instance_id,
          release_id,
          folder_id,
          rating,
          date_added,
          raw_json,
          created_at,
          updated_at
        ) VALUES (5001, 505, 0, 0, ?, '{}', ?, ?)
      `,
      [
        '2024-01-02T00:00:00.000Z',
        '2024-01-02T00:00:00.000Z',
        '2024-01-02T00:00:00.000Z',
      ],
    );
    await database.execute(
      `
        INSERT INTO release_artists (release_id, position, name)
        VALUES (505, 0, 'Anonymous Artist')
      `,
    );
    await database.execute(
      `
        INSERT INTO release_labels (release_id, position, name)
        VALUES (505, 0, 'White Label')
      `,
    );

    const repository = new RecordsRepository(database);
    const records = await repository.listRecords(recordsQuery());
    const detail = await repository.getRecordDetail(505);

    assert.deepEqual(records[0], {
      releaseId: 505,
      title: 'Nullable Detail',
      artistsSort: null,
      releaseYear: null,
      country: null,
      thumb: null,
      instanceCount: 1,
      dateAdded: '2024-01-02T00:00:00.000Z',
      formats: [],
    });
    assert.ok(detail);
    assert.equal(detail.numForSale, null);
    assert.deepEqual(detail.community, {
      have: null,
      want: null,
      ratingCount: null,
      ratingAverage: null,
    });
    assert.equal(detail.artists[0]?.artistId, null);
    assert.equal(detail.labels[0]?.labelId, null);
  } finally {
    cleanup();
  }
});

test('RecordsRepository treats wildcard query characters as literal search text', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    await insertCollectedRelease(seeded.database, {
      releaseId: 303,
      instanceId: 3001,
      title: String.raw`100% Pure _Back\Slash`,
      artistName: 'Wildcard Artist',
      labelName: 'Literal Label',
      country: 'Iceland',
      releaseYear: 2010,
      dateAdded: '2024-04-01T00:00:00.000Z',
    });

    const repository = new RecordsRepository(seeded.database);
    for (const q of ['%', '_', '\\']) {
      const records = await repository.listRecords(recordsQuery({ q }));
      const total = await repository.countRecords(recordsQuery({ q }));

      assert.deepEqual(
        records.map((record) => record.releaseId),
        [303],
      );
      assert.equal(total, 1);
    }
  } finally {
    seeded.cleanup();
  }
});

test('RecordsRepository excludes releases that are not in the collection cache', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    await seeded.database.execute(
      `
        INSERT INTO releases (
          release_id,
          title,
          artists_sort,
          release_year,
          country,
          raw_json,
          fetched_at,
          stale_after
        ) VALUES (909, 'Archive Only', 'Hidden Artist', 1901, 'Norway', '{}', ?, ?)
      `,
      ['2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'],
    );

    const repository = new RecordsRepository(seeded.database);
    const query = recordsQuery({ q: 'Archive Only' });
    const summary = await repository.getStatsSummary();

    assert.equal(await repository.countRecords(query), 0);
    assert.deepEqual(await repository.listRecords(query), []);
    assert.equal(await repository.getRecordDetail(909), null);
    assert.deepEqual(summary.releaseYearRange, { min: 1999, max: 2005 });
  } finally {
    seeded.cleanup();
  }
});

test('RecordsRepository hydrates full record details in stable order', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const repository = new RecordsRepository(seeded.database);
    const detail = await repository.getRecordDetail(101);

    assert.ok(detail);
    assert.equal(detail.releaseId, 101);
    assert.equal(detail.title, 'Northern Lights');
    assert.equal(detail.artistsSort, 'Alpha Artist');
    assert.equal(detail.releaseYear, 1999);
    assert.equal(detail.country, 'Finland');
    assert.equal(detail.dateAdded, '2024-01-10T15:00:00.000Z');
    assert.equal(
      detail.coverImage,
      'https://example.test/release-101-cover.jpg',
    );
    assert.equal(detail.status, 'Accepted');
    assert.equal(detail.released, '1999-10-01');
    assert.equal(detail.resourceUrl, 'https://api.discogs.com/releases/101');
    assert.equal(
      detail.uri,
      'https://www.discogs.com/release/101-northern-lights',
    );
    assert.equal(detail.dataQuality, 'Correct');
    assert.equal(detail.fetchedAt, '2026-04-23T10:00:00.000Z');
    assert.equal(detail.numForSale, 2);
    assert.deepEqual(detail.community, {
      have: 85,
      want: 12,
      ratingCount: 20,
      ratingAverage: 4.7,
    });
    assert.deepEqual(detail.artists, [
      {
        position: 0,
        artistId: 301,
        name: 'Alpha Artist',
        role: '',
      },
    ]);
    assert.deepEqual(detail.labels, [
      {
        position: 0,
        labelId: 501,
        name: 'Aurora Audio',
        catno: 'AA-101',
      },
    ]);
    assert.deepEqual(detail.formats, [
      {
        name: 'CD',
        descriptions: ['Album'],
        freeText: null,
      },
    ]);
    assert.deepEqual(detail.identifiers, [
      {
        type: 'Barcode',
        value: '1234567890123',
        description: 'Text',
      },
    ]);
    assert.deepEqual(detail.tracks, [
      {
        position: 'A1',
        type: 'track',
        title: 'Polar Night',
        duration: '4:05',
      },
      {
        position: 'A2',
        type: 'track',
        title: 'Morning Snow',
        duration: '3:45',
      },
    ]);
    assert.deepEqual(detail.genres, ['Rock']);
    assert.deepEqual(detail.styles, ['Indie Rock']);
    assert.deepEqual(
      detail.collectionItems.map((item) => ({
        instanceId: item.instanceId,
        folderId: item.folderId,
        rating: item.rating,
        dateAdded: item.dateAdded,
        fieldValues: item.fieldValues,
      })),
      [
        {
          instanceId: 1001,
          folderId: 0,
          rating: 4,
          dateAdded: '2024-01-10T15:00:00.000Z',
          fieldValues: [
            {
              fieldId: 1,
              fieldName: 'Media Condition',
              value: 'Near Mint (NM or M-)',
            },
            {
              fieldId: 2,
              fieldName: 'Sleeve Condition',
              value: 'Very Good Plus (VG+)',
            },
          ],
        },
        {
          instanceId: 1002,
          folderId: 0,
          rating: 0,
          dateAdded: '2024-03-05T00:00:00.000Z',
          fieldValues: [
            {
              fieldId: 1,
              fieldName: 'Media Condition',
              value: 'Very Good Plus (VG+)',
            },
          ],
        },
      ],
    );
  } finally {
    seeded.cleanup();
  }
});

test('RecordsRepository returns complete summary and breakdown dimensions', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const repository = new RecordsRepository(seeded.database);
    const summary = await repository.getStatsSummary();

    assert.deepEqual(summary, {
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
      releaseYearRange: {
        min: 1999,
        max: 2005,
      },
    });

    assert.deepEqual(await repository.getBreakdown('artist'), [
      { value: 'Alpha Artist', itemCount: 2, releaseCount: 1 },
      { value: 'Beta Ensemble', itemCount: 1, releaseCount: 1 },
    ]);
    assert.deepEqual(await repository.getBreakdown('label'), [
      { value: 'Aurora Audio', itemCount: 2, releaseCount: 1 },
      { value: 'Moon Records', itemCount: 1, releaseCount: 1 },
    ]);
    assert.deepEqual(await repository.getBreakdown('format'), [
      { value: 'CD', itemCount: 2, releaseCount: 1 },
      { value: 'Vinyl', itemCount: 1, releaseCount: 1 },
    ]);
    assert.deepEqual(await repository.getBreakdown('genre'), [
      { value: 'Rock', itemCount: 2, releaseCount: 1 },
      { value: 'Jazz', itemCount: 1, releaseCount: 1 },
    ]);
    assert.deepEqual(await repository.getBreakdown('style'), [
      { value: 'Indie Rock', itemCount: 2, releaseCount: 1 },
      { value: 'Fusion', itemCount: 1, releaseCount: 1 },
    ]);
    assert.deepEqual(await repository.getBreakdown('country'), [
      { value: 'Finland', itemCount: 2, releaseCount: 1 },
      { value: 'Sweden', itemCount: 1, releaseCount: 1 },
    ]);
    assert.deepEqual(await repository.getBreakdown('release_year'), [
      { value: '1999', itemCount: 2, releaseCount: 1 },
      { value: '2005', itemCount: 1, releaseCount: 1 },
    ]);
    assert.deepEqual(await repository.getBreakdown('added_year'), [
      { value: '2024', itemCount: 3, releaseCount: 2 },
    ]);
    assert.deepEqual(await repository.getBreakdown('artist', { limit: 1 }), [
      { value: 'Alpha Artist', itemCount: 2, releaseCount: 1 },
    ]);
  } finally {
    seeded.cleanup();
  }
});

test('RecordsRepository composes filter catalog and dashboard limits intentionally', async () => {
  const seeded = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  try {
    const repository = new RecordsRepository(seeded.database);
    const catalog = await repository.getFilterCatalog(1);
    const dashboard = await repository.getDashboardStats(1);

    assert.deepEqual(catalog.ranges, {
      added: {
        first: '2024-01-10T15:00:00.000Z',
        last: '2024-03-05T00:00:00.000Z',
      },
      releaseYears: {
        min: 1999,
        max: 2005,
      },
    });
    assert.deepEqual(catalog.artists, [
      { value: 'Alpha Artist', itemCount: 2, releaseCount: 1 },
    ]);
    assert.deepEqual(catalog.labels, [
      { value: 'Aurora Audio', itemCount: 2, releaseCount: 1 },
    ]);
    assert.deepEqual(catalog.formats, [
      { value: 'CD', itemCount: 2, releaseCount: 1 },
    ]);
    assert.deepEqual(catalog.genres, [
      { value: 'Rock', itemCount: 2, releaseCount: 1 },
    ]);
    assert.deepEqual(catalog.styles, [
      { value: 'Indie Rock', itemCount: 2, releaseCount: 1 },
    ]);
    assert.deepEqual(catalog.countries, [
      { value: 'Finland', itemCount: 2, releaseCount: 1 },
    ]);
    assert.deepEqual(catalog.releaseYears, [
      { value: '1999', itemCount: 2, releaseCount: 1 },
    ]);
    assert.deepEqual(catalog.addedYears, [
      { value: '2024', itemCount: 3, releaseCount: 2 },
    ]);
    assert.deepEqual(dashboard.summary, await repository.getStatsSummary());
    assert.deepEqual(dashboard.topArtists, [
      { value: 'Alpha Artist', itemCount: 2, releaseCount: 1 },
    ]);
    assert.deepEqual(dashboard.labels, [
      { value: 'Aurora Audio', itemCount: 2, releaseCount: 1 },
    ]);
    assert.deepEqual(dashboard.formats, [
      { value: 'CD', itemCount: 2, releaseCount: 1 },
    ]);
    assert.deepEqual(dashboard.genres, [
      { value: 'Rock', itemCount: 2, releaseCount: 1 },
    ]);
    assert.deepEqual(dashboard.styles, [
      { value: 'Indie Rock', itemCount: 2, releaseCount: 1 },
    ]);
    assert.deepEqual(dashboard.countries, [
      { value: 'Finland', itemCount: 2, releaseCount: 1 },
    ]);
    assert.deepEqual(dashboard.addedYears, [
      { value: '2024', itemCount: 3, releaseCount: 2 },
    ]);
  } finally {
    seeded.cleanup();
  }
});

test('RecordsRepository limits added-year filter catalog values', async () => {
  const { database, cleanup } = await createTempDatabase();

  try {
    await insertCollectedRelease(database, {
      releaseId: 101,
      instanceId: 1001,
      title: 'Older Addition',
      artistName: 'Alpha Artist',
      labelName: 'Alpha Label',
      country: 'Finland',
      releaseYear: 1999,
      dateAdded: '2023-12-31T00:00:00.000Z',
    });
    await insertCollectedRelease(database, {
      releaseId: 202,
      instanceId: 2001,
      title: 'Newer Addition',
      artistName: 'Beta Artist',
      labelName: 'Beta Label',
      country: 'Sweden',
      releaseYear: 2005,
      dateAdded: '2024-01-01T00:00:00.000Z',
    });

    const repository = new RecordsRepository(database);
    const catalog = await repository.getFilterCatalog(1);

    assert.deepEqual(catalog.addedYears, [
      { value: '2023', itemCount: 1, releaseCount: 1 },
    ]);
  } finally {
    cleanup();
  }
});

test('RecordsRepository returns empty-cache defaults', async () => {
  const { database, cleanup } = await createTempDatabase();

  try {
    const repository = new RecordsRepository(database);

    assert.equal(await repository.countRecords(recordsQuery()), 0);
    assert.deepEqual(await repository.listRecords(recordsQuery()), []);
    assert.equal(await repository.getRecordDetail(101), null);
    assert.deepEqual(await repository.getStatsSummary(), {
      totals: {
        collectionItems: 0,
        releases: 0,
        uniqueArtists: 0,
        labels: 0,
        genres: 0,
        styles: 0,
      },
      addedRange: {
        first: null,
        last: null,
      },
      releaseYearRange: {
        min: null,
        max: null,
      },
    });
    assert.deepEqual(await repository.getBreakdown('artist'), []);
    assert.deepEqual(await repository.getFilterCatalog(1), {
      artists: [],
      labels: [],
      formats: [],
      genres: [],
      styles: [],
      countries: [],
      releaseYears: [],
      addedYears: [],
      ranges: {
        added: {
          first: null,
          last: null,
        },
        releaseYears: {
          min: null,
          max: null,
        },
      },
    });
    assert.deepEqual(await repository.getHealthSnapshot(), {
      lastSuccessfulSyncAt: null,
      totalItems: 0,
      releaseCount: 0,
    });
  } finally {
    cleanup();
  }
});
