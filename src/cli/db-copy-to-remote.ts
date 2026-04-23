import { copyDatabaseContents } from '../db/copy.js';
import { runMigrations } from '../db/migrate.js';
import { loadRuntimeConfig } from '../lib/config.js';
import { openDatabase } from '../lib/database.js';

if (!process.argv.includes('--force')) {
  throw new Error(
    'db:copy-to-remote replaces the target Turso data. Re-run with --force to continue.',
  );
}

const config = loadRuntimeConfig();

const sourceDatabase = openDatabase({
  databasePath: config.databasePath,
});

const targetDatabase = openDatabase({
  databasePath: config.databasePath,
  useRemoteDb: true,
  ...(config.tursoAuthToken ? { tursoAuthToken: config.tursoAuthToken } : {}),
  ...(config.tursoDatabaseUrl
    ? { tursoDatabaseUrl: config.tursoDatabaseUrl }
    : {}),
});

try {
  await runMigrations(sourceDatabase);
  await runMigrations(targetDatabase);

  const summary = await copyDatabaseContents({
    source: sourceDatabase,
    target: targetDatabase,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        source: {
          databasePath: config.databasePath,
          protocol: sourceDatabase.protocol,
        },
        target: {
          protocol: targetDatabase.protocol,
          tursoDatabaseUrl: config.tursoDatabaseUrl ?? null,
        },
        ...summary,
      },
      null,
      2,
    ),
  );
} finally {
  sourceDatabase.close();
  targetDatabase.close();
}
