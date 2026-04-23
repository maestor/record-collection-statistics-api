import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type Database from 'better-sqlite3';

const migrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'db',
  'migrations',
);

export function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedNames = new Set<string>(
    (
      database
        .prepare('SELECT name FROM schema_migrations ORDER BY name')
        .all() as Array<{
        name: string;
      }>
    ).map((row) => row.name),
  );

  const migrationFiles = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const applyMigration = database.transaction((name: string, sql: string) => {
    database.exec(sql);
    database
      .prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)')
      .run(name, new Date().toISOString());
  });

  for (const migrationFile of migrationFiles) {
    if (appliedNames.has(migrationFile)) {
      continue;
    }

    const sql = readFileSync(join(migrationsDirectory, migrationFile), 'utf8');
    applyMigration(migrationFile, sql);
  }
}
