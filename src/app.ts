import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import {
  parseBreakdownDimension,
  parseFacetLimit,
  parseRecordsQuery,
  parseReleaseId,
} from './http/validation.js';
import { createJsonCacheResponse } from './lib/http-cache.js';
import { RecordsRepository } from './repositories/records-repository.js';

export function createApp(database: Database.Database): Hono {
  const app = new Hono();
  const recordsRepository = new RecordsRepository(database);

  app.onError((error, context) => {
    const status = /must be|cannot be/.test(error.message) ? 400 : 500;
    return context.json(
      {
        error: error.message,
      },
      status,
    );
  });

  app.get('/health', (context) => {
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
    const query = parseRecordsQuery(context.req.query());
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
    return createJsonCacheResponse(
      {
        data: recordsRepository.getStatsSummary(),
      },
      {
        ifNoneMatch: context.req.header('if-none-match') ?? null,
      },
    );
  });

  app.get('/filters', (context) => {
    const limit = parseFacetLimit(context.req.query('limit'));

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
