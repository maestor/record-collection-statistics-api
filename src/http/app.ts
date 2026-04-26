import { type Context, Hono } from 'hono';
import type { DatabaseClient } from '../lib/database.js';
import {
  createJsonCacheResponse,
  createNotModifiedResponse,
  createOpaqueEtag,
} from '../lib/http-cache.js';
import { buildOpenApiDocument } from '../openapi/spec.js';
import { RecordsRepository } from '../repositories/records-repository.js';
import {
  parseBreakdownDimension,
  parseBreakdownDimensions,
  parseFacetLimit,
  parseRecordsQuery,
  parseReleaseId,
  type RecordsQueryInput,
  validateAllowedQueryKeys,
  validateFilterCatalogQueryKeys,
  validateLimitOnlyQueryKeys,
  validateRecordsQueryKeys,
} from './validation.js';

export interface AppOptions {
  apiReadKey?: string;
}

const rootPath: '/' = '/';

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

function resolvePresentedApiKey(request: Request): string | null {
  const xApiKey = request.headers.get('x-api-key');
  if (xApiKey) {
    return xApiKey;
  }

  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return null;
  }

  const bearerPrefix = 'Bearer ';
  if (!authorization.startsWith(bearerPrefix)) {
    return null;
  }

  const bearerToken = authorization.slice(bearerPrefix.length).trim();
  return bearerToken;
}

function cacheOptions(context: Context): { ifNoneMatch: string | null } {
  return {
    ifNoneMatch: context.req.header('if-none-match') ?? null,
  };
}

function appendRouteKeyParam(
  searchParams: URLSearchParams,
  key: string,
  value: number | string | undefined,
): void {
  if (value !== undefined) {
    searchParams.set(key, String(value));
  }
}

export function buildRecordsRouteKey(query: RecordsQueryInput): string {
  const searchParams = new URLSearchParams();

  appendRouteKeyParam(searchParams, 'q', query.q);
  appendRouteKeyParam(searchParams, 'artist', query.artist);
  appendRouteKeyParam(searchParams, 'label', query.label);
  appendRouteKeyParam(searchParams, 'genre', query.genre);
  appendRouteKeyParam(searchParams, 'style', query.style);
  appendRouteKeyParam(searchParams, 'format', query.format);
  appendRouteKeyParam(searchParams, 'country', query.country);
  appendRouteKeyParam(searchParams, 'year_from', query.yearFrom);
  appendRouteKeyParam(searchParams, 'year_to', query.yearTo);
  appendRouteKeyParam(searchParams, 'added_from', query.addedFrom);
  appendRouteKeyParam(searchParams, 'added_to', query.addedTo);
  searchParams.set('page', String(query.page));
  searchParams.set('page_size', String(query.pageSize));
  searchParams.set('sort', query.sort);
  searchParams.set('order', query.order);

  return `/records?${searchParams.toString()}`;
}

function createCollectionEtag(version: string, routeKey: string): string {
  return createOpaqueEtag(version, routeKey);
}

