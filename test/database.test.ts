import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { openDatabase } from '../src/lib/database.js';

test('openDatabase creates parent directories and exposes local query helpers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'discogs-db-test-'));
  const databasePath = join(directory, 'nested', 'cache.sqlite');
  const database = openDatabase({
    databasePath,
  });

  try {
    assert.equal(database.protocol, 'file');
    assert.equal(existsSync(join(directory, 'nested')), true);

    await database.executeMultiple(`
      CREATE TABLE records (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL
      );
    `);
    await database.execute('INSERT INTO records (id, title) VALUES (?, ?)', [
      1,
      'Northern Lights',
    ]);

    assert.deepEqual(
      await database.queryAll<{ id: number; title: string }>(
        'SELECT id, title FROM records',
      ),
      [
        {
          id: 1,
          title: 'Northern Lights',
        },
      ],
    );
    assert.deepEqual(
      await database.queryOne<{ title: string }>(
        'SELECT title FROM records WHERE id = ?',
        [1],
      ),
      {
        title: 'Northern Lights',
      },
    );
    assert.equal(
      await database.queryOne<{ title: string }>(
        'SELECT title FROM records WHERE id = ?',
        [999],
      ),
      undefined,
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('DatabaseClient.withTransaction commits successful work and returns callback result', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'discogs-db-test-'));
  const database = openDatabase({
    databasePath: join(directory, 'commit.sqlite'),
  });

  try {
    await database.execute(
      'CREATE TABLE records (id INTEGER PRIMARY KEY, title TEXT NOT NULL)',
    );

    const result = await database.withTransaction(async (transaction) => {
      await transaction.execute(
        'INSERT INTO records (id, title) VALUES (?, ?)',
        [1, 'Committed'],
      );
      return 'done';
    });

    const rows = await database.queryAll<{ title: string }>(
      'SELECT title FROM records',
    );

    assert.equal(result, 'done');
    assert.deepEqual(rows, [{ title: 'Committed' }]);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('DatabaseClient.withTransaction rolls back failed work and rethrows', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'discogs-db-test-'));
  const database = openDatabase({
    databasePath: join(directory, 'rollback.sqlite'),
  });

  try {
    await database.execute(
      'CREATE TABLE records (id INTEGER PRIMARY KEY, title TEXT NOT NULL)',
    );

    await assert.rejects(
      () =>
        database.withTransaction(async (transaction) => {
          await transaction.execute(
            'INSERT INTO records (id, title) VALUES (?, ?)',
            [1, 'Rolled Back'],
          );
          throw new Error('stop transaction');
        }),
      /stop transaction/,
    );

    assert.deepEqual(
      await database.queryAll<{ title: string }>('SELECT title FROM records'),
      [],
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('openDatabase validates required remote database settings before connecting', () => {
  assert.throws(
    () =>
      openDatabase({
        databasePath: 'var/discogs.sqlite',
        useRemoteDb: true,
      }),
    /TURSO_DATABASE_URL is required when USE_REMOTE_DB is true\./,
  );

  assert.throws(
    () =>
      openDatabase({
        databasePath: 'var/discogs.sqlite',
        tursoDatabaseUrl: 'libsql://example.turso.io',
        useRemoteDb: true,
      }),
    /TURSO_AUTH_TOKEN is required when USE_REMOTE_DB is true\./,
  );
});
