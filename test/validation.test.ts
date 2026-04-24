import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseBreakdownDimension,
  parseFacetLimit,
  parseRecordsQuery,
  parseReleaseId,
  validateAllowedQueryKeys,
  validateLimitOnlyQueryKeys,
  validateRecordsQueryKeys,
} from '../src/http/validation.js';

test('records validation accepts the full supported query shape and trims text filters', () => {
  const rawQuery = {
    q: '  night drive  ',
    artist: '  Alpha Artist  ',
    label: 'Aurora Audio',
    genre: 'Rock',
    style: 'Indie Rock',
    format: 'CD',
    country: 'Finland',
    year_from: '1999',
    year_to: '2005',
    added_from: '2024-01-02',
    added_to: '2024-01-03',
    page: '2',
    page_size: '150',
    sort: 'title',
    order: 'asc',
  };

  assert.doesNotThrow(() => validateRecordsQueryKeys(rawQuery));

  assert.deepEqual(parseRecordsQuery(rawQuery), {
    q: 'night drive',
    artist: 'Alpha Artist',
    label: 'Aurora Audio',
    genre: 'Rock',
    style: 'Indie Rock',
    format: 'CD',
    country: 'Finland',
    yearFrom: 1999,
    yearTo: 2005,
    addedFrom: '2024-01-02T00:00:00.000Z',
    addedTo: '2024-01-03T23:59:59.999Z',
    page: 2,
    pageSize: 100,
    sort: 'title',
    order: 'asc',
  });
});

test('records validation rejects unsupported query keys in sorted error order', () => {
  assert.throws(
    () => validateRecordsQueryKeys({ nope: '1' }),
    /\/records does not support query parameter\(s\): nope/,
  );

  assert.throws(
    () =>
      validateAllowedQueryKeys(
        { zebra: '1', alpha: '2' },
        new Set(['page']),
        '/example',
      ),
    /\/example does not support query parameter\(s\): alpha, zebra/,
  );

  assert.throws(
    () => validateLimitOnlyQueryKeys({ limit: '5', genre: 'Rock' }, '/filters'),
    /\/filters does not support query parameter\(s\): genre/,
  );
});

test('records validation rejects invalid positive integers, ranges, and order values', () => {
  assert.deepEqual(parseRecordsQuery({ page: ' 2 ', page_size: ' 5 ' }), {
    page: 2,
    pageSize: 5,
    sort: 'date_added',
    order: 'desc',
  });
  assert.deepEqual(
    parseRecordsQuery({ year_from: ' 1999 ', year_to: '1999' }),
    {
      page: 1,
      pageSize: 25,
      sort: 'date_added',
      order: 'desc',
      yearFrom: 1999,
      yearTo: 1999,
    },
  );
  assert.throws(
    () => parseRecordsQuery({ page: '0' }),
    /page must be a positive integer\./,
  );
  assert.throws(
    () => parseRecordsQuery({ page: '12abc' }),
    /page must be a positive integer\./,
  );
  assert.throws(
    () => parseRecordsQuery({ page_size: '4.5' }),
    /page_size must be a positive integer\./,
  );
  assert.throws(
    () => parseRecordsQuery({ sort: 'unknown' }),
    /sort must be one of: date_added, release_year, artist, title, lowest_price/,
  );
  assert.throws(
    () => parseRecordsQuery({ sort: 'title', order: 'sideways' }),
    /order must be either asc or desc\./,
  );
  assert.throws(
    () => parseRecordsQuery({ year_from: '2005', year_to: '1999' }),
    /year_from cannot be greater than year_to\./,
  );
  assert.throws(
    () => parseRecordsQuery({ year_from: '1999.5' }),
    /year_from must be an integer\./,
  );
  assert.throws(
    () => parseRecordsQuery({ year_from: '  ' }),
    /year_from must be an integer\./,
  );
  assert.throws(
    () => parseRecordsQuery({ year_to: '1999.5' }),
    /year_to must be an integer\./,
  );
  assert.deepEqual(
    parseRecordsQuery({ added_from: '2024-01-01', added_to: '2024-01-01' }),
    {
      page: 1,
      pageSize: 25,
      sort: 'date_added',
      order: 'desc',
      addedFrom: '2024-01-01T00:00:00.000Z',
      addedTo: '2024-01-01T23:59:59.999Z',
    },
  );
  assert.deepEqual(
    parseRecordsQuery({
      added_from: '2024-01-02T12:34:56.000Z',
      added_to: '2024-01-02T12:34:56.000Z',
    }),
    {
      page: 1,
      pageSize: 25,
      sort: 'date_added',
      order: 'desc',
      addedFrom: '2024-01-02T12:34:56.000Z',
      addedTo: '2024-01-02T12:34:56.000Z',
    },
  );
  assert.throws(
    () =>
      parseRecordsQuery({ added_from: '2024-02-01', added_to: '2024-01-01' }),
    /added_from cannot be greater than added_to\./,
  );
  assert.throws(
    () => parseRecordsQuery({ added_from: 'not-a-date' }),
    /added_from must be a valid date or ISO timestamp\./,
  );
  assert.throws(
    () => parseRecordsQuery({ added_to: 'not-a-date' }),
    /added_to must be a valid date or ISO timestamp\./,
  );
});

test('facet, release, and breakdown validation reject malformed values', () => {
  assert.equal(parseFacetLimit(undefined), 25);
  assert.equal(parseFacetLimit('400'), 250);
  assert.throws(
    () => parseFacetLimit('nope'),
    /limit must be a positive integer\./,
  );

  assert.equal(parseReleaseId(' 101 '), 101);
  assert.throws(
    () => parseReleaseId('0'),
    /releaseId must be a positive integer\./,
  );
  assert.throws(
    () => parseReleaseId('101abc'),
    /releaseId must be a positive integer\./,
  );
  assert.throws(
    () => parseReleaseId('abc101'),
    /releaseId must be a positive integer\./,
  );

  assert.equal(parseBreakdownDimension('artist'), 'artist');
  assert.throws(
    () => parseBreakdownDimension('decade'),
    /dimension must be one of: artist, label, format, genre, style, country, release_year, added_year/,
  );
});
