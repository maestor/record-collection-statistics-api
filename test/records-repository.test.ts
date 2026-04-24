import assert from 'node:assert/strict';
import test from 'node:test';

import type { RecordsQueryInput } from '../src/http/validation.js';
import { RecordsRepository } from '../src/repositories/records-repository.js';
import { seedFixtureImport } from './helpers.js';

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
