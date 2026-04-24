import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDatabaseConnectionOptions,
  loadDiscogsImportConfig,
  loadRuntimeConfig,
} from '../src/lib/config.js';

const managedEnvKeys = [
  'API_READ_KEY',
  'DATABASE_PATH',
  'DISCOGS_ACCESS_TOKEN',
  'DISCOGS_BASE_URL',
  'DISCOGS_MIN_INTERVAL_MS',
  'DISCOGS_RELEASE_TTL_DAYS',
  'DISCOGS_USER_AGENT',
  'PORT',
  'TURSO_AUTH_TOKEN',
  'TURSO_DATABASE_URL',
  'USE_REMOTE_DB',
] as const;

function withEnv<T>(
  updates: Partial<Record<(typeof managedEnvKeys)[number], string | undefined>>,
  callback: () => T,
): T {
  const original = new Map(
    managedEnvKeys.map((key) => [key, process.env[key]] as const),
  );

  try {
    for (const key of managedEnvKeys) {
      delete process.env[key];
    }

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }

    return callback();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('loadRuntimeConfig applies defaults and trims optional remote settings', () => {
  withEnv(
    {
      API_READ_KEY: '  read-key  ',
      PORT: '4321',
      TURSO_AUTH_TOKEN: '  turso-token  ',
      TURSO_DATABASE_URL: '  libsql://example.turso.io  ',
      USE_REMOTE_DB: 'yes',
    },
    () => {
      assert.deepEqual(loadRuntimeConfig(), {
        apiReadKey: 'read-key',
        databasePath: 'var/discogs.sqlite',
        port: 4321,
        tursoAuthToken: 'turso-token',
        tursoDatabaseUrl: 'libsql://example.turso.io',
        useRemoteDb: true,
      });
    },
  );
});

test('loadRuntimeConfig rejects malformed runtime environment values', () => {
  withEnv(
    {
      PORT: 'not-a-port',
    },
    () => {
      assert.throws(
        () => loadRuntimeConfig(),
        /Environment variable PORT must be an integer\./,
      );
    },
  );

  withEnv(
    {
      USE_REMOTE_DB: 'sometimes',
    },
    () => {
      assert.throws(
        () => loadRuntimeConfig(),
        /Environment variable USE_REMOTE_DB must be a boolean\./,
      );
    },
  );
});

test('loadDiscogsImportConfig validates importer secrets and applies importer defaults', () => {
  withEnv(
    {
      DATABASE_PATH: 'var/import.sqlite',
      DISCOGS_ACCESS_TOKEN: 'token',
      DISCOGS_USER_AGENT: 'agent',
      USE_REMOTE_DB: 'off',
    },
    () => {
      assert.deepEqual(loadDiscogsImportConfig(), {
        databasePath: 'var/import.sqlite',
        discogsAccessToken: 'token',
        discogsBaseUrl: 'https://api.discogs.com',
        discogsUserAgent: 'agent',
        minIntervalMs: 1100,
        port: 3000,
        releaseTtlDays: 30,
        useRemoteDb: false,
      });
    },
  );

  withEnv(
    {
      DISCOGS_ACCESS_TOKEN: '',
    },
    () => {
      assert.throws(
        () => loadDiscogsImportConfig(),
        /Environment variable DISCOGS_ACCESS_TOKEN is required\./,
      );
    },
  );
});

test('buildDatabaseConnectionOptions preserves configured remote database settings', () => {
  assert.deepEqual(
    buildDatabaseConnectionOptions({
      databasePath: 'var/discogs.sqlite',
      port: 3000,
      tursoAuthToken: 'token',
      tursoDatabaseUrl: 'libsql://example.turso.io',
      useRemoteDb: true,
    }),
    {
      databasePath: 'var/discogs.sqlite',
      tursoAuthToken: 'token',
      tursoDatabaseUrl: 'libsql://example.turso.io',
      useRemoteDb: true,
    },
  );
});
