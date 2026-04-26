import {
  allowedBreakdownDimensions,
  type BreakdownDimension,
  type RecordsQueryInput,
} from '../http/validation.js';
import type { DatabaseClient } from '../lib/database.js';

export interface RecordListItem {
  artistsSort: string | null;
  country: string | null;
  dateAdded: string | null;
  formats: Array<{
    descriptions: string[];
    freeText: string | null;
    name: string;
  }>;
  instanceCount: number;
  releaseId: number;
  releaseYear: number | null;
  thumb: string | null;
  title: string;
}

export interface RecordDetail extends RecordListItem {
  artists: Array<{
    artistId: number | null;
    name: string;
    position: number;
    role: string | null;
  }>;
  collectionItems: Array<{
    dateAdded: string;
    fieldValues: Array<{
      fieldId: number;
      fieldName: string;
      value: string;
    }>;
    folderId: number;
    instanceId: number;
    rating: number;
  }>;
  community: {
    have: number | null;
    ratingAverage: number | null;
    ratingCount: number | null;
    want: number | null;
  };
  coverImage: string | null;
  dataQuality: string | null;
  fetchedAt: string;
  formats: Array<{
    descriptions: string[];
    freeText: string | null;
    name: string;
  }>;
  genres: string[];
  identifiers: Array<{
    description: string | null;
    type: string;
    value: string;
  }>;
  labels: Array<{
    catno: string | null;
    labelId: number | null;
    name: string;
    position: number;
  }>;
  numForSale: number | null;
  released: string | null;
  resourceUrl: string | null;
  status: string | null;
  styles: string[];
  tracks: Array<{
    duration: string | null;
    position: string | null;
    title: string;
    type: string;
  }>;
  uri: string | null;
}

export interface StatsSummary {
  addedRange: {
    first: string | null;
    last: string | null;
  };
  collectionValue: {
    maximum: number | null;
    median: number | null;
    minimum: number | null;
  };
  totals: {
    collectionItems: number;
    genres: number;
    labels: number;
    releases: number;
    styles: number;
    uniqueArtists: number;
  };
}

export interface BreakdownItem {
  itemCount: number;
  releaseCount: number;
  value: string;
}

interface ReleaseYearRange {
  max: number | null;
  min: number | null;
}

interface RecordCountRow {
  total: number;
}

interface StatsSummaryRow {
  collection_value_maximum: number | null;
  collection_value_median: number | null;
  collection_value_minimum: number | null;
  first_added_at: string | null;
  last_added_at: string | null;
  total_genres: number;
  total_items: number;
  total_labels: number;
  total_releases: number;
  total_styles: number;
  total_unique_artists: number;
}

interface HealthTotalsRow {
  release_count: number;
  total_items: number;
}

interface ReleaseYearRangeRow {
  max_release_year: number | null;
  min_release_year: number | null;
}

export interface FilterCatalog {
  addedYears: BreakdownItem[];
  artists: BreakdownItem[];
  countries: BreakdownItem[];
  formats: BreakdownItem[];
  genres: BreakdownItem[];
  labels: BreakdownItem[];
  ranges: {
    added: {
      first: string | null;
      last: string | null;
    };
    releaseYears: {
      max: number | null;
      min: number | null;
    };
  };
  releaseYears: BreakdownItem[];
  styles: BreakdownItem[];
}

export interface DashboardStats {
  addedYears: BreakdownItem[];
  countries: BreakdownItem[];
  formats: BreakdownItem[];
  genres: BreakdownItem[];
  labels: BreakdownItem[];
  styles: BreakdownItem[];
  summary: StatsSummary;
  topArtists: BreakdownItem[];
}

