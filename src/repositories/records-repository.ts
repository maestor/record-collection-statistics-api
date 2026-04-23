import type Database from 'better-sqlite3';

import type {
  BreakdownDimension,
  RecordsQueryInput,
} from '../http/validation.js';

export interface RecordListItem {
  artistsSort: string | null;
  country: string | null;
  firstDateAdded: string | null;
  instanceCount: number;
  latestDateAdded: string | null;
  lowestPrice: number | null;
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
    name: string;
    qty: string | null;
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
  releaseYearRange: {
    max: number | null;
    min: number | null;
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
  private readonly database: Database.Database;

  constructor(database: Database.Database) {
    this.database = database;
  }

  countRecords(query: RecordsQueryInput): number {
    const { whereSql, params } = buildRecordFilters(query);
    const row = this.getRow<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM releases r
        WHERE ${whereSql}
      `,
      ...params,
    );

    return row?.total ?? 0;
  }

  listRecords(query: RecordsQueryInput): RecordListItem[] {
    const { whereSql, params } = buildRecordFilters(query);
    const sortExpression = recordSortExpressions[query.sort];
    const offset = (query.page - 1) * query.pageSize;

    const rows = this.allRows<{
      artists_sort: string | null;
      country: string | null;
      first_date_added: string | null;
      instance_count: number;
      latest_date_added: string | null;
      lowest_price: number | null;
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
          r.lowest_price,
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
          ) AS first_date_added,
          (
            SELECT MAX(ci.date_added)
            FROM collection_items ci
            WHERE ci.release_id = r.release_id
          ) AS latest_date_added
        FROM releases r
        WHERE ${whereSql}
        ORDER BY ${sortExpression} ${query.order.toUpperCase()}, r.release_id ASC
        LIMIT ? OFFSET ?
      `,
      ...params,
      query.pageSize,
      offset,
    );

    return rows.map((row) => ({
      releaseId: row.release_id,
      title: row.title,
      artistsSort: row.artists_sort,
      releaseYear: row.release_year,
      country: row.country,
      lowestPrice: row.lowest_price,
      thumb: row.thumb,
      instanceCount: row.instance_count,
      firstDateAdded: row.first_date_added,
      latestDateAdded: row.latest_date_added,
    }));
  }

