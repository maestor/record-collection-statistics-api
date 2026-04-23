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
import type { DatabaseClient } from './lib/database.js';
import { createJsonCacheResponse } from './lib/http-cache.js';
import { buildOpenApiDocument } from './openapi/spec.js';
import { RecordsRepository } from './repositories/records-repository.js';

export interface AppOptions {
  apiReadKey?: string;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function resolvePresentedApiKey(request: Request): string | null {
  const xApiKey = request.headers.get('x-api-key')?.trim();
  if (xApiKey) {
    return xApiKey;
  }

  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization) {
    return null;
  }

  const bearerPrefix = 'Bearer ';
  if (!authorization.startsWith(bearerPrefix)) {
    return null;
  }

  const bearerToken = authorization.slice(bearerPrefix.length).trim();
  return bearerToken || null;
}

export function createApp(
  database: DatabaseClient,
  options: AppOptions = {},
): Hono {
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

  app.use('*', async (context, next) => {
    const hostname = new URL(context.req.url).hostname;
    if (isLocalHostname(hostname)) {
      await next();
      return;
    }

    if (!options.apiReadKey) {
      return context.json(
        {
          error:
            'Remote API access is disabled because API_READ_KEY is not configured.',
        },
        503,
      );
    }

    const presentedApiKey = resolvePresentedApiKey(context.req.raw);
    if (presentedApiKey !== options.apiReadKey) {
      return context.json(
        {
          error:
            'A valid API key is required for non-local requests. Provide x-api-key or Authorization: Bearer <key>.',
        },
        401,
      );
    }

    await next();
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
          localBypassAuth: true,
          remoteApiKeyAuth: true,
        },
        endpoints: {
          health: '/health',
          openapi: '/openapi.json',
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

  app.get('/openapi.json', (context) => {
    validateAllowedQueryKeys(context.req.query(), new Set(), '/openapi.json');

    return createJsonCacheResponse(buildOpenApiDocument(), {
      ifNoneMatch: context.req.header('if-none-match') ?? null,
    });
  });

  app.get('/health', async (context) => {
    validateAllowedQueryKeys(context.req.query(), new Set(), '/health');

    const snapshot = await recordsRepository.getHealthSnapshot();
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

  app.get('/records', async (context) => {
    const rawQuery = context.req.query();
    validateRecordsQueryKeys(rawQuery);
    const query = parseRecordsQuery(rawQuery);
    const total = await recordsRepository.countRecords(query);
    const items = await recordsRepository.listRecords(query);

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

  app.get('/records/:releaseId', async (context) => {
    validateAllowedQueryKeys(
      context.req.query(),
      new Set(),
      '/records/:releaseId',
    );

    const releaseId = parseReleaseId(context.req.param('releaseId'));
    const record = await recordsRepository.getRecordDetail(releaseId);
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

  app.get('/stats/summary', async (context) => {
    validateAllowedQueryKeys(context.req.query(), new Set(), '/stats/summary');

    return createJsonCacheResponse(
      {
        data: await recordsRepository.getStatsSummary(),
      },
      {
        ifNoneMatch: context.req.header('if-none-match') ?? null,
      },
    );
  });

  app.get('/stats/dashboard', async (context) => {
    const rawQuery = context.req.query();
    validateLimitOnlyQueryKeys(rawQuery, '/stats/dashboard');
    const limit = parseFacetLimit(rawQuery.limit);

    return createJsonCacheResponse(
      {
        data: await recordsRepository.getDashboardStats(limit),
        meta: {
          limit,
        },
      },
      {
        ifNoneMatch: context.req.header('if-none-match') ?? null,
      },
    );
  });

  app.get('/filters', async (context) => {
    const rawQuery = context.req.query();
    validateLimitOnlyQueryKeys(rawQuery, '/filters');
    const limit = parseFacetLimit(rawQuery.limit);

    return createJsonCacheResponse(
      {
        data: await recordsRepository.getFilterCatalog(limit),
        meta: {
          limit,
        },
      },
      {
        ifNoneMatch: context.req.header('if-none-match') ?? null,
      },
    );
  });

  app.get('/stats/breakdowns/:dimension', async (context) => {
    validateAllowedQueryKeys(
      context.req.query(),
      new Set(),
      '/stats/breakdowns/:dimension',
    );

    const dimension = parseBreakdownDimension(context.req.param('dimension'));
    return createJsonCacheResponse(
      {
        data: await recordsRepository.getBreakdown(dimension),
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
