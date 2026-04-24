import type { InValue } from '@libsql/client';

import type { DatabaseClient, DatabaseSession } from '../lib/database.js';

interface CopyTableDefinition {
  columns: string[];
  name: string;
}

export interface DatabaseCopySummary {
  completedAt: string;
  rowsCopied: number;
  rowsByTable: Record<string, number>;
  startedAt: string;
  tablesCopied: number;
}

const copyTables: CopyTableDefinition[] = [
  {
    name: 'schema_migrations',
    columns: ['name', 'applied_at'],
  },
  {
    name: 'sync_runs',
    columns: [
      'id',
      'started_at',
      'completed_at',
      'status',
      'full_refresh',
      'username',
      'release_ttl_days',
      'pages_processed',
      'collection_items_seen',
      'releases_refreshed',
      'error_message',
    ],
  },
  {
    name: 'sync_state',
    columns: ['key', 'value', 'updated_at'],
  },
  {
    name: 'releases',
    columns: [
      'release_id',
      'master_id',
      'status',
      'title',
      'artists_sort',
      'release_year',
      'released',
      'country',
      'data_quality',
      'community_have',
      'community_want',
      'community_rating_count',
      'community_rating_average',
      'lowest_price',
      'num_for_sale',
      'thumb',
      'cover_image',
      'resource_url',
      'uri',
      'raw_json',
      'fetched_at',
      'stale_after',
    ],
  },
  {
    name: 'collection_fields',
    columns: [
      'field_id',
      'name',
      'field_type',
      'position',
      'is_public',
      'options_json',
      'lines',
      'raw_json',
      'updated_at',
    ],
  },
  {
    name: 'collection_items',
    columns: [
      'instance_id',
      'release_id',
      'folder_id',
      'rating',
      'date_added',
      'last_seen_sync_run_id',
      'raw_json',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'collection_item_field_values',
    columns: [
      'instance_id',
      'field_id',
      'value_text',
      'raw_json',
      'updated_at',
    ],
  },
  {
    name: 'release_artists',
    columns: [
      'release_id',
      'position',
      'artist_id',
      'name',
      'anv',
      'join_text',
      'role',
      'tracks',
      'resource_url',
      'thumbnail_url',
    ],
  },
  {
    name: 'release_labels',
    columns: [
      'release_id',
      'position',
      'label_id',
      'name',
      'catno',
      'entity_type',
      'entity_type_name',
      'resource_url',
      'thumbnail_url',
    ],
  },
  {
    name: 'release_formats',
    columns: [
      'release_id',
      'position',
      'name',
      'qty',
      'format_text',
      'descriptions_json',
    ],
  },
  {
    name: 'release_genres',
    columns: ['release_id', 'genre'],
  },
  {
    name: 'release_styles',
    columns: ['release_id', 'style'],
  },
  {
    name: 'release_identifiers',
    columns: [
      'release_id',
      'position',
      'identifier_type',
      'value',
      'description',
    ],
  },
  {
    name: 'release_tracks',
    columns: [
      'release_id',
      'position',
      'track_position',
      'track_type',
      'title',
      'duration',
      'extraartists_json',
    ],
  },
];

function quoteIdentifier(value: string): string {
  return `"${value}"`;
}

function buildDeleteSql(tableName: string): string {
  return `DELETE FROM ${quoteIdentifier(tableName)}`;
}

function buildSelectSql(table: CopyTableDefinition): string {
  return `SELECT ${table.columns.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(table.name)}`;
}

function buildInsertSql(table: CopyTableDefinition): string {
  const quotedColumns = table.columns.map(quoteIdentifier).join(', ');
  const placeholders = table.columns.map(() => '?').join(', ');

  return `INSERT INTO ${quoteIdentifier(table.name)} (${quotedColumns}) VALUES (${placeholders})`;
}

async function replaceTableRows(
  source: DatabaseClient,
  target: DatabaseSession,
  table: CopyTableDefinition,
): Promise<number> {
  const rows = await source.queryAll<Record<string, unknown>>(
    buildSelectSql(table),
  );
  await target.execute(buildDeleteSql(table.name));

  const insertSql = buildInsertSql(table);
  for (const row of rows) {
    await target.execute(
      insertSql,
      table.columns.map((column) => row[column] as InValue),
    );
  }

  return rows.length;
}

export async function copyDatabaseContents(options: {
  source: DatabaseClient;
  target: DatabaseClient;
}): Promise<DatabaseCopySummary> {
  const startedAt = new Date().toISOString();
  const rowsByTable: Record<string, number> = {};
  let rowsCopied = 0;

  await options.target.withTransaction(async (transaction) => {
    for (const table of [...copyTables].reverse()) {
      await transaction.execute(buildDeleteSql(table.name));
    }

    for (const table of copyTables) {
      const copiedRows = await replaceTableRows(
        options.source,
        transaction,
        table,
      );
      rowsByTable[table.name] = copiedRows;
      rowsCopied += copiedRows;
    }
  });

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    tablesCopied: copyTables.length,
    rowsCopied,
    rowsByTable,
  };
}
