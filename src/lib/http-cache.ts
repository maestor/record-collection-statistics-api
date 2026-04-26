import { createHash } from 'node:crypto';

const cacheControlValue = 'private, max-age=60, stale-while-revalidate=300';

function createHashDigest(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

export function createOpaqueEtag(...parts: string[]): string {
  return `W/"${createHashDigest(parts.join('|'))}"`;
}

export function createNotModifiedResponse(etag: string): Response {
  return new Response(null, {
    status: 304,
    headers: new Headers({
      'Cache-Control': cacheControlValue,
      ETag: etag,
    }),
  });
}

export function createJsonCacheResponse(
  payload: unknown,
  options?: {
    etag?: string;
    ifNoneMatch?: string | null;
    status?: number;
  },
): Response {
  const body = JSON.stringify(payload);
  const etag = options?.etag ?? `"${createHashDigest(body)}"`;
  const headers = new Headers({
    'Cache-Control': cacheControlValue,
    ETag: etag,
    'Content-Type': 'application/json; charset=utf-8',
  });

  if (options?.ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(body, {
    status: options?.status ?? 200,
    headers,
  });
}
