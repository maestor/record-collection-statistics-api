import { createHash } from 'node:crypto';

const cacheControlValue = 'private, max-age=60, stale-while-revalidate=300';

export function createJsonCacheResponse(
  payload: unknown,
  options?: {
    ifNoneMatch?: string | null;
    status?: number;
  },
): Response {
  const body = JSON.stringify(payload);
  const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
  const headers = new Headers({
    'Cache-Control': cacheControlValue,
    ETag: etag,
    'Content-Type': 'application/json; charset=utf-8',
  });

  if (options?.ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers,
    });
  }

  return new Response(body, {
    status: options?.status ?? 200,
    headers,
  });
}
