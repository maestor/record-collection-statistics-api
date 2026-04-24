import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runMigrations } from '../src/db/migrate.js';
import { DatabaseClient, openDatabase } from '../src/lib/database.js';

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

test('DatabaseClient.withTransaction preserves the callback error when rollback fails', async () => {
  const database = new DatabaseClient({
    close() {},
    protocol: 'file',
    async execute() {
      throw new Error('not used');
    },
    async executeMultiple() {
      throw new Error('not used');
    },
    async transaction() {
      return {
        closed: false,
        close() {},
        async commit() {
          throw new Error('not used');
        },
        async execute() {
          throw new Error('not used');
        },
        async executeMultiple() {
          throw new Error('not used');
        },
        async rollback() {
          throw new Error('rollback failed');
        },
      };
    },
  } as unknown as ConstructorParameters<typeof DatabaseClient>[0]);

  await assert.rejects(
    () =>
      database.withTransaction(async () => {
        throw new Error('callback failed');
      }),
    /callback failed/,
  );
});

test('DatabaseClient.close delegates to the underlying client', () => {
  let closed = false;
  const database = new DatabaseClient({
    get protocol() {
      return 'file';
    },
    close() {
      closed = true;
    },
    async execute() {
      throw new Error('not used');
    },
    async executeMultiple() {
      throw new Error('not used');
    },
    async transaction() {
      throw new Error('not used');
    },
  } as unknown as ConstructorParameters<typeof DatabaseClient>[0]);

  database.close();

  assert.equal(closed, true);
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

test('runMigrations is idempotent after applying the schema once', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'discogs-db-test-'));
  const database = openDatabase({
    databasePath: join(directory, 'migrations.sqlite'),
  });

  try {
    await runMigrations(database);
    await runMigrations(database);

    const migrations = await database.queryAll<{ name: string }>(
      'SELECT name FROM schema_migrations ORDER BY name',
    );
    const releaseCount = await database.queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM releases',
    );

    assert.deepEqual(migrations, [{ name: '001_initial.sql' }]);
    assert.equal(releaseCount?.count, 0);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
