import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DiscogsCollectionFieldValue,
  DiscogsReleaseDetail,
} from '../src/discogs/types.js';
import {
  normalizeCollectionFieldValue,
  normalizeReleaseDetail,
} from '../src/importer/mappers.js';
import { readFixture } from './helpers.js';

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