async function respondIfCollectionUnchanged(
  context: Context,
  recordsRepository: RecordsRepository,
  routeKey: string,
): Promise<string | Response> {
  const collectionVersion = await recordsRepository.getCollectionVersion();
  const etag = createCollectionEtag(collectionVersion, routeKey);

  if (cacheOptions(context).ifNoneMatch === etag) {
    return createNotModifiedResponse(etag);
  }

  return etag;
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

  app.get(rootPath, (context) => {
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
        ...cacheOptions(context),
      },
    );
  });

  app.get('/openapi.json', (context) => {
    validateAllowedQueryKeys(context.req.query(), new Set(), '/openapi.json');

    return createJsonCacheResponse(
      buildOpenApiDocument(),
      cacheOptions(context),
    );
  });

  app.get('/health', async (context) => {
    validateAllowedQueryKeys(context.req.query(), new Set(), '/health');
    const routeKey = '/health';
    const etagOrResponse = await respondIfCollectionUnchanged(
      context,
      recordsRepository,
      routeKey,
    );
    if (etagOrResponse instanceof Response) {
      return etagOrResponse;
    }

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
        ...cacheOptions(context),
        etag: etagOrResponse,
      },
    );
  });

  app.get('/records', async (context) => {
    const rawQuery = context.req.query();
    validateRecordsQueryKeys(rawQuery);
    const query = parseRecordsQuery(rawQuery);
    const routeKey = buildRecordsRouteKey(query);
    const etagOrResponse = await respondIfCollectionUnchanged(
      context,
      recordsRepository,
      routeKey,
    );
    if (etagOrResponse instanceof Response) {
      return etagOrResponse;
    }
    const total = await recordsRepository.countRecords(query);
    const items = await recordsRepository.listRecords(query);

    return createJsonCacheResponse(
      {
        data: items,
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
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
        ...cacheOptions(context),
        etag: etagOrResponse,
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
    const routeKey = `/records/${releaseId}`;
    const etagOrResponse = await respondIfCollectionUnchanged(
      context,
      recordsRepository,
      routeKey,
    );
    if (etagOrResponse instanceof Response) {
      return etagOrResponse;
    }
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
        ...cacheOptions(context),
        etag: etagOrResponse,
      },
    );
  });

  app.get('/stats/summary', async (context) => {
    validateAllowedQueryKeys(context.req.query(), new Set(), '/stats/summary');
    const routeKey = '/stats/summary';
    const etagOrResponse = await respondIfCollectionUnchanged(
      context,
      recordsRepository,
      routeKey,
    );
    if (etagOrResponse instanceof Response) {
      return etagOrResponse;
    }

    return createJsonCacheResponse(
      {
        data: await recordsRepository.getStatsSummary(),
      },
      {
        ...cacheOptions(context),
        etag: etagOrResponse,
      },
    );
  });

  app.get('/stats/dashboard', async (context) => {
    const rawQuery = context.req.query();
    validateLimitOnlyQueryKeys(rawQuery, '/stats/dashboard');
    const limit = parseFacetLimit(rawQuery.limit);
    const routeKey = `/stats/dashboard?limit=${limit}`;
    const etagOrResponse = await respondIfCollectionUnchanged(
      context,
      recordsRepository,
      routeKey,
    );
    if (etagOrResponse instanceof Response) {
      return etagOrResponse;
    }

    return createJsonCacheResponse(
      {
        data: await recordsRepository.getDashboardStats(limit),
        meta: {
          limit,
        },
      },
      {
        ...cacheOptions(context),
        etag: etagOrResponse,
      },
    );
  });

  app.get('/filters', async (context) => {
    const rawQuery = context.req.query();
    validateFilterCatalogQueryKeys(rawQuery);
    const limit = parseFacetLimit(rawQuery.limit);
    const dimensions = parseBreakdownDimensions(rawQuery.dimensions);
    const routeKey = dimensions
      ? `/filters?limit=${limit}&dimensions=${dimensions.join(',')}`
      : `/filters?limit=${limit}`;
    const etagOrResponse = await respondIfCollectionUnchanged(
      context,
      recordsRepository,
      routeKey,
    );
    if (etagOrResponse instanceof Response) {
      return etagOrResponse;
    }

    return createJsonCacheResponse(
      {
        data: dimensions
          ? await recordsRepository.getFilterCatalog(limit, { dimensions })
          : await recordsRepository.getFilterCatalog(limit),
        meta: {
          limit,
          ...(dimensions ? { dimensions } : {}),
        },
      },
      {
        ...cacheOptions(context),
        etag: etagOrResponse,
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
    const routeKey = `/stats/breakdowns/${dimension}`;
    const etagOrResponse = await respondIfCollectionUnchanged(
      context,
      recordsRepository,
      routeKey,
    );
    if (etagOrResponse instanceof Response) {
      return etagOrResponse;
    }
    return createJsonCacheResponse(
      {
        data: await recordsRepository.getBreakdown(dimension),
        meta: {
          dimension,
        },
      },
      {
        ...cacheOptions(context),
        etag: etagOrResponse,
      },
    );
  });

  return app;
}
