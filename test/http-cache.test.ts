import assert from 'node:assert/strict';
import test from 'node:test';

import { createJsonNoStoreResponse } from '../src/lib/http-cache.js';

test('createJsonNoStoreResponse returns a no-store JSON response by default', async () => {
  const response = createJsonNoStoreResponse({
    ok: true,
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(
    response.headers.get('content-type'),
    'application/json; charset=utf-8',
  );
  assert.equal(response.headers.get('etag'), null);
  assert.deepEqual(await response.json(), {
    ok: true,
  });
});

test('createJsonNoStoreResponse supports explicit status codes', async () => {
  const response = createJsonNoStoreResponse(
    {
      error: 'No cached releases were found in the local collection cache.',
    },
    {
      status: 404,
    },
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    error: 'No cached releases were found in the local collection cache.',
  });
});
