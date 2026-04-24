import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { DatabaseClient } from '../src/lib/database.js';
import {
  createRequestHandler,
  createRuntimeApp,
  handleRequest,
  type RuntimeDependencies,
} from '../src/runtime.js';

test('createRuntimeApp can build the production runtime app against SQLite', async () => {
  const originalDatabasePath = process.env.DATABASE_PATH;
  const originalUseRemoteDb = process.env.USE_REMOTE_DB;
  const originalApiReadKey = process.env.API_READ_KEY;
  const directory = mkdtempSync(join(tmpdir(), 'discogs-runtime-test-'));

  try {
    process.env.DATABASE_PATH = join(directory, 'runtime.sqlite');
    process.env.USE_REMOTE_DB = 'false';
    delete process.env.API_READ_KEY;

    const app = await createRuntimeApp();
    const response = await app.fetch(new Request('http://localhost/health'));
    const payload = (await response.json()) as {
      database: {
        releaseCount: number;
        totalItems: number;
      };
      ok: boolean;
    };

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.database.totalItems, 0);
    assert.equal(payload.database.releaseCount, 0);
  } finally {
    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDatabasePath;
    }

    if (originalUseRemoteDb === undefined) {
      delete process.env.USE_REMOTE_DB;
    } else {
      process.env.USE_REMOTE_DB = originalUseRemoteDb;
    }

    if (originalApiReadKey === undefined) {
      delete process.env.API_READ_KEY;
    } else {
      process.env.API_READ_KEY = originalApiReadKey;
    }

    rmSync(directory, { recursive: true, force: true });
  }
});

test('handleRequest default export path delegates to the cached runtime app', async () => {
  const originalDatabasePath = process.env.DATABASE_PATH;
  const originalUseRemoteDb = process.env.USE_REMOTE_DB;
  const originalApiReadKey = process.env.API_READ_KEY;
  const directory = mkdtempSync(
    join(tmpdir(), 'discogs-runtime-handler-test-'),
  );

  try {
    process.env.DATABASE_PATH = join(directory, 'runtime.sqlite');
    process.env.USE_REMOTE_DB = 'false';
    delete process.env.API_READ_KEY;

    const response = await handleRequest(new Request('http://localhost/'));
    const payload = (await response.json()) as {
      service: string;
    };

    assert.equal(response.status, 200);
    assert.equal(payload.service, 'record-collection-statistics-api');
  } finally {
    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDatabasePath;
    }

    if (originalUseRemoteDb === undefined) {
      delete process.env.USE_REMOTE_DB;
    } else {
      process.env.USE_REMOTE_DB = originalUseRemoteDb;
    }

    if (originalApiReadKey === undefined) {
      delete process.env.API_READ_KEY;
    } else {
      process.env.API_READ_KEY = originalApiReadKey;
    }

    rmSync(directory, { recursive: true, force: true });
  }
});

test('createRuntimeApp wires config, migrations, database, and API read key', async () => {
  const database = {} as DatabaseClient;
  const calls: string[] = [];
  const dependencies: RuntimeDependencies = {
    buildDatabaseConnectionOptions(config) {
      calls.push('buildDatabaseConnectionOptions');
      assert.equal(config.apiReadKey, 'secret-read-key');
      assert.equal(config.databasePath, 'var/test.sqlite');
      return {
        databasePath: config.databasePath,
      };
    },
    createApp(receivedDatabase, options) {
      calls.push('createApp');
      assert.equal(receivedDatabase, database);
      assert.deepEqual(options, {
        apiReadKey: 'secret-read-key',
      });
      return {
        fetch: async () => new Response('ok'),
      } as Awaited<ReturnType<typeof createRuntimeApp>>;
    },
    loadRuntimeConfig() {
      calls.push('loadRuntimeConfig');
      return {
        apiReadKey: 'secret-read-key',
        databasePath: 'var/test.sqlite',
        port: 3000,
        useRemoteDb: false,
      };
    },
    openDatabase(options) {
      calls.push('openDatabase');
      assert.deepEqual(options, {
        databasePath: 'var/test.sqlite',
      });
      return database;
    },
    async runMigrations(receivedDatabase) {
      calls.push('runMigrations');
      assert.equal(receivedDatabase, database);
    },
  };

  const app = await createRuntimeApp(dependencies);
  const response = await app.fetch(new Request('https://example.test/'));

  assert.equal(await response.text(), 'ok');
  assert.deepEqual(calls, [
    'loadRuntimeConfig',
    'buildDatabaseConnectionOptions',
    'openDatabase',
    'runMigrations',
    'createApp',
  ]);
});

test('createRuntimeApp omits API read key when config does not provide one', async () => {
  const database = {} as DatabaseClient;
  const dependencies: RuntimeDependencies = {
    buildDatabaseConnectionOptions(config) {
      return {
        databasePath: config.databasePath,
      };
    },
    createApp(_database, options) {
      assert.deepEqual(options, {});
      return {
        fetch: async () => new Response('ok'),
      } as Awaited<ReturnType<typeof createRuntimeApp>>;
    },
    loadRuntimeConfig() {
      return {
        databasePath: 'var/test.sqlite',
        port: 3000,
        useRemoteDb: false,
      };
    },
    openDatabase() {
      return database;
    },
    async runMigrations() {},
  };

  await createRuntimeApp(dependencies);
});

test('createRequestHandler resolves the runtime app and delegates fetch', async () => {
  const request = new Request('https://example.test/health');
  const response = new Response('healthy', {
    status: 200,
  });
  let resolved = 0;

  const handler = createRequestHandler(async () => {
    resolved += 1;
    return {
      fetch(receivedRequest) {
        assert.equal(receivedRequest, request);
        return response;
      },
    } as Awaited<ReturnType<typeof createRuntimeApp>>;
  });

  assert.equal(await handler(request), response);
  assert.equal(resolved, 1);
});
