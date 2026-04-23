import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DatabaseClient } from '../lib/database.js';

const migrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'db',
  'migrations',
);

export async function runMigrations(database: DatabaseClient): Promise<void> {
  await database.executeMultiple(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedNames = new Set<string>(
    (
      await database.queryAll<{
        name: string;
      }>('SELECT name FROM schema_migrations ORDER BY name')
    ).map((row) => row.name),
  );

  const migrationFiles = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const migrationFile of migrationFiles) {
    if (appliedNames.has(migrationFile)) {
      continue;
    }

    const sql = readFileSync(join(migrationsDirectory, migrationFile), 'utf8');
    await database.withTransaction(async (transaction) => {
      await transaction.executeMultiple(sql);
      await transaction.execute(
        'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)',
        [migrationFile, new Date().toISOString()],
      );
    });
  }
}