  getRecordDetail(releaseId: number): RecordDetail | null {
    const releaseRow = this.getRow<{
      artists_sort: string | null;
      community_have: number | null;
      community_rating_average: number | null;
      community_rating_count: number | null;
      community_want: number | null;
      country: string | null;
      cover_image: string | null;
      data_quality: string | null;
      fetched_at: string;
      first_date_added: string | null;
      instance_count: number;
      latest_date_added: string | null;
      lowest_price: number | null;
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
            r.lowest_price,
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
            ) AS first_date_added,
            (
              SELECT MAX(ci.date_added)
              FROM collection_items ci
              WHERE ci.release_id = r.release_id
            ) AS latest_date_added
          FROM releases r
          WHERE r.release_id = ?
            AND EXISTS (
              SELECT 1
              FROM collection_items ci
              WHERE ci.release_id = r.release_id
            )
        `,
      releaseId,
    );

    if (!releaseRow) {
      return null;
    }

    const artists = this.allRows<{
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
      releaseId,
    ).map((row) => ({
      position: row.position,
      artistId: row.artist_id,
      name: row.name,
      role: row.role,
    }));

    const labels = this.allRows<{
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
      releaseId,
    ).map((row) => ({
      position: row.position,
      labelId: row.label_id,
      name: row.name,
      catno: row.catno,
    }));

    const formats = this.allRows<{
      descriptions_json: string;
      name: string;
      qty: string | null;
    }>(
      `
          SELECT name, qty, descriptions_json
          FROM release_formats
          WHERE release_id = ?
          ORDER BY position ASC
        `,
      releaseId,
    ).map((row) => ({
      name: row.name,
      qty: row.qty,
      descriptions: JSON.parse(row.descriptions_json) as string[],
    }));

    const identifiers = this.allRows<{
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
      releaseId,
    ).map((row) => ({
      type: row.identifier_type,
      value: row.value,
      description: row.description,
    }));

    const tracks = this.allRows<{
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
      releaseId,
    ).map((row) => ({
      position: row.track_position,
      type: row.track_type,
      title: row.title,
      duration: row.duration,
    }));

    const genres = this.allRows<{ genre: string }>(
      'SELECT genre FROM release_genres WHERE release_id = ? ORDER BY genre ASC',
      releaseId,
    ).map((row) => row.genre);

    const styles = this.allRows<{ style: string }>(
      'SELECT style FROM release_styles WHERE release_id = ? ORDER BY style ASC',
      releaseId,
    ).map((row) => row.style);

    const fieldValueRows = this.allRows<{
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
      releaseId,
    );

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
      const existing = collectionItems.get(row.instance_id) ?? {
        instanceId: row.instance_id,
        folderId: row.folder_id,
        rating: row.rating,
        dateAdded: row.date_added,
        fieldValues: [] as Array<{
          fieldId: number;
          fieldName: string;
          value: string;
        }>,
      };

      if (
        row.field_id !== null &&
        row.field_name !== null &&
        row.value_text !== null
      ) {
        existing.fieldValues.push({
          fieldId: row.field_id,
          fieldName: row.field_name,
          value: row.value_text,
        });
      }

      collectionItems.set(row.instance_id, existing);
    }

    return {
      releaseId: releaseRow.release_id,
      title: releaseRow.title,
      artistsSort: releaseRow.artists_sort,
      releaseYear: releaseRow.release_year,
      country: releaseRow.country,
      lowestPrice: releaseRow.lowest_price,
      thumb: releaseRow.thumb,
      instanceCount: releaseRow.instance_count,
      firstDateAdded: releaseRow.first_date_added,
      latestDateAdded: releaseRow.latest_date_added,
      coverImage: releaseRow.cover_image,
      status: releaseRow.status,
      released: releaseRow.released,
      resourceUrl: releaseRow.resource_url,
      uri: releaseRow.uri,
      dataQuality: releaseRow.data_quality,
      fetchedAt: releaseRow.fetched_at,
      numForSale: releaseRow.num_for_sale,
      community: {
        have: releaseRow.community_have,
        want: releaseRow.community_want,
        ratingCount: releaseRow.community_rating_count,
        ratingAverage: releaseRow.community_rating_average,
      },
      artists,
      labels,
      formats,
      identifiers,
      tracks,
      genres,
      styles,
      collectionItems: [...collectionItems.values()],
    };
  }

  getStatsSummary(): StatsSummary {
    const row = this.getRow<{
      first_added_at: string | null;
      last_added_at: string | null;
      max_release_year: number | null;
      min_release_year: number | null;
      total_genres: number;
      total_items: number;
      total_labels: number;
      total_releases: number;
      total_styles: number;
      total_unique_artists: number;
    }>(`
        SELECT
          (SELECT COUNT(*) FROM collection_items) AS total_items,
          (SELECT COUNT(DISTINCT release_id) FROM collection_items) AS total_releases,
          (SELECT COUNT(DISTINCT name) FROM release_artists) AS total_unique_artists,
          (SELECT COUNT(DISTINCT name) FROM release_labels) AS total_labels,
          (SELECT COUNT(DISTINCT genre) FROM release_genres) AS total_genres,
          (SELECT COUNT(DISTINCT style) FROM release_styles) AS total_styles,
          (SELECT MIN(date_added) FROM collection_items) AS first_added_at,
          (SELECT MAX(date_added) FROM collection_items) AS last_added_at,
          (
            SELECT MIN(release_year)
            FROM releases r
            WHERE EXISTS (
              SELECT 1 FROM collection_items ci WHERE ci.release_id = r.release_id
            )
          ) AS min_release_year,
          (
            SELECT MAX(release_year)
            FROM releases r
            WHERE EXISTS (
              SELECT 1 FROM collection_items ci WHERE ci.release_id = r.release_id
            )
          ) AS max_release_year
      `);

    return {
      totals: {
        collectionItems: row?.total_items ?? 0,
        releases: row?.total_releases ?? 0,
        uniqueArtists: row?.total_unique_artists ?? 0,
        labels: row?.total_labels ?? 0,
        genres: row?.total_genres ?? 0,
        styles: row?.total_styles ?? 0,
      },
      addedRange: {
        first: row?.first_added_at ?? null,
        last: row?.last_added_at ?? null,
      },
      releaseYearRange: {
        min: row?.min_release_year ?? null,
        max: row?.max_release_year ?? null,
      },
    };
  }

  getBreakdown(
    dimension: BreakdownDimension,
    options?: { limit?: number },
  ): BreakdownItem[] {
    const query =
      options?.limit === undefined
        ? breakdownQueries[dimension]
        : `${breakdownQueries[dimension]}\nLIMIT ?`;

    return this.allRows<{
      item_count: number;
      release_count: number;
      value: string;
    }>(query, ...(options?.limit === undefined ? [] : [options.limit])).map(
      (row) => ({
        value: row.value,
        itemCount: row.item_count,
        releaseCount: row.release_count,
      }),
    );
  }

  getFilterCatalog(limit: number): FilterCatalog {
    const summary = this.getStatsSummary();

    return {
      artists: this.getBreakdown('artist', { limit }),
      labels: this.getBreakdown('label', { limit }),
      formats: this.getBreakdown('format', { limit }),
      genres: this.getBreakdown('genre', { limit }),
      styles: this.getBreakdown('style', { limit }),
      countries: this.getBreakdown('country', { limit }),
      releaseYears: this.getBreakdown('release_year', { limit }),
      addedYears: this.getBreakdown('added_year', { limit }),
      ranges: {
        added: summary.addedRange,
        releaseYears: summary.releaseYearRange,
      },
    };
  }

  getDashboardStats(limit: number): DashboardStats {
    return {
      summary: this.getStatsSummary(),
      topArtists: this.getBreakdown('artist', { limit }),
      labels: this.getBreakdown('label', { limit }),
      formats: this.getBreakdown('format', { limit }),
      genres: this.getBreakdown('genre', { limit }),
      styles: this.getBreakdown('style', { limit }),
      countries: this.getBreakdown('country', { limit }),
      addedYears: this.getBreakdown('added_year'),
    };
  }

  getHealthSnapshot(): {
    lastSuccessfulSyncAt: string | null;
    releaseCount: number;
    totalItems: number;
  } {
    const lastSuccessfulSyncAt =
      this.getRow<{ value: string }>(
        "SELECT value FROM sync_state WHERE key = 'last_successful_sync_at'",
      )?.value ?? null;

    const totals = this.getRow<{ release_count: number; total_items: number }>(`
        SELECT
          (SELECT COUNT(*) FROM collection_items) AS total_items,
          (SELECT COUNT(DISTINCT release_id) FROM collection_items) AS release_count
      `);

    return {
      lastSuccessfulSyncAt,
      totalItems: totals?.total_items ?? 0,
      releaseCount: totals?.release_count ?? 0,
    };
  }

  private getRow<T>(sql: string, ...params: unknown[]): T | undefined {
    return this.database.prepare(sql).get(...params) as T | undefined;
  }

  private allRows<T>(sql: string, ...params: unknown[]): T[] {
    return this.database.prepare(sql).all(...params) as T[];
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
      )
    `);
    params.push(likeValue, likeValue, likeValue);
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
      WHERE ra.name <> ''
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
      WHERE r.release_year IS NOT NULL
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
