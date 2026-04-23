import {
  allowedBreakdownDimensions,
  allowedRecordSorts,
} from '../http/validation.js';

const jsonContentType = 'application/json';

const errorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: { type: 'string' },
  },
} as const;

const breakdownItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['value', 'itemCount', 'releaseCount'],
  properties: {
    value: { type: 'string' },
    itemCount: { type: 'integer' },
    releaseCount: { type: 'integer' },
  },
} as const;

const recordListItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'releaseId',
    'title',
    'artistsSort',
    'releaseYear',
    'country',
    'lowestPrice',
    'thumb',
    'instanceCount',
    'firstDateAdded',
    'latestDateAdded',
  ],
  properties: {
    releaseId: { type: 'integer' },
    title: { type: 'string' },
    artistsSort: { type: ['string', 'null'] },
    releaseYear: { type: ['integer', 'null'] },
    country: { type: ['string', 'null'] },
    lowestPrice: { type: ['number', 'null'] },
    thumb: { type: ['string', 'null'] },
    instanceCount: { type: 'integer' },
    firstDateAdded: { type: ['string', 'null'], format: 'date-time' },
    latestDateAdded: { type: ['string', 'null'], format: 'date-time' },
  },
} as const;

const recordDetailSchema = {
  allOf: [
    { $ref: '#/components/schemas/RecordListItem' },
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'coverImage',
        'status',
        'released',
        'resourceUrl',
        'uri',
        'dataQuality',
        'fetchedAt',
        'numForSale',
        'community',
        'artists',
        'labels',
        'formats',
        'identifiers',
        'tracks',
        'genres',
        'styles',
        'collectionItems',
      ],
      properties: {
        coverImage: { type: ['string', 'null'] },
        status: { type: ['string', 'null'] },
        released: { type: ['string', 'null'] },
        resourceUrl: { type: ['string', 'null'] },
        uri: { type: ['string', 'null'] },
        dataQuality: { type: ['string', 'null'] },
        fetchedAt: { type: 'string', format: 'date-time' },
        numForSale: { type: ['integer', 'null'] },
        community: {
          type: 'object',
          additionalProperties: false,
          required: ['have', 'want', 'ratingCount', 'ratingAverage'],
          properties: {
            have: { type: ['integer', 'null'] },
            want: { type: ['integer', 'null'] },
            ratingCount: { type: ['integer', 'null'] },
            ratingAverage: { type: ['number', 'null'] },
          },
        },
        artists: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['position', 'artistId', 'name', 'role'],
            properties: {
              position: { type: 'integer' },
              artistId: { type: ['integer', 'null'] },
              name: { type: 'string' },
              role: { type: ['string', 'null'] },
            },
          },
        },
        labels: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['position', 'labelId', 'name', 'catno'],
            properties: {
              position: { type: 'integer' },
              labelId: { type: ['integer', 'null'] },
              name: { type: 'string' },
              catno: { type: ['string', 'null'] },
            },
          },
        },
        formats: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'qty', 'descriptions'],
            properties: {
              name: { type: 'string' },
              qty: { type: ['string', 'null'] },
              descriptions: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
        identifiers: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'value', 'description'],
            properties: {
              type: { type: 'string' },
              value: { type: 'string' },
              description: { type: ['string', 'null'] },
            },
          },
        },
        tracks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['position', 'type', 'title', 'duration'],
            properties: {
              position: { type: ['string', 'null'] },
              type: { type: 'string' },
              title: { type: 'string' },
              duration: { type: ['string', 'null'] },
            },
          },
        },
        genres: {
          type: 'array',
          items: { type: 'string' },
        },
        styles: {
          type: 'array',
          items: { type: 'string' },
        },
        collectionItems: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'instanceId',
              'folderId',
              'rating',
              'dateAdded',
              'fieldValues',
            ],
            properties: {
              instanceId: { type: 'integer' },
              folderId: { type: 'integer' },
              rating: { type: 'integer' },
              dateAdded: { type: 'string', format: 'date-time' },
              fieldValues: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['fieldId', 'fieldName', 'value'],
                  properties: {
                    fieldId: { type: 'integer' },
                    fieldName: { type: 'string' },
                    value: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  ],
} as const;

const statsSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['totals', 'addedRange', 'releaseYearRange'],
  properties: {
    totals: {
      type: 'object',
      additionalProperties: false,
      required: [
        'collectionItems',
        'releases',
        'uniqueArtists',
        'labels',
        'genres',
        'styles',
      ],
      properties: {
        collectionItems: { type: 'integer' },
        releases: { type: 'integer' },
        uniqueArtists: { type: 'integer' },
        labels: { type: 'integer' },
        genres: { type: 'integer' },
        styles: { type: 'integer' },
      },
    },
    addedRange: {
      type: 'object',
      additionalProperties: false,
      required: ['first', 'last'],
      properties: {
        first: { type: ['string', 'null'], format: 'date-time' },
        last: { type: ['string', 'null'], format: 'date-time' },
      },
    },
    releaseYearRange: {
      type: 'object',
      additionalProperties: false,
      required: ['min', 'max'],
      properties: {
        min: { type: ['integer', 'null'] },
        max: { type: ['integer', 'null'] },
      },
    },
  },
} as const;

const filterCatalogSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'artists',
    'labels',
    'formats',
    'genres',
    'styles',
    'countries',
    'releaseYears',
    'addedYears',
    'ranges',
  ],
  properties: {
    artists: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    labels: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    formats: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    genres: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    styles: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    countries: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    releaseYears: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    addedYears: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    ranges: {
      type: 'object',
      additionalProperties: false,
      required: ['added', 'releaseYears'],
      properties: {
        added: {
          type: 'object',
          additionalProperties: false,
          required: ['first', 'last'],
          properties: {
            first: { type: ['string', 'null'], format: 'date-time' },
            last: { type: ['string', 'null'], format: 'date-time' },
          },
        },
        releaseYears: {
          type: 'object',
          additionalProperties: false,
          required: ['min', 'max'],
          properties: {
            min: { type: ['integer', 'null'] },
            max: { type: ['integer', 'null'] },
          },
        },
      },
    },
  },
} as const;

const dashboardStatsSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'topArtists',
    'labels',
    'formats',
    'genres',
    'styles',
    'countries',
    'addedYears',
  ],
  properties: {
    summary: { $ref: '#/components/schemas/StatsSummary' },
    topArtists: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    labels: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    formats: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    genres: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    styles: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    countries: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
    addedYears: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreakdownItem' },
    },
  },
} as const;