export class RecordsRepository {
  private readonly database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.database = database;
  }

  async countRecords(query: RecordsQueryInput): Promise<number> {
    const { whereSql, params } = buildRecordFilters(query);
    const row = (await this.database.queryOne<RecordCountRow>(
      `
        SELECT COUNT(*) AS total
        FROM releases r
        WHERE ${whereSql}
      `,
      params,
    )) as RecordCountRow;

    return Number(row.total);
  }

  async listRecords(query: RecordsQueryInput): Promise<RecordListItem[]> {
    const { whereSql, params } = buildRecordFilters(query);
    const sortExpression = recordSortExpressions[query.sort];
    const offset = (query.page - 1) * query.pageSize;

    const rows = await this.database.queryAll<{
      artists_sort: string | null;
      country: string | null;
      date_added: string | null;
      instance_count: number;
      release_id: number;
      release_year: number | null;
      thumb: string | null;
      title: string;
    }>(
      `
        SELECT
          r.release_id,
          r.title,
          r.artists_sort,
          r.release_year,
          r.country,
          r.thumb,
          (
            SELECT COUNT(*)
            FROM collection_items ci
            WHERE ci.release_id = r.release_id
          ) AS instance_count,
          (
            SELECT MIN(ci.date_added)
            FROM collection_items ci
            WHERE ci.release_id = r.release_id
          ) AS date_added
        FROM releases r
        WHERE ${whereSql}
        ORDER BY ${sortExpression} ${query.order}, r.release_id ASC
        LIMIT ? OFFSET ?
      `,
      [...params, query.pageSize, offset],
    );

    const releaseIds = rows.map((row) => Number(row.release_id));
    const formatsByReleaseId = await this.listFormatsForReleaseIds(releaseIds);

    return rows.map((row) => ({
      releaseId: Number(row.release_id),
      title: row.title,
      artistsSort: row.artists_sort,
      releaseYear: row.release_year === null ? null : Number(row.release_year),
      country: row.country,
      thumb: row.thumb,
      instanceCount: Number(row.instance_count),
      dateAdded: row.date_added,
      formats: formatsByReleaseId.get(Number(row.release_id)) ?? [],
    }));
  }

  async getRecordDetail(releaseId: number): Promise<RecordDetail | null> {
    const releaseRow = await this.database.queryOne<{
      artists_sort: string | null;
      community_have: number | null;
      community_rating_average: number | null;
      community_rating_count: number | null;
      community_want: number | null;
      country: string | null;
      cover_image: string | null;
      data_quality: string | null;
      fetched_at: string;
      date_added: string | null;
      instance_count: number;
      num_for_sale: number | null;
      release_id: number;
      release_year: number | null;
      released: string | null;
      resource_url: string | null;
      status: string | null;
      thumb: string | null;
      title: string;
      uri: string | null;
    }>(
      `
        SELECT
          r.release_id,
          r.title,
          r.artists_sort,
          r.release_year,
          r.country,
          r.thumb,
          r.cover_image,
          r.status,
          r.released,
          r.resource_url,
          r.uri,
          r.data_quality,
          r.fetched_at,
          r.num_for_sale,
          r.community_have,
          r.community_want,
          r.community_rating_count,
          r.community_rating_average,
          (
            SELECT COUNT(*)
            FROM collection_items ci
            WHERE ci.release_id = r.release_id
          ) AS instance_count,
          (
            SELECT MIN(ci.date_added)
            FROM collection_items ci
            WHERE ci.release_id = r.release_id
          ) AS date_added
        FROM releases r
        WHERE r.release_id = ?
          AND EXISTS (
            SELECT 1
            FROM collection_items ci
            WHERE ci.release_id = r.release_id
          )
      `,
      [releaseId],
    );

    if (!releaseRow) {
      return null;
    }

    const [
      artists,
      labels,
      formats,
      identifiers,
      tracks,
      genres,
      styles,
      fieldValueRows,
    ] = await Promise.all([
      this.database.queryAll<{
        artist_id: number | null;
        name: string;
        position: number;
        role: string | null;
      }>(
        `
            SELECT position, artist_id, name, role
            FROM release_artists
            WHERE release_id = ?
            ORDER BY position ASC
          `,
        [releaseId],
      ),
      this.database.queryAll<{
        catno: string | null;
        label_id: number | null;
        name: string;
        position: number;
      }>(
        `
            SELECT position, label_id, name, catno
            FROM release_labels
            WHERE release_id = ?
            ORDER BY position ASC
          `,
        [releaseId],
      ),
      this.database.queryAll<{
        descriptions_json: string;
        format_text: string | null;
        name: string;
      }>(
        `
            SELECT name, format_text, descriptions_json
            FROM release_formats
            WHERE release_id = ?
            ORDER BY position ASC
          `,
        [releaseId],
      ),
      this.database.queryAll<{
        description: string | null;
        identifier_type: string;
        value: string;
      }>(
        `
            SELECT identifier_type, value, description
            FROM release_identifiers
            WHERE release_id = ?
            ORDER BY position ASC
          `,
        [releaseId],
      ),
      this.database.queryAll<{
        duration: string | null;
        title: string;
        track_position: string | null;
        track_type: string;
      }>(
        `
            SELECT track_position, track_type, title, duration
            FROM release_tracks
            WHERE release_id = ?
            ORDER BY position ASC
          `,
        [releaseId],
      ),
      this.database.queryAll<{ genre: string }>(
        'SELECT genre FROM release_genres WHERE release_id = ? ORDER BY genre ASC',
        [releaseId],
      ),
      this.database.queryAll<{ style: string }>(
        'SELECT style FROM release_styles WHERE release_id = ? ORDER BY style ASC',
        [releaseId],
      ),
      this.database.queryAll<{
        date_added: string;
        field_id: number | null;
        field_name: string | null;
        folder_id: number;
        instance_id: number;
        rating: number;
        value_text: string | null;
      }>(
        `
            SELECT
              ci.instance_id,
              ci.folder_id,
              ci.rating,
              ci.date_added,
              civ.field_id,
              cf.name AS field_name,
              civ.value_text
            FROM collection_items ci
            LEFT JOIN collection_item_field_values civ
              ON civ.instance_id = ci.instance_id
            LEFT JOIN collection_fields cf
              ON cf.field_id = civ.field_id
            WHERE ci.release_id = ?
            ORDER BY ci.date_added ASC, civ.field_id ASC
          `,
        [releaseId],
      ),
    ]);

    const collectionItems = new Map<
      number,
      {
        dateAdded: string;
        fieldValues: Array<{
          fieldId: number;
          fieldName: string;
          value: string;
        }>;
        folderId: number;
        instanceId: number;
        rating: number;
      }
    >();

    for (const row of fieldValueRows) {
      const existing = collectionItems.get(Number(row.instance_id)) ?? {
        instanceId: Number(row.instance_id),
        folderId: Number(row.folder_id),
        rating: Number(row.rating),
        dateAdded: row.date_added,
        fieldValues: [] as Array<{
          fieldId: number;
          fieldName: string;
          value: string;
        }>,
      };

      if (row.field_name !== null && row.value_text !== null) {
        existing.fieldValues.push({
          fieldId: Number(row.field_id),
          fieldName: row.field_name,
          value: row.value_text,
        });
      }

      collectionItems.set(existing.instanceId, existing);
    }

    return {
      releaseId: Number(releaseRow.release_id),
      title: releaseRow.title,
      artistsSort: releaseRow.artists_sort,
      releaseYear:
        releaseRow.release_year === null
          ? null
          : Number(releaseRow.release_year),
      country: releaseRow.country,
      thumb: releaseRow.thumb,
      instanceCount: Number(releaseRow.instance_count),
      dateAdded: releaseRow.date_added,
      coverImage: releaseRow.cover_image,
      status: releaseRow.status,
      released: releaseRow.released,
      resourceUrl: releaseRow.resource_url,
      uri: releaseRow.uri,
      dataQuality: releaseRow.data_quality,
      fetchedAt: releaseRow.fetched_at,
      numForSale:
        releaseRow.num_for_sale === null
          ? null
          : Number(releaseRow.num_for_sale),
      community: {
        have:
          releaseRow.community_have === null
            ? null
            : Number(releaseRow.community_have),
        want:
          releaseRow.community_want === null
            ? null
            : Number(releaseRow.community_want),
        ratingCount:
          releaseRow.community_rating_count === null
            ? null
            : Number(releaseRow.community_rating_count),
        ratingAverage:
          releaseRow.community_rating_average === null
            ? null
            : Number(releaseRow.community_rating_average),
      },
      artists: artists.map((row) => ({
        position: Number(row.position),
        artistId: row.artist_id === null ? null : Number(row.artist_id),
        name: row.name,
        role: row.role,
      })),
      labels: labels.map((row) => ({
        position: Number(row.position),
        labelId: row.label_id === null ? null : Number(row.label_id),
        name: row.name,
        catno: row.catno,
      })),
      formats: formats.map((row) => ({
        name: row.name,
        freeText: row.format_text,
        descriptions: JSON.parse(row.descriptions_json) as string[],
      })),
      identifiers: identifiers.map((row) => ({
        type: row.identifier_type,
        value: row.value,
        description: row.description,
      })),
      tracks: tracks.map((row) => ({
        position: row.track_position,
        type: row.track_type,
        title: row.title,
        duration: row.duration,
      })),
      genres: genres.map((row) => row.genre),
      styles: styles.map((row) => row.style),
      collectionItems: [...collectionItems.values()],
    };
  }

  private async listFormatsForReleaseIds(
    releaseIds: number[],
  ): Promise<Map<number, RecordListItem['formats']>> {
    // Adding NULL keeps the IN clause valid for empty input without changing
    // results for real positive Discogs release ids.
    const placeholders = [...releaseIds.map(() => '?'), 'NULL'].join(', ');
    const rows = await this.database.queryAll<{
      descriptions_json: string;
      format_text: string | null;
      name: string;
      release_id: number;
    }>(
      `
        SELECT release_id, name, format_text, descriptions_json
        FROM release_formats
        WHERE release_id IN (${placeholders})
        ORDER BY release_id ASC, position ASC
      `,
      releaseIds,
    );

    const formatsByReleaseId = new Map<number, RecordListItem['formats']>();

    for (const row of rows) {
      const releaseId = Number(row.release_id);
      const formats = formatsByReleaseId.get(releaseId) ?? [];

      formats.push({
        name: row.name,
        freeText: row.format_text,
        descriptions: JSON.parse(row.descriptions_json) as string[],
      });

      formatsByReleaseId.set(releaseId, formats);
    }

    return formatsByReleaseId;
  }

  async getStatsSummary(): Promise<StatsSummary> {
    const row = (await this.database.queryOne<StatsSummaryRow>(`
      SELECT
        (SELECT COUNT(*) FROM collection_items) AS total_items,
        (SELECT COUNT(DISTINCT release_id) FROM collection_items) AS total_releases,
        (
          SELECT COUNT(DISTINCT name)
          FROM release_artists
          WHERE name <> '' AND LOWER(name) <> 'various'
        ) AS total_unique_artists,
        (SELECT COUNT(DISTINCT name) FROM release_labels) AS total_labels,
        (SELECT COUNT(DISTINCT genre) FROM release_genres) AS total_genres,
        (SELECT COUNT(DISTINCT style) FROM release_styles) AS total_styles,
        (SELECT MIN(date_added) FROM collection_items) AS first_added_at,
        (SELECT MAX(date_added) FROM collection_items) AS last_added_at,
        (
          SELECT collection_value_minimum
          FROM sync_runs
          WHERE status = 'succeeded'
          ORDER BY id DESC
          LIMIT 1
        ) AS collection_value_minimum,
        (
          SELECT collection_value_median
          FROM sync_runs
          WHERE status = 'succeeded'
          ORDER BY id DESC
          LIMIT 1
        ) AS collection_value_median,
        (
          SELECT collection_value_maximum
          FROM sync_runs
          WHERE status = 'succeeded'
          ORDER BY id DESC
          LIMIT 1
        ) AS collection_value_maximum
    `)) as StatsSummaryRow;

    return {
      totals: {
        collectionItems: Number(row.total_items),
        releases: Number(row.total_releases),
        uniqueArtists: Number(row.total_unique_artists),
        labels: Number(row.total_labels),
        genres: Number(row.total_genres),
        styles: Number(row.total_styles),
      },
      addedRange: {
        first: row.first_added_at,
        last: row.last_added_at,
      },
      collectionValue: {
        minimum:
          row.collection_value_minimum === null
            ? null
            : Number(row.collection_value_minimum),
        median:
          row.collection_value_median === null
            ? null
            : Number(row.collection_value_median),
        maximum:
          row.collection_value_maximum === null
            ? null
            : Number(row.collection_value_maximum),
      },
    };
  }

  async getBreakdown(
    dimension: BreakdownDimension,
    options?: { limit?: number },
  ): Promise<BreakdownItem[]> {
    const query =
      options?.limit === undefined
        ? breakdownQueries[dimension]
        : `${breakdownQueries[dimension]}\nLIMIT ?`;

    const rows =
      options?.limit === undefined
        ? await this.database.queryAll<{
            item_count: number;
            release_count: number;
            value: string;
          }>(query)
        : await this.database.queryAll<{
            item_count: number;
            release_count: number;
            value: string;
          }>(query, [options.limit]);

    return rows.map((row) => ({
      value: row.value,
      itemCount: Number(row.item_count),
      releaseCount: Number(row.release_count),
    }));
  }

  async getCollectionVersion(): Promise<string> {
    const row = await this.database.queryOne<{ value: string }>(
      "SELECT value FROM sync_state WHERE key = 'last_successful_sync_at'",
    );

    return row?.value ?? 'empty';
  }

  async getFilterCatalog(limit: number): Promise<FilterCatalog>;
  async getFilterCatalog(
    limit: number,
    options: { dimensions?: BreakdownDimension[] },
  ): Promise<FilterCatalog>;
  async getFilterCatalog(
    limit: number,
    options?: { dimensions?: BreakdownDimension[] },
  ): Promise<FilterCatalog> {
    const requestedDimensions = new Set(
      options?.dimensions ?? allowedBreakdownDimensions,
    );
    const [
      summary,
      releaseYearRange,
      artists,
      labels,
      formats,
      genres,
      styles,
      countries,
      releaseYears,
      addedYears,
    ] = await Promise.all([
      this.getStatsSummary(),
      this.getReleaseYearRange(),
      requestedDimensions.has('artist')
        ? this.getBreakdown('artist', { limit })
        : Promise.resolve([]),
      requestedDimensions.has('label')
        ? this.getBreakdown('label', { limit })
        : Promise.resolve([]),
      requestedDimensions.has('format')
        ? this.getBreakdown('format', { limit })
        : Promise.resolve([]),
      requestedDimensions.has('genre')
        ? this.getBreakdown('genre', { limit })
        : Promise.resolve([]),
      requestedDimensions.has('style')
        ? this.getBreakdown('style', { limit })
        : Promise.resolve([]),
      requestedDimensions.has('country')
        ? this.getBreakdown('country', { limit })
        : Promise.resolve([]),
      requestedDimensions.has('release_year')
        ? this.getBreakdown('release_year', { limit })
        : Promise.resolve([]),
      requestedDimensions.has('added_year')
        ? this.getBreakdown('added_year', { limit })
        : Promise.resolve([]),
    ]);

    return {
      artists,
      labels,
      formats,
      genres,
      styles,
      countries,
      releaseYears,
      addedYears,
      ranges: {
        added: summary.addedRange,
        releaseYears: releaseYearRange,
      },
    };
  }

  async getDashboardStats(limit: number): Promise<DashboardStats> {
    const [
      summary,
      topArtists,
      labels,
      formats,
      genres,
      styles,
      countries,
      addedYears,
    ] = await Promise.all([
      this.getStatsSummary(),
      this.getBreakdown('artist', { limit }),
      this.getBreakdown('label', { limit }),
      this.getBreakdown('format', { limit }),
      this.getBreakdown('genre', { limit }),
      this.getBreakdown('style', { limit }),
      this.getBreakdown('country', { limit }),
      this.getBreakdown('added_year'),
    ]);

    return {
      summary,
      topArtists,
      labels,
      formats,
      genres,
      styles,
      countries,
      addedYears,
    };
  }

  async getHealthSnapshot(): Promise<{
    lastSuccessfulSyncAt: string | null;
    releaseCount: number;
    totalItems: number;
  }> {
    const lastSuccessfulSyncAt =
      (
        await this.database.queryOne<{ value: string }>(
          "SELECT value FROM sync_state WHERE key = 'last_successful_sync_at'",
        )
      )?.value ?? null;

    const totals = (await this.database.queryOne<HealthTotalsRow>(`
      SELECT
        (SELECT COUNT(*) FROM collection_items) AS total_items,
        (SELECT COUNT(DISTINCT release_id) FROM collection_items) AS release_count
    `)) as HealthTotalsRow;

    return {
      lastSuccessfulSyncAt,
      totalItems: Number(totals.total_items),
      releaseCount: Number(totals.release_count),
    };
  }

  private async getReleaseYearRange(): Promise<ReleaseYearRange> {
    const row = (await this.database.queryOne<ReleaseYearRangeRow>(`
      SELECT
        (
          SELECT MIN(release_year)
          FROM releases r
          WHERE r.release_year IS NOT NULL
            AND r.release_year <> 0
            AND EXISTS (
            SELECT 1 FROM collection_items ci WHERE ci.release_id = r.release_id
          )
        ) AS min_release_year,
        (
          SELECT MAX(release_year)
          FROM releases r
          WHERE r.release_year IS NOT NULL
            AND r.release_year <> 0
            AND EXISTS (
            SELECT 1 FROM collection_items ci WHERE ci.release_id = r.release_id
          )
        ) AS max_release_year
    `)) as ReleaseYearRangeRow;

    return {
      min: row.min_release_year === null ? null : Number(row.min_release_year),
      max: row.max_release_year === null ? null : Number(row.max_release_year),
    };
  }
}

