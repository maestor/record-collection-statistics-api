import { endOfDayUtc, startOfDayUtc } from '../lib/time.js';

export const allowedRecordSorts = [
  'date_added',
  'release_year',
  'artist',
  'title',
  'lowest_price',
] as const;
export type RecordSort = (typeof allowedRecordSorts)[number];

export type SortOrder = 'asc' | 'desc';

export const allowedBreakdownDimensions = [
  'artist',
  'label',
  'format',
  'genre',
  'style',
  'country',
  'release_year',
  'added_year',
] as const;
export type BreakdownDimension = (typeof allowedBreakdownDimensions)[number];

export interface RecordsQueryInput {
  addedFrom?: string;
  addedTo?: string;
  artist?: string;
  country?: string;
  format?: string;
  genre?: string;
  label?: string;
  order: SortOrder;
  page: number;
  pageSize: number;
  q?: string;
  sort: RecordSort;
  style?: string;
  yearFrom?: number;
  yearTo?: number;
}

const recordsQueryKeys = new Set([
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
]);

const limitOnlyQueryKeys = new Set(['limit']);
const filterCatalogQueryKeys = new Set(['limit', 'dimensions']);

export function validateAllowedQueryKeys(
  rawQuery: Record<string, string | undefined>,
  allowedKeys: ReadonlySet<string>,
  endpointName: string,
): void {
  const unknownKeys = Object.keys(rawQuery)
    .filter((key) => !allowedKeys.has(key))
    .sort();

  if (unknownKeys.length === 0) {
    return;
  }

  throw new Error(
    `${endpointName} does not support query parameter(s): ${unknownKeys.join(', ')}`,
  );
}

export function validateRecordsQueryKeys(
  rawQuery: Record<string, string | undefined>,
): void {
  validateAllowedQueryKeys(rawQuery, recordsQueryKeys, '/records');
}

export function validateLimitOnlyQueryKeys(
  rawQuery: Record<string, string | undefined>,
  endpointName: string,
): void {
  validateAllowedQueryKeys(rawQuery, limitOnlyQueryKeys, endpointName);
}

export function validateFilterCatalogQueryKeys(
  rawQuery: Record<string, string | undefined>,
): void {
  validateAllowedQueryKeys(rawQuery, filterCatalogQueryKeys, '/filters');
}

export function parseFacetLimit(value: string | undefined): number {
  if (!value) {
    return 25;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('limit must be a positive integer.');
  }

  return Math.min(parsed, 250);
}

function parseOptionalTrimmedString(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  label: string,
): number {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} must be a positive integer.`);
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}

function parseOptionalInteger(
  value: string | undefined,
  label: string,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (trimmed === '' || !Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer.`);
  }

  return parsed;
}

function parseDateBoundary(
  value: string | undefined,
  mode: 'start' | 'end',
  label: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.valueOf())) {
    throw new Error(`${label} must be a valid date or ISO timestamp.`);
  }

  if (value === parsedDate.toISOString().slice(0, 10)) {
    return mode === 'start' ? startOfDayUtc(value) : endOfDayUtc(value);
  }

  return parsedDate.toISOString();
}

export function parseRecordsQuery(
  rawQuery: Record<string, string | undefined>,
): RecordsQueryInput {
  const page = parsePositiveInteger(rawQuery.page, 1, 'page');
  const pageSize = Math.min(
    parsePositiveInteger(rawQuery.page_size, 25, 'page_size'),
    100,
  );

  const sort = (rawQuery.sort ?? 'date_added') as RecordSort;
  if (!allowedRecordSorts.includes(sort)) {
    throw new Error(`sort must be one of: ${allowedRecordSorts.join(', ')}`);
  }

  const order = (rawQuery.order ?? 'desc') as SortOrder;
  if (order !== 'asc' && order !== 'desc') {
    throw new Error('order must be either asc or desc.');
  }

  const yearFrom = parseOptionalInteger(rawQuery.year_from, 'year_from');
  const yearTo = parseOptionalInteger(rawQuery.year_to, 'year_to');
  if (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo) {
    throw new Error('year_from cannot be greater than year_to.');
  }

  const addedFrom = parseDateBoundary(
    rawQuery.added_from,
    'start',
    'added_from',
  );
  const addedTo = parseDateBoundary(rawQuery.added_to, 'end', 'added_to');
  if (addedFrom && addedTo && addedFrom > addedTo) {
    throw new Error('added_from cannot be greater than added_to.');
  }

  const q = parseOptionalTrimmedString(rawQuery.q);
  const artist = parseOptionalTrimmedString(rawQuery.artist);
  const label = parseOptionalTrimmedString(rawQuery.label);
  const genre = parseOptionalTrimmedString(rawQuery.genre);
  const style = parseOptionalTrimmedString(rawQuery.style);
  const format = parseOptionalTrimmedString(rawQuery.format);
  const country = parseOptionalTrimmedString(rawQuery.country);

  return {
    page,
    pageSize,
    sort,
    order,
    ...(q ? { q } : {}),
    ...(artist ? { artist } : {}),
    ...(label ? { label } : {}),
    ...(genre ? { genre } : {}),
    ...(style ? { style } : {}),
    ...(format ? { format } : {}),
    ...(country ? { country } : {}),
    ...(yearFrom !== undefined ? { yearFrom } : {}),
    ...(yearTo !== undefined ? { yearTo } : {}),
    ...(addedFrom ? { addedFrom } : {}),
    ...(addedTo ? { addedTo } : {}),
  };
}

export function parseReleaseId(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('releaseId must be a positive integer.');
  }

  return parsed;
}

export function parseBreakdownDimension(value: string): BreakdownDimension {
  if (allowedBreakdownDimensions.includes(value as BreakdownDimension)) {
    return value as BreakdownDimension;
  }

  throw new Error(
    `dimension must be one of: ${allowedBreakdownDimensions.join(', ')}`,
  );
}

export function parseBreakdownDimensions(
  value: string | undefined,
): BreakdownDimension[] | undefined {
  if (!value) {
    return undefined;
  }

  const requestedDimensions = value
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  if (requestedDimensions.length === 0) {
    throw new Error(
      `dimensions must include at least one of: ${allowedBreakdownDimensions.join(', ')}`,
    );
  }

  if (
    requestedDimensions.some(
      (dimension) =>
        !allowedBreakdownDimensions.includes(dimension as BreakdownDimension),
    )
  ) {
    throw new Error(
      `dimensions must be a comma-separated list of: ${allowedBreakdownDimensions.join(', ')}`,
    );
  }

  const normalizedDimensions = allowedBreakdownDimensions.filter((dimension) =>
    requestedDimensions.includes(dimension),
  );

  return normalizedDimensions;
}
