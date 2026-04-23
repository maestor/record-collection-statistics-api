import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import {
  parseBreakdownDimension,
  parseFacetLimit,
  parseRecordsQuery,
  parseReleaseId,
  validateAllowedQueryKeys,
  validateLimitOnlyQueryKeys,
  validateRecordsQueryKeys,
} from './http/validation.js';
import { createJsonCacheResponse } from './lib/http-cache.js';
import { RecordsRepository } from './repositories/records-repository.js';

export function createApp(database: Database.Database): Hono {
  const app = new Hono();
  const recordsRepository = new RecordsRepository(database);

  app.onError((error, context) => {
    const status = /must be|cannot be|does not support/.test(error.message)
      ? 400
      : 500;
    return context.json(
      {
        error: error.message,
      },
      status,
    );
  });

  app.get('/', (context) => {
    validateAllowedQueryKeys(context.req.query(), new Set(), '/');

    return createJsonCacheResponse(
      {
        service: 'record-collection-statistics-api',
        capabilities: {
          importerBackedCache: true,
          readOnlyApi: true,
          discogsOnRequestPath: false,
        },
        endpoints: {
          health: '/health',
          filters: '/filters?limit=25',
          records: '/records',
          recordDetail: '/records/:releaseId',
          statsSummary: '/stats/summary',
          statsDashboard: '/stats/dashboard?limit=10',
          statsBreakdown: '/stats/breakdowns/:dimension',
        },
        recordsQuery: {
          supportedFilters: [
            'q',
            'artist',
            'label',
            'genre',
            'style',
            'format',
            'country',
            'year_from',
            'year_to',
            'added_from',
            'added_to',
            'page',
            'page_size',
            'sort',
            'order',
          ],
          allowedSorts: [
            'date_added',
            'release_year',
            'artist',
            'title',
            'lowest_price',
          ],
        },
        breakdownDimensions: [
          'artist',
          'label',
          'format',
          'genre',
          'style',
          'country',
          'release_year',
          'added_year',
        ],
      },
      {
        ifNoneMatch: context.req.header('if-none-match') ?? null,
      },
    );
  });

  app.get('/health', (context) => {
    validateAllowedQueryKeys(context.req.query(), new Set(), '/health');

    const snapshot = recordsRepository.getHealthSnapshot();
    return createJsonCacheResponse(
      {
        ok: true,
        database: {
          totalItems: snapshot.totalItems,
          releaseCount: snapshot.releaseCount,
          lastSuccessfulSyncAt: snapshot.lastSuccessfulSyncAt,
        },
      },
      {
        ifNoneMatch: context.req.header('if-none-match') ?? null,
      },
    );
  });

  app.get('/records', (context) => {
    const rawQuery = context.req.query();
    validateRecordsQueryKeys(rawQuery);
    const query = parseRecordsQuery(rawQuery);
    const total = recordsRepository.countRecords(query);
    const items = recordsRepository.listRecords(query);

    return createJsonCacheResponse(
      {
        data: items,
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
        },
        filters: {
          q: query.q ?? null,
          artist: query.artist ?? null,
          label: query.label ?? null,
          genre: query.genre ?? null,
          style: query.style ?? null,
          format: query.format ?? null,
          country: query.country ?? null,
          yearFrom: query.yearFrom ?? null,
          yearTo: query.yearTo ?? null,
          addedFrom: query.addedFrom ?? null,
          addedTo: query.addedTo ?? null,
          sort: query.sort,
          order: query.order,
        },
      },
      {
        ifNoneMatch: context.req.header('if-none-match') ?? null,
      },
    );
  });

  app.get('/records/:releaseId', (context) => {
    validateAllowedQueryKeys(
      context.req.query(),
      new Set(),
      '/records/:releaseId',
    );

    const releaseId = parseReleaseId(context.req.param('releaseId'));
    const record = recordsRepository.getRecordDetail(releaseId);
    if (!record) {
      return context.json(
        {
          error: `Release ${releaseId} was not found in the local collection cache.`,
        },
        404,
      );
    }

    return createJsonCacheResponse(
      {
        data: record,
      },
      {
        ifNoneMatch: context.req.header('if-none-match') ?? null,
      },
    );
  });

  app.get('/stats/summary', (context) => {
    validateAllowedQueryKeys(context.req.query(), new Set(), '/stats/summary');

    return createJsonCacheResponse(
      {
        data: recordsRepository.getStatsSummary(),
      },
      {
        ifNoneMatch: context.req.header('if-none-match') ?? null,
      },
    );
  });

  app.get('/stats/dashboard', (context) => {
    const rawQuery = context.req.query();
    validateLimitOnlyQueryKeys(rawQuery, '/stats/dashboard');
    const limit = parseFacetLimit(rawQuery.limit);

    return createJsonCacheResponse(
      {
        data: recordsRepository.getDashboardStats(limit),
        meta: {
          limit,
        },
      },
      {
        ifNoneMatch: context.req.header('if-none-match') ?? null,
      },
    );
  });

  app.get('/filters', (context) => {
    const rawQuery = context.req.query();
    validateLimitOnlyQueryKeys(rawQuery, '/filters');
    const limit = parseFacetLimit(rawQuery.limit);

    return createJsonCacheResponse(
      {
        data: recordsRepository.getFilterCatalog(limit),
        meta: {
          limit,
        },
      },
      {
        ifNoneMatch: context.req.header('if-none-match') ?? null,
      },
    );
  });

  app.get('/stats/breakdowns/:dimension', (context) => {
    validateAllowedQueryKeys(
      context.req.query(),
      new Set(),
      '/stats/breakdowns/:dimension',
    );

    const dimension = parseBreakdownDimension(context.req.param('dimension'));
    return createJsonCacheResponse(
      {
        data: recordsRepository.getBreakdown(dimension),
        meta: {
          dimension,
        },
      },
      {
        ifNoneMatch: context.req.header('if-none-match') ?? null,
      },
    );
  });

  return app;
}