const recordSortExpressions: Record<RecordsQueryInput['sort'], string> = {
  date_added: `
    (
      SELECT MAX(ci.date_added)
      FROM collection_items ci
      WHERE ci.release_id = r.release_id
    )
  `,
  release_year: 'COALESCE(r.release_year, 0)',
  artist: "COALESCE(r.artists_sort, '')",
  title: 'r.title',
  lowest_price: 'COALESCE(r.lowest_price, 0)',
};

function escapeLikeValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

function buildRecordFilters(query: RecordsQueryInput): {
  params: Array<number | string>;
  whereSql: string;
} {
  const clauses = [
    'EXISTS (SELECT 1 FROM collection_items ci WHERE ci.release_id = r.release_id)',
  ];
  const params: Array<number | string> = [];

  if (query.q) {
    const likeValue = `%${escapeLikeValue(query.q)}%`;
    clauses.push(`
      (
        r.title LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR EXISTS (
          SELECT 1
          FROM release_artists ra
          WHERE ra.release_id = r.release_id
            AND ra.name LIKE ? ESCAPE '\\' COLLATE NOCASE
        )
        OR EXISTS (
          SELECT 1
          FROM release_labels rl
          WHERE rl.release_id = r.release_id
            AND rl.name LIKE ? ESCAPE '\\' COLLATE NOCASE
        )
        OR EXISTS (
          SELECT 1
          FROM release_formats rf
          WHERE rf.release_id = r.release_id
            AND (
              rf.descriptions_json LIKE ? ESCAPE '\\' COLLATE NOCASE
              OR rf.format_text LIKE ? ESCAPE '\\' COLLATE NOCASE
            )
        )
      )
    `);
    params.push(likeValue, likeValue, likeValue, likeValue, likeValue);
  }

  if (query.artist) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM release_artists ra
        WHERE ra.release_id = r.release_id
          AND LOWER(ra.name) = LOWER(?)
      )
    `);
    params.push(query.artist);
  }

  if (query.label) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM release_labels rl
        WHERE rl.release_id = r.release_id
          AND LOWER(rl.name) = LOWER(?)
      )
    `);
    params.push(query.label);
  }

  if (query.genre) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM release_genres rg
        WHERE rg.release_id = r.release_id
          AND LOWER(rg.genre) = LOWER(?)
      )
    `);
    params.push(query.genre);
  }

  if (query.style) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM release_styles rs
        WHERE rs.release_id = r.release_id
          AND LOWER(rs.style) = LOWER(?)
      )
    `);
    params.push(query.style);
  }

  if (query.format) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM release_formats rf
        WHERE rf.release_id = r.release_id
          AND LOWER(rf.name) = LOWER(?)
      )
    `);
    params.push(query.format);
  }

  if (query.country) {
    clauses.push("LOWER(COALESCE(r.country, '')) = LOWER(?)");
    params.push(query.country);
  }

  if (query.yearFrom !== undefined) {
    clauses.push('COALESCE(r.release_year, 0) >= ?');
    params.push(query.yearFrom);
  }

  if (query.yearTo !== undefined) {
    clauses.push('COALESCE(r.release_year, 0) <= ?');
    params.push(query.yearTo);
  }

  if (query.addedFrom) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM collection_items ci
        WHERE ci.release_id = r.release_id
          AND ci.date_added >= ?
      )
    `);
    params.push(query.addedFrom);
  }

  if (query.addedTo) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM collection_items ci
        WHERE ci.release_id = r.release_id
          AND ci.date_added <= ?
      )
    `);
    params.push(query.addedTo);
  }

  return {
    whereSql: clauses.join(' AND '),
    params,
  };
}

const breakdownQueries: Record<BreakdownDimension, string> = {
  artist: `
    SELECT value, COUNT(*) AS item_count, COUNT(DISTINCT release_id) AS release_count
    FROM (
      SELECT DISTINCT ci.instance_id, ci.release_id, ra.name AS value
      FROM collection_items ci
      JOIN release_artists ra ON ra.release_id = ci.release_id
      WHERE ra.name <> '' AND LOWER(ra.name) <> 'various'
    )
    GROUP BY value
    ORDER BY item_count DESC, value ASC
  `,
  label: `
    SELECT value, COUNT(*) AS item_count, COUNT(DISTINCT release_id) AS release_count
    FROM (
      SELECT DISTINCT ci.instance_id, ci.release_id, rl.name AS value
      FROM collection_items ci
      JOIN release_labels rl ON rl.release_id = ci.release_id
      WHERE rl.name <> ''
    )
    GROUP BY value
    ORDER BY item_count DESC, value ASC
  `,
  format: `
    SELECT value, COUNT(*) AS item_count, COUNT(DISTINCT release_id) AS release_count
    FROM (
      SELECT DISTINCT ci.instance_id, ci.release_id, rf.name AS value
      FROM collection_items ci
      JOIN release_formats rf ON rf.release_id = ci.release_id
      WHERE rf.name <> ''
    )
    GROUP BY value
    ORDER BY item_count DESC, value ASC
  `,
  genre: `
    SELECT value, COUNT(*) AS item_count, COUNT(DISTINCT release_id) AS release_count
    FROM (
      SELECT DISTINCT ci.instance_id, ci.release_id, rg.genre AS value
      FROM collection_items ci
      JOIN release_genres rg ON rg.release_id = ci.release_id
      WHERE rg.genre <> ''
    )
    GROUP BY value
    ORDER BY item_count DESC, value ASC
  `,
  style: `
    SELECT value, COUNT(*) AS item_count, COUNT(DISTINCT release_id) AS release_count
    FROM (
      SELECT DISTINCT ci.instance_id, ci.release_id, rs.style AS value
      FROM collection_items ci
      JOIN release_styles rs ON rs.release_id = ci.release_id
      WHERE rs.style <> ''
    )
    GROUP BY value
    ORDER BY item_count DESC, value ASC
  `,
  country: `
    SELECT value, COUNT(*) AS item_count, COUNT(DISTINCT release_id) AS release_count
    FROM (
      SELECT DISTINCT ci.instance_id, ci.release_id, r.country AS value
      FROM collection_items ci
      JOIN releases r ON r.release_id = ci.release_id
      WHERE r.country IS NOT NULL AND r.country <> ''
    )
    GROUP BY value
    ORDER BY item_count DESC, value ASC
  `,
  release_year: `
    SELECT value, COUNT(*) AS item_count, COUNT(DISTINCT release_id) AS release_count
    FROM (
      SELECT DISTINCT ci.instance_id, ci.release_id, CAST(r.release_year AS TEXT) AS value
      FROM collection_items ci
      JOIN releases r ON r.release_id = ci.release_id
      WHERE r.release_year IS NOT NULL AND r.release_year <> 0
    )
    GROUP BY value
    ORDER BY value ASC
  `,
  added_year: `
    SELECT value, COUNT(*) AS item_count, COUNT(DISTINCT release_id) AS release_count
    FROM (
      SELECT ci.instance_id, ci.release_id, SUBSTR(ci.date_added, 1, 4) AS value
      FROM collection_items ci
    )
    GROUP BY value
    ORDER BY value ASC
  `,
};