const commonErrorResponses = {
  '400': {
    description: 'Invalid request.',
    content: {
      [jsonContentType]: {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
      },
    },
  },
  '401': {
    description: 'Missing or invalid API key for non-local request.',
    content: {
      [jsonContentType]: {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
      },
    },
  },
  '503': {
    description:
      'Remote API access disabled because API_READ_KEY is not configured.',
    content: {
      [jsonContentType]: {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
      },
    },
  },
} as const;

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Record Collection Statistics API',
      version: '0.1.0',
      description:
        'Read-only API for browsing a Discogs-backed record collection cached in SQLite. Localhost requests bypass API-key checks; non-local requests require API_READ_KEY.',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local development',
      },
    ],
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    tags: [
      { name: 'Discovery' },
      { name: 'Records' },
      { name: 'Stats' },
      { name: 'System' },
    ],
    paths: {
      '/': {
        get: {
          tags: ['Discovery'],
          summary: 'Discover API capabilities and supported endpoints.',
          operationId: 'getApiIndex',
          responses: {
            '200': {
              description: 'API discovery document.',
              content: {
                [jsonContentType]: {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                      'service',
                      'capabilities',
                      'endpoints',
                      'recordsQuery',
                      'breakdownDimensions',
                    ],
                    properties: {
                      service: { type: 'string' },
                      capabilities: {
                        type: 'object',
                        additionalProperties: false,
                        required: [
                          'importerBackedCache',
                          'readOnlyApi',
                          'discogsOnRequestPath',
                          'localBypassAuth',
                          'remoteApiKeyAuth',
                        ],
                        properties: {
                          importerBackedCache: { type: 'boolean' },
                          readOnlyApi: { type: 'boolean' },
                          discogsOnRequestPath: { type: 'boolean' },
                          localBypassAuth: { type: 'boolean' },
                          remoteApiKeyAuth: { type: 'boolean' },
                        },
                      },
                      endpoints: {
                        type: 'object',
                        additionalProperties: false,
                        required: [
                          'health',
                          'openapi',
                          'filters',
                          'records',
                          'recordDetail',
                          'statsSummary',
                          'statsDashboard',
                          'statsBreakdown',
                        ],
                        properties: {
                          health: { type: 'string' },
                          openapi: { type: 'string' },
                          filters: { type: 'string' },
                          records: { type: 'string' },
                          recordDetail: { type: 'string' },
                          statsSummary: { type: 'string' },
                          statsDashboard: { type: 'string' },
                          statsBreakdown: { type: 'string' },
                        },
                      },
                      recordsQuery: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['supportedFilters', 'allowedSorts'],
                        properties: {
                          supportedFilters: {
                            type: 'array',
                            items: { type: 'string' },
                          },
                          allowedSorts: {
                            type: 'array',
                            items: {
                              type: 'string',
                              enum: [...allowedRecordSorts],
                            },
                          },
                        },
                      },
                      breakdownDimensions: {
                        type: 'array',
                        items: {
                          type: 'string',
                          enum: [...allowedBreakdownDimensions],
                        },
                      },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      '/openapi.json': {
        get: {
          tags: ['Discovery'],
          summary: 'Get the OpenAPI 3.1 document for this API.',
          operationId: 'getOpenApiDocument',
          responses: {
            '200': {
              description: 'OpenAPI document.',
              content: {
                [jsonContentType]: {
                  schema: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      '/health': {
        get: {
          tags: ['System'],
          summary: 'Get a local cache health snapshot.',
          operationId: 'getHealth',
          responses: {
            '200': {
              description: 'Health snapshot.',
              content: {
                [jsonContentType]: {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['ok', 'database'],
                    properties: {
                      ok: { type: 'boolean' },
                      database: {
                        type: 'object',
                        additionalProperties: false,
                        required: [
                          'totalItems',
                          'releaseCount',
                          'lastSuccessfulSyncAt',
                        ],
                        properties: {
                          totalItems: { type: 'integer' },
                          releaseCount: { type: 'integer' },
                          lastSuccessfulSyncAt: {
                            type: ['string', 'null'],
                            format: 'date-time',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      '/records': {
        get: {
          tags: ['Records'],
          summary:
            'List cached releases with filters, sorting, and pagination.',
          operationId: 'listRecords',
          parameters: [
            { in: 'query', name: 'q', schema: { type: 'string' } },
            { in: 'query', name: 'artist', schema: { type: 'string' } },
            { in: 'query', name: 'label', schema: { type: 'string' } },
            { in: 'query', name: 'genre', schema: { type: 'string' } },
            { in: 'query', name: 'style', schema: { type: 'string' } },
            { in: 'query', name: 'format', schema: { type: 'string' } },
            { in: 'query', name: 'country', schema: { type: 'string' } },
            { in: 'query', name: 'year_from', schema: { type: 'integer' } },
            { in: 'query', name: 'year_to', schema: { type: 'integer' } },
            {
              in: 'query',
              name: 'added_from',
              schema: { type: 'string', format: 'date-time' },
            },
            {
              in: 'query',
              name: 'added_to',
              schema: { type: 'string', format: 'date-time' },
            },
            {
              in: 'query',
              name: 'page',
              schema: { type: 'integer', default: 1, minimum: 1 },
            },
            {
              in: 'query',
              name: 'page_size',
              schema: {
                type: 'integer',
                default: 25,
                minimum: 1,
                maximum: 100,
              },
            },
            {
              in: 'query',
              name: 'sort',
              schema: {
                type: 'string',
                enum: [...allowedRecordSorts],
                default: 'date_added',
              },
            },
            {
              in: 'query',
              name: 'order',
              schema: {
                type: 'string',
                enum: ['asc', 'desc'],
                default: 'desc',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Paginated records.',
              content: {
                [jsonContentType]: {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['data', 'meta', 'filters'],
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/RecordListItem' },
                      },
                      meta: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['page', 'pageSize', 'total', 'totalPages'],
                        properties: {
                          page: { type: 'integer' },
                          pageSize: { type: 'integer' },
                          total: { type: 'integer' },
                          totalPages: { type: 'integer' },
                        },
                      },
                      filters: {
                        type: 'object',
                        additionalProperties: false,
                        required: [
                          'q',
                          'artist',
                          'label',
                          'genre',
                          'style',
                          'format',
                          'country',
                          'yearFrom',
                          'yearTo',
                          'addedFrom',
                          'addedTo',
                          'sort',
                          'order',
                        ],
                        properties: {
                          q: { type: ['string', 'null'] },
                          artist: { type: ['string', 'null'] },
                          label: { type: ['string', 'null'] },
                          genre: { type: ['string', 'null'] },
                          style: { type: ['string', 'null'] },
                          format: { type: ['string', 'null'] },
                          country: { type: ['string', 'null'] },
                          yearFrom: { type: ['integer', 'null'] },
                          yearTo: { type: ['integer', 'null'] },
                          addedFrom: {
                            type: ['string', 'null'],
                            format: 'date-time',
                          },
                          addedTo: {
                            type: ['string', 'null'],
                            format: 'date-time',
                          },
                          sort: {
                            type: 'string',
                            enum: [...allowedRecordSorts],
                          },
                          order: { type: 'string', enum: ['asc', 'desc'] },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      '/records/{releaseId}': {
        get: {
          tags: ['Records'],
          summary: 'Get detailed cached metadata for one release.',
          operationId: 'getRecordDetail',
          parameters: [
            {
              in: 'path',
              name: 'releaseId',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            '200': {
              description: 'Detailed release metadata.',
              content: {
                [jsonContentType]: {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['data'],
                    properties: {
                      data: { $ref: '#/components/schemas/RecordDetail' },
                    },
                  },
                },
              },
            },
            '404': {
              description: 'Release not found in local cache.',
              content: {
                [jsonContentType]: {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      '/stats/summary': {
        get: {
          tags: ['Stats'],
          summary: 'Get collection-wide summary statistics.',
          operationId: 'getStatsSummary',
          responses: {
            '200': {
              description: 'Summary statistics.',
              content: {
                [jsonContentType]: {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['data'],
                    properties: {
                      data: { $ref: '#/components/schemas/StatsSummary' },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      '/stats/dashboard': {
        get: {
          tags: ['Stats'],
          summary:
            'Get a compact dashboard stats payload for dashboards and clients.',
          operationId: 'getStatsDashboard',
          parameters: [
            {
              in: 'query',
              name: 'limit',
              schema: {
                type: 'integer',
                default: 25,
                minimum: 1,
                maximum: 250,
              },
            },
          ],
          responses: {
            '200': {
              description: 'Dashboard statistics.',
              content: {
                [jsonContentType]: {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['data', 'meta'],
                    properties: {
                      data: {
                        $ref: '#/components/schemas/DashboardStats',
                      },
                      meta: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['limit'],
                        properties: {
                          limit: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      '/filters': {
        get: {
          tags: ['Discovery'],
          summary: 'Get filter and facet values for records browsing.',
          operationId: 'getFilters',
          parameters: [
            {
              in: 'query',
              name: 'limit',
              schema: {
                type: 'integer',
                default: 25,
                minimum: 1,
                maximum: 250,
              },
            },
          ],
          responses: {
            '200': {
              description: 'Filter catalog.',
              content: {
                [jsonContentType]: {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['data', 'meta'],
                    properties: {
                      data: { $ref: '#/components/schemas/FilterCatalog' },
                      meta: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['limit'],
                        properties: {
                          limit: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      '/stats/breakdowns/{dimension}': {
        get: {
          tags: ['Stats'],
          summary: 'Get a breakdown for a supported collection dimension.',
          operationId: 'getStatsBreakdown',
          parameters: [
            {
              in: 'path',
              name: 'dimension',
              required: true,
              schema: {
                type: 'string',
                enum: [...allowedBreakdownDimensions],
              },
            },
          ],
          responses: {
            '200': {
              description: 'Breakdown result set.',
              content: {
                [jsonContentType]: {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['data', 'meta'],
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/BreakdownItem' },
                      },
                      meta: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['dimension'],
                        properties: {
                          dimension: {
                            type: 'string',
                            enum: [...allowedBreakdownDimensions],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description:
            'Required for non-local requests when API_READ_KEY is configured.',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Alternative to x-api-key for non-local requests when API_READ_KEY is configured.',
        },
      },
      schemas: {
        ErrorResponse: errorResponseSchema,
        BreakdownItem: breakdownItemSchema,
        RecordListItem: recordListItemSchema,
        RecordDetail: recordDetailSchema,
        StatsSummary: statsSummarySchema,
        FilterCatalog: filterCatalogSchema,
        DashboardStats: dashboardStatsSchema,
      },
    },
  } as const;
}
