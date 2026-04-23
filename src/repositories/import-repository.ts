import type Database from 'better-sqlite3';

import type {
  NormalizedCollectionField,
  NormalizedCollectionFieldValue,
  NormalizedCollectionItem,
  NormalizedReleaseDetail,
} from '../importer/mappers.js';

export interface SyncRunRecord {
  id: number;
  startedAt: string;
}

export class ImportRepository {
  private readonly database: Database.Database;

  constructor(database: Database.Database) {
    this.database = database;
  }

  startSyncRun(input: {
    fullRefresh: boolean;
    releaseTtlDays: number;
    startedAt: string;
  }): SyncRunRecord {
    const result = this.database
      .prepare(
        `
          INSERT INTO sync_runs (
            started_at,
            status,
            full_refresh,
            release_ttl_days
          ) VALUES (?, 'running', ?, ?)
        `,
      )
      .run(input.startedAt, input.fullRefresh ? 1 : 0, input.releaseTtlDays);

    return {
      id: Number(result.lastInsertRowid),
      startedAt: input.startedAt,
    };
  }

  upsertCollectionFields(fields: NormalizedCollectionField[]): void {
    const statement = this.database.prepare(`
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
    `);

    const transaction = this.database.transaction(
      (items: NormalizedCollectionField[]) => {
        for (const field of items) {
          statement.run(
            field.fieldId,
            field.name,
            field.fieldType,
            field.position,
            field.isPublic,
            field.optionsJson,
            field.lines,
            field.rawJson,
            field.updatedAt,
          );
        }
      },
    );

    transaction(fields);
  }

  upsertCollectionItems(
    items: NormalizedCollectionItem[],
    fieldValuesByInstance: Map<number, NormalizedCollectionFieldValue[]>,
  ): void {
    const itemStatement = this.database.prepare(`
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
    `);

    const deleteValuesStatement = this.database.prepare(
      'DELETE FROM collection_item_field_values WHERE instance_id = ?',
    );
    const insertValueStatement = this.database.prepare(`
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
    `);

    const transaction = this.database.transaction(
      (
        collectionItems: NormalizedCollectionItem[],
        valuesByInstance: Map<number, NormalizedCollectionFieldValue[]>,
      ) => {
        for (const item of collectionItems) {
          itemStatement.run(
            item.instanceId,
            item.releaseId,
            item.folderId,
            item.rating,
            item.dateAdded,
            item.lastSeenSyncRunId,
            item.rawJson,
            item.createdAt,
            item.updatedAt,
          );

          deleteValuesStatement.run(item.instanceId);

          for (const value of valuesByInstance.get(item.instanceId) ?? []) {
            insertValueStatement.run(
              value.instanceId,
              value.fieldId,
              value.valueText,
              value.rawJson,
              value.updatedAt,
            );
          }
        }
      },
    );

    transaction(items, fieldValuesByInstance);
  }

  updateRunProgress(
    runId: number,
    values: {
      itemsSeenDelta?: number;
      pagesProcessedDelta?: number;
      releasesRefreshedDelta?: number;
      username?: string;
    },
  ): void {
    this.database
      .prepare(
        `
          UPDATE sync_runs
          SET
            username = COALESCE(?, username),
            pages_processed = pages_processed + ?,
            collection_items_seen = collection_items_seen + ?,
            releases_refreshed = releases_refreshed + ?
          WHERE id = ?
        `,
      )
      .run(
        values.username ?? null,
        values.pagesProcessedDelta ?? 0,
        values.itemsSeenDelta ?? 0,
        values.releasesRefreshedDelta ?? 0,
        runId,
      );
  }

  listReleaseIdsSeenInRun(runId: number): number[] {
    return (
      this.database
        .prepare(
          `
            SELECT DISTINCT release_id
            FROM collection_items
            WHERE last_seen_sync_run_id = ?
            ORDER BY release_id
          `,
        )
        .all(runId) as Array<{ release_id: number }>
    ).map((row) => row.release_id);
  }

  listReleaseIdsNeedingRefresh(
    releaseIds: number[],
    referenceIso: string,
  ): number[] {
    const statement = this.database.prepare(
      'SELECT stale_after FROM releases WHERE release_id = ?',
    );

    return releaseIds.filter((releaseId) => {
      const row = statement.get(releaseId) as
        | { stale_after: string | null }
        | undefined;
      return !row?.stale_after || row.stale_after <= referenceIso;
    });
  }

