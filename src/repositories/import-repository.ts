import type {
  NormalizedCollectionField,
  NormalizedCollectionFieldValue,
  NormalizedCollectionItem,
  NormalizedCollectionValue,
  NormalizedReleaseDetail,
} from '../importer/mappers.js';
import type { DatabaseClient } from '../lib/database.js';

export interface SyncRunRecord {
  id: number;
  startedAt: string;
}

export class ImportRepository {
  private readonly database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.database = database;
  }

  async startSyncRun(input: {
    fullRefresh: boolean;
    releaseTtlDays: number;
    startedAt: string;
  }): Promise<SyncRunRecord> {
    const result = await this.database.execute(
      `
        INSERT INTO sync_runs (
          started_at,
          status,
          full_refresh,
          release_ttl_days
        ) VALUES (?, 'running', ?, ?)
      `,
      [input.startedAt, input.fullRefresh ? 1 : 0, input.releaseTtlDays],
    );

    return {
      id: Number(result.lastInsertRowid),
      startedAt: input.startedAt,
    };
  }

  async upsertCollectionFields(
    fields: NormalizedCollectionField[],
  ): Promise<void> {
    await this.database.withTransaction(async (transaction) => {
      for (const field of fields) {
        await transaction.execute(
          `
            INSERT INTO collection_fields (
              field_id,
              name,
              field_type,
              position,
              is_public,
              options_json,
              lines,
              raw_json,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(field_id) DO UPDATE SET
              name = excluded.name,
              field_type = excluded.field_type,
              position = excluded.position,
              is_public = excluded.is_public,
              options_json = excluded.options_json,
              lines = excluded.lines,
              raw_json = excluded.raw_json,
              updated_at = excluded.updated_at
          `,
          [
            field.fieldId,
            field.name,
            field.fieldType,
            field.position,
            field.isPublic,
            field.optionsJson,
            field.lines,
            field.rawJson,
            field.updatedAt,
          ],
        );
      }
    });
  }

  async upsertCollectionItems(
    items: NormalizedCollectionItem[],
    fieldValuesByInstance: Map<number, NormalizedCollectionFieldValue[]>,
  ): Promise<void> {
    await this.database.withTransaction(async (transaction) => {
      for (const item of items) {
        await transaction.execute(
          `
            INSERT INTO collection_items (
              instance_id,
              release_id,
              folder_id,
              rating,
              date_added,
              last_seen_sync_run_id,
              raw_json,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(instance_id) DO UPDATE SET
              release_id = excluded.release_id,
              folder_id = excluded.folder_id,
              rating = excluded.rating,
              date_added = excluded.date_added,
              last_seen_sync_run_id = excluded.last_seen_sync_run_id,
              raw_json = excluded.raw_json,
              updated_at = excluded.updated_at
          `,
          [
            item.instanceId,
            item.releaseId,
            item.folderId,
            item.rating,
            item.dateAdded,
            item.lastSeenSyncRunId,
            item.rawJson,
            item.createdAt,
            item.updatedAt,
          ],
        );

        await transaction.execute(
          'DELETE FROM collection_item_field_values WHERE instance_id = ?',
          [item.instanceId],
        );

        const fieldValues = fieldValuesByInstance.get(
          item.instanceId,
        ) as NormalizedCollectionFieldValue[];

        for (const value of fieldValues) {
          await transaction.execute(
            `
              INSERT INTO collection_item_field_values (
                instance_id,
                field_id,
                value_text,
                raw_json,
                updated_at
              ) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(instance_id, field_id) DO UPDATE SET
                value_text = excluded.value_text,
                raw_json = excluded.raw_json,
                updated_at = excluded.updated_at
            `,
            [
              value.instanceId,
              value.fieldId,
              value.valueText,
              value.rawJson,
              value.updatedAt,
            ],
          );
        }
      }
    });
  }

  async updateRunProgress(
    runId: number,
    values: {
      itemsSeenDelta?: number;
      pagesProcessedDelta?: number;
      releasesRefreshedDelta?: number;
      username?: string;
    },
  ): Promise<void> {
    await this.database.execute(
      `
        UPDATE sync_runs
        SET
          username = COALESCE(?, username),
          pages_processed = pages_processed + ?,
          collection_items_seen = collection_items_seen + ?,
          releases_refreshed = releases_refreshed + ?
        WHERE id = ?
      `,
      [
        values.username ?? null,
        values.pagesProcessedDelta ?? 0,
        values.itemsSeenDelta ?? 0,
        values.releasesRefreshedDelta ?? 0,
        runId,
      ],
    );
  }

  async setRunCollectionValue(
    runId: number,
    value: NormalizedCollectionValue,
  ): Promise<void> {
    await this.database.execute(
      `
        UPDATE sync_runs
        SET
          collection_value_minimum = ?,
          collection_value_median = ?,
          collection_value_maximum = ?
        WHERE id = ?
      `,
      [value.minimum, value.median, value.maximum, runId],
    );
  }

  async listReleaseIdsSeenInRun(runId: number): Promise<number[]> {
    const rows = await this.database.queryAll<{ release_id: number }>(
      `
        SELECT DISTINCT release_id
        FROM collection_items
        WHERE last_seen_sync_run_id = ?
        ORDER BY release_id
      `,
      [runId],
    );

    return rows.map((row) => Number(row.release_id));
  }

  async listReleaseIdsNeedingRefresh(
    releaseIds: number[],
    referenceIso: string,
  ): Promise<number[]> {
    const matchingReleaseIds: number[] = [];

    for (const releaseId of releaseIds) {
      const row = await this.database.queryOne<{ stale_after: string | null }>(
        'SELECT stale_after FROM releases WHERE release_id = ?',
        [releaseId],
      );
      if (!row?.stale_after || row.stale_after <= referenceIso) {
        matchingReleaseIds.push(releaseId);
      }
    }

    return matchingReleaseIds;
  }

  async upsertRelease(
    normalizedRelease: NormalizedReleaseDetail,
  ): Promise<void> {
    await this.database.withTransaction(async (transaction) => {
      await transaction.execute(
        `
          INSERT INTO releases (
            release_id,
            master_id,
            status,
            title,
            artists_sort,
            release_year,
            released,
            country,
            data_quality,
            community_have,
            community_want,
            community_rating_count,
            community_rating_average,
            lowest_price,
            num_for_sale,
            thumb,
            cover_image,
            resource_url,
            uri,
            raw_json,
            fetched_at,
            stale_after
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(release_id) DO UPDATE SET
            master_id = excluded.master_id,
            status = excluded.status,
            title = excluded.title,
            artists_sort = excluded.artists_sort,
            release_year = excluded.release_year,
            released = excluded.released,
            country = excluded.country,
            data_quality = excluded.data_quality,
            community_have = excluded.community_have,
            community_want = excluded.community_want,
            community_rating_count = excluded.community_rating_count,
            community_rating_average = excluded.community_rating_average,
            lowest_price = excluded.lowest_price,
            num_for_sale = excluded.num_for_sale,
            thumb = excluded.thumb,
            cover_image = excluded.cover_image,
            resource_url = excluded.resource_url,
            uri = excluded.uri,
            raw_json = excluded.raw_json,
            fetched_at = excluded.fetched_at,
            stale_after = excluded.stale_after
        `,
        [
          normalizedRelease.releaseId,
          normalizedRelease.masterId,
          normalizedRelease.status,
          normalizedRelease.title,
          normalizedRelease.artistsSort,
          normalizedRelease.releaseYear,
          normalizedRelease.released,
          normalizedRelease.country,
          normalizedRelease.dataQuality,
          normalizedRelease.communityHave,
          normalizedRelease.communityWant,
          normalizedRelease.communityRatingCount,
          normalizedRelease.communityRatingAverage,
          normalizedRelease.lowestPrice,
          normalizedRelease.numForSale,
          normalizedRelease.thumb,
          normalizedRelease.coverImage,
          normalizedRelease.resourceUrl,
          normalizedRelease.uri,
          normalizedRelease.rawJson,
          normalizedRelease.fetchedAt,
          normalizedRelease.staleAfter,
        ],
      );

      for (const tableName of [
        'release_artists',
        'release_labels',
        'release_formats',
        'release_genres',
        'release_styles',
        'release_identifiers',
        'release_tracks',
      ]) {
        await transaction.execute(
          `DELETE FROM ${tableName} WHERE release_id = ?`,
          [normalizedRelease.releaseId],
        );
      }

      for (const artist of normalizedRelease.artists) {
        await transaction.execute(
          `
            INSERT INTO release_artists (
              release_id,
              position,
              artist_id,
              name,
              anv,
              join_text,
              role,
              tracks,
              resource_url,
              thumbnail_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            normalizedRelease.releaseId,
            artist.position,
            artist.artistId,
            artist.name,
            artist.anv,
            artist.joinText,
            artist.role,
            artist.tracks,
            artist.resourceUrl,
            artist.thumbnailUrl,
          ],
        );
      }

      for (const label of normalizedRelease.labels) {
        await transaction.execute(
          `
            INSERT INTO release_labels (
              release_id,
              position,
              label_id,
              name,
              catno,
              entity_type,
              entity_type_name,
              resource_url,
              thumbnail_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            normalizedRelease.releaseId,
            label.position,
            label.labelId,
            label.name,
            label.catno,
            label.entityType,
            label.entityTypeName,
            label.resourceUrl,
            label.thumbnailUrl,
          ],
        );
      }

      for (const format of normalizedRelease.formats) {
        await transaction.execute(
          `
            INSERT INTO release_formats (
              release_id,
              position,
              name,
              qty,
              format_text,
              descriptions_json
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            normalizedRelease.releaseId,
            format.position,
            format.name,
            format.qty,
            format.formatText,
            format.descriptionsJson,
          ],
        );
      }

      for (const genre of normalizedRelease.genres) {
        await transaction.execute(
          'INSERT INTO release_genres (release_id, genre) VALUES (?, ?)',
          [normalizedRelease.releaseId, genre.genre],
        );
      }

      for (const style of normalizedRelease.styles) {
        await transaction.execute(
          'INSERT INTO release_styles (release_id, style) VALUES (?, ?)',
          [normalizedRelease.releaseId, style.style],
        );
      }

      for (const identifier of normalizedRelease.identifiers) {
        await transaction.execute(
          `
            INSERT INTO release_identifiers (
              release_id,
              position,
              identifier_type,
              value,
              description
            ) VALUES (?, ?, ?, ?, ?)
          `,
          [
            normalizedRelease.releaseId,
            identifier.position,
            identifier.identifierType,
            identifier.value,
            identifier.description,
          ],
        );
      }

      for (const track of normalizedRelease.tracks) {
        await transaction.execute(
          `
            INSERT INTO release_tracks (
              release_id,
              position,
              track_position,
              track_type,
              title,
              duration,
              extraartists_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [
            normalizedRelease.releaseId,
            track.position,
            track.trackPosition,
            track.trackType,
            track.title,
            track.duration,
            track.extraartistsJson,
          ],
        );
      }
    });
  }

  async pruneCollectionItemsNotSeenInRun(runId: number): Promise<number> {
    const result = await this.database.execute(
      `
        DELETE FROM collection_items
        WHERE last_seen_sync_run_id IS NOT ?
      `,
      [runId],
    );

    return result.rowsAffected;
  }

  async setSyncState(
    key: string,
    value: string,
    updatedAt: string,
  ): Promise<void> {
    await this.database.execute(
      `
        INSERT INTO sync_state (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `,
      [key, value, updatedAt],
    );
  }

  async finishRunSuccess(runId: number, completedAt: string): Promise<void> {
    await this.database.execute(
      `
        UPDATE sync_runs
        SET status = 'succeeded',
            completed_at = ?,
            error_message = NULL
        WHERE id = ?
      `,
      [completedAt, runId],
    );
  }

  async finishRunFailure(
    runId: number,
    completedAt: string,
    errorMessage: string,
  ): Promise<void> {
    await this.database.execute(
      `
        UPDATE sync_runs
        SET status = 'failed',
            completed_at = ?,
            error_message = ?
        WHERE id = ?
      `,
      [completedAt, errorMessage, runId],
    );
  }
}
