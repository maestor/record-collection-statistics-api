import assert from 'node:assert/strict';
import test from 'node:test';

import { copyDatabaseContents } from '../src/db/copy.js';
import { RecordsRepository } from '../src/repositories/records-repository.js';
import { createTempDatabase, seedFixtureImport } from './helpers.js';

test('copyDatabaseContents bootstraps a fresh target database from local data', async () => {
  const source = await seedFixtureImport({
    now: () => new Date('2026-04-23T10:00:00.000Z'),
  });
  const target = await createTempDatabase();

  try {
    const summary = await copyDatabaseContents({
      source: source.database,
      target: target.database,
    });
    const repository = new RecordsRepository(target.database);
    const stats = await repository.getStatsSummary();
    const record = await repository.getRecordDetail(101);
    const health = await repository.getHealthSnapshot();

    assert.equal(summary.tablesCopied, 14);
    assert.equal(summary.rowsByTable.collection_items, 3);
    assert.equal(summary.rowsByTable.releases, 2);
    assert.equal(stats.totals.collectionItems, 3);
    assert.equal(stats.totals.releases, 2);
    assert.equal(record?.title, 'Northern Lights');
    assert.equal(record?.collectionItems.length, 2);
    assert.equal(health.lastSuccessfulSyncAt, '2026-04-23T10:00:00.000Z');
  } finally {
    source.cleanup();
    target.cleanup();
  }
});