  upsertRelease(normalizedRelease: NormalizedReleaseDetail): void {
    const transaction = this.database.transaction(
      (release: NormalizedReleaseDetail) => {
        this.database
          .prepare(
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
          )
          .run(
            release.releaseId,
            release.masterId,
            release.status,
            release.title,
            release.artistsSort,
            release.releaseYear,
            release.released,
            release.country,
            release.dataQuality,
            release.communityHave,
            release.communityWant,
            release.communityRatingCount,
            release.communityRatingAverage,
            release.lowestPrice,
            release.numForSale,
            release.thumb,
            release.coverImage,
            release.resourceUrl,
            release.uri,
            release.rawJson,
            release.fetchedAt,
            release.staleAfter,
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
          this.database
            .prepare(`DELETE FROM ${tableName} WHERE release_id = ?`)
            .run(release.releaseId);
        }

        const insertArtist = this.database.prepare(`
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
      `);
        for (const artist of release.artists) {
          insertArtist.run(
            release.releaseId,
            artist.position,
            artist.artistId,
            artist.name,
            artist.anv,
            artist.joinText,
            artist.role,
            artist.tracks,
            artist.resourceUrl,
            artist.thumbnailUrl,
          );
        }

        const insertLabel = this.database.prepare(`
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
      `);
        for (const label of release.labels) {
          insertLabel.run(
            release.releaseId,
            label.position,
            label.labelId,
            label.name,
            label.catno,
            label.entityType,
            label.entityTypeName,
            label.resourceUrl,
            label.thumbnailUrl,
          );
        }

        const insertFormat = this.database.prepare(`
        INSERT INTO release_formats (
          release_id,
          position,
          name,
          qty,
          format_text,
          descriptions_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
        for (const format of release.formats) {
          insertFormat.run(
            release.releaseId,
            format.position,
            format.name,
            format.qty,
            format.formatText,
            format.descriptionsJson,
          );
        }

        const insertGenre = this.database.prepare(`
        INSERT INTO release_genres (release_id, genre)
        VALUES (?, ?)
      `);
        for (const genre of release.genres) {
          insertGenre.run(release.releaseId, genre.genre);
        }

        const insertStyle = this.database.prepare(`
        INSERT INTO release_styles (release_id, style)
        VALUES (?, ?)
      `);
        for (const style of release.styles) {
          insertStyle.run(release.releaseId, style.style);
        }

        const insertIdentifier = this.database.prepare(`
        INSERT INTO release_identifiers (
          release_id,
          position,
          identifier_type,
          value,
          description
        ) VALUES (?, ?, ?, ?, ?)
      `);
        for (const identifier of release.identifiers) {
          insertIdentifier.run(
            release.releaseId,
            identifier.position,
            identifier.identifierType,
            identifier.value,
            identifier.description,
          );
        }

        const insertTrack = this.database.prepare(`
        INSERT INTO release_tracks (
          release_id,
          position,
          track_position,
          track_type,
          title,
          duration,
          extraartists_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
        for (const track of release.tracks) {
          insertTrack.run(
            release.releaseId,
            track.position,
            track.trackPosition,
            track.trackType,
            track.title,
            track.duration,
            track.extraartistsJson,
          );
        }
      },
    );

    transaction(normalizedRelease);
  }

  pruneCollectionItemsNotSeenInRun(runId: number): number {
    const result = this.database
      .prepare(
        `
          DELETE FROM collection_items
          WHERE last_seen_sync_run_id IS NOT ?
        `,
      )
      .run(runId);

    return result.changes;
  }

  setSyncState(key: string, value: string, updatedAt: string): void {
    this.database
      .prepare(
        `
          INSERT INTO sync_state (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `,
      )
      .run(key, value, updatedAt);
  }

  finishRunSuccess(runId: number, completedAt: string): void {
    this.database
      .prepare(
        `
          UPDATE sync_runs
          SET status = 'succeeded',
              completed_at = ?,
              error_message = NULL
          WHERE id = ?
        `,
      )
      .run(completedAt, runId);
  }

  finishRunFailure(
    runId: number,
    completedAt: string,
    errorMessage: string,
  ): void {
    this.database
      .prepare(
        `
          UPDATE sync_runs
          SET status = 'failed',
              completed_at = ?,
              error_message = ?
          WHERE id = ?
        `,
      )
      .run(completedAt, errorMessage, runId);
  }
}
