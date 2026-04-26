import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DiscogsCollectionField,
  DiscogsCollectionFieldValue,
  DiscogsCollectionRelease,
  DiscogsReleaseDetail,
} from '../src/discogs/types.js';
import {
  normalizeCollectionField,
  normalizeCollectionFieldValue,
  normalizeCollectionItem,
  normalizeCollectionValue,
  normalizeReleaseDetail,
} from '../src/importer/mappers.js';
import { readFixture } from './helpers.js';

test('normalizeCollectionField maps public fields and nullable metadata', () => {
  const publicField: DiscogsCollectionField = {
    id: 7,
    name: 'Public Notes',
    type: 'textarea',
    position: 4,
    public: true,
  };

  assert.deepEqual(
    normalizeCollectionField(publicField, '2026-04-23T10:00:00.000Z'),
    {
      fieldId: 7,
      name: 'Public Notes',
      fieldType: 'textarea',
      position: 4,
      isPublic: 1,
      optionsJson: null,
      lines: null,
      rawJson: JSON.stringify(publicField),
      updatedAt: '2026-04-23T10:00:00.000Z',
    },
  );
});

test('normalizeCollectionFieldValue rejects invalid field ids and preserves valid values', () => {
  const invalidNote = {
    field_id: 'not-a-number',
    value: 'Mint (M)',
  } as DiscogsCollectionFieldValue;
  const validNote = {
    field_id: '2',
    value: 'Very Good Plus (VG+)',
  } as DiscogsCollectionFieldValue;

  assert.equal(
    normalizeCollectionFieldValue(77, invalidNote, '2026-04-23T10:00:00.000Z'),
    null,
  );

  assert.deepEqual(
    normalizeCollectionFieldValue(77, validNote, '2026-04-23T10:00:00.000Z'),
    {
      instanceId: 77,
      fieldId: 2,
      valueText: 'Very Good Plus (VG+)',
      rawJson: JSON.stringify(validNote),
      updatedAt: '2026-04-23T10:00:00.000Z',
    },
  );
});

test('normalizeCollectionItem maps collection release payloads into cache rows', () => {
  const item = {
    id: 101,
    instance_id: 1001,
    folder_id: 2,
    date_added: '2026-04-23T10:00:00-07:00',
    rating: 4,
    basic_information: {
      id: 101,
      resource_url: 'https://api.discogs.com/releases/101',
      title: 'Northern Lights',
    },
  } as DiscogsCollectionRelease;

  assert.deepEqual(
    normalizeCollectionItem(item, 77, '2026-04-23T10:00:00.000Z'),
    {
      instanceId: 1001,
      releaseId: 101,
      folderId: 2,
      rating: 4,
      dateAdded: '2026-04-23T17:00:00.000Z',
      lastSeenSyncRunId: 77,
      rawJson: JSON.stringify(item),
      createdAt: '2026-04-23T10:00:00.000Z',
      updatedAt: '2026-04-23T10:00:00.000Z',
    },
  );
});

test('normalizeCollectionValue parses formatted currency strings into numbers', () => {
  assert.deepEqual(
    normalizeCollectionValue({
      minimum: '€16,766.49',
      median: ' 38.037,01 € ',
      maximum: '¥123,456',
    }),
    {
      minimum: 16766.49,
      median: 38037.01,
      maximum: 123456,
    },
  );
});

test('normalizeCollectionValue returns null for blank or non-numeric inputs', () => {
  assert.deepEqual(
    normalizeCollectionValue({
      minimum: ' ',
      median: '42',
      maximum: 'abc',
    }),
    {
      minimum: null,
      median: 42,
      maximum: null,
    },
  );
});

test('normalizeCollectionValue drops malformed numeric strings after cleanup', () => {
  assert.deepEqual(
    normalizeCollectionValue({
      minimum: '-',
      median: '--,5',
      maximum: '--.',
    }),
    {
      minimum: null,
      median: null,
      maximum: null,
    },
  );
});

test('normalizeCollectionValue handles completely missing values', () => {
  assert.deepEqual(normalizeCollectionValue({}), {
    minimum: null,
    median: null,
    maximum: null,
  });
});

test('normalizeCollectionValue preserves one-digit decimals and trailing separators', () => {
  assert.deepEqual(
    normalizeCollectionValue({
      minimum: '$12.3',
      median: '$12.',
      maximum: '$12,34',
    }),
    {
      minimum: 12.3,
      median: 12,
      maximum: 12.34,
    },
  );
});

test('normalizeReleaseDetail maps cover image, collection arrays, and track defaults', () => {
  const release = readFixture<DiscogsReleaseDetail>('release-101.json');
  const normalized = normalizeReleaseDetail(
    {
      ...release,
      tracklist: [
        {
          position: 'A1',
          title: 'Polar Night',
          duration: '4:05',
        },
      ],
    } as DiscogsReleaseDetail,
    '2026-04-23T10:00:00.000Z',
    30,
  );

  assert.equal(
    normalized.coverImage,
    'https://example.test/release-101-cover.jpg',
  );
  assert.equal(normalized.thumb, 'https://example.test/release-101-thumb.jpg');
  assert.deepEqual(normalized.genres, [{ genre: 'Rock' }]);
  assert.deepEqual(normalized.styles, [{ style: 'Indie Rock' }]);
  assert.deepEqual(normalized.formats, [
    {
      position: 0,
      name: 'CD',
      qty: '1',
      formatText: null,
      descriptionsJson: JSON.stringify(['Album']),
    },
  ]);
  assert.deepEqual(normalized.tracks, [
    {
      position: 0,
      trackPosition: 'A1',
      trackType: 'track',
      title: 'Polar Night',
      duration: '4:05',
      extraartistsJson: '[]',
    },
  ]);
});

test('normalizeReleaseDetail preserves empty defaults for missing collection arrays', () => {
  const normalized = normalizeReleaseDetail(
    {
      id: 303,
      title: 'Sparse Release',
      formats: [
        {
          name: 'Cassette',
        },
      ],
    } as DiscogsReleaseDetail,
    '2026-04-23T10:00:00.000Z',
    30,
  );

  assert.deepEqual(normalized.formats, [
    {
      position: 0,
      name: 'Cassette',
      qty: null,
      formatText: null,
      descriptionsJson: '[]',
    },
  ]);
  assert.deepEqual(normalized.genres, []);
  assert.deepEqual(normalized.styles, []);
});

test('normalizeReleaseDetail maps sparse nested relation entries', () => {
  const normalized = normalizeReleaseDetail(
    {
      id: 404,
      title: 'Sparse Relations',
      artists: [
        {
          name: 'Anonymous Artist',
        },
      ],
      labels: [
        {
          name: 'White Label',
        },
      ],
      identifiers: [
        {
          type: 'Catalog Number',
          value: 'WL-404',
        },
      ],
    } as DiscogsReleaseDetail,
    '2026-04-23T10:00:00.000Z',
    30,
  );

  assert.deepEqual(normalized.artists, [
    {
      position: 0,
      artistId: null,
      name: 'Anonymous Artist',
      anv: null,
      joinText: null,
      role: null,
      tracks: null,
      resourceUrl: null,
      thumbnailUrl: null,
    },
  ]);
  assert.deepEqual(normalized.labels, [
    {
      position: 0,
      labelId: null,
      name: 'White Label',
      catno: null,
      entityType: null,
      entityTypeName: null,
      resourceUrl: null,
      thumbnailUrl: null,
    },
  ]);
  assert.deepEqual(normalized.identifiers, [
    {
      position: 0,
      identifierType: 'Catalog Number',
      value: 'WL-404',
      description: null,
    },
  ]);
});
