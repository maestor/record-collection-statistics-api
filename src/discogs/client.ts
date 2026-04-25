import type {
  DiscogsCollectionFieldsResponse,
  DiscogsCollectionReleasesPage,
  DiscogsCollectionValue,
  DiscogsIdentity,
  DiscogsReleaseDetail,
} from './types.js';

type FetchLike = typeof fetch;

export class DiscogsApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DiscogsApiError';
    this.status = status;
  }
}

export interface DiscogsClientOptions {
  accessToken: string;
  userAgent: string;
  baseUrl: string;
  minIntervalMs: number;
  maxRetries?: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

export class DiscogsClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly minIntervalMs: number;
  private nextRequestAt = 0;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly userAgent: string;

  constructor(options: DiscogsClientOptions) {
    this.accessToken = options.accessToken;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 3;
    this.minIntervalMs = options.minIntervalMs;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.userAgent = options.userAgent;
  }

  async getIdentity(): Promise<DiscogsIdentity> {
    return this.requestJson<DiscogsIdentity>('/oauth/identity');
  }

  async getCollectionFields(
    username: string,
  ): Promise<DiscogsCollectionFieldsResponse> {
    return this.requestJson<DiscogsCollectionFieldsResponse>(
      `/users/${encodeURIComponent(username)}/collection/fields`,
    );
  }

  async getCollectionReleases(
    username: string,
    page: number,
    perPage: number,
  ): Promise<DiscogsCollectionReleasesPage> {
    return this.requestJson<DiscogsCollectionReleasesPage>(
      `/users/${encodeURIComponent(
        username,
      )}/collection/folders/0/releases?page=${page}&per_page=${perPage}`,
    );
  }

  async getCollectionValue(username: string): Promise<DiscogsCollectionValue> {
    return this.requestJson<DiscogsCollectionValue>(
      `/users/${encodeURIComponent(username)}/collection/value`,
    );
  }

  async getRelease(releaseId: number): Promise<DiscogsReleaseDetail> {
    return this.requestJson<DiscogsReleaseDetail>(`/releases/${releaseId}`);
  }

  private async requestJson<T>(pathAndQuery: string): Promise<T> {
    let attempt = 0;

    while (true) {
      await this.waitForRateLimitSlot();

      const response = await this.fetchImpl(`${this.baseUrl}${pathAndQuery}`, {
        headers: {
          Authorization: `Discogs token=${this.accessToken}`,
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      const responseText = await response.text();
      if (this.shouldRetry(response.status) && attempt < this.maxRetries) {
        attempt += 1;
        await this.sleep(this.computeRetryDelayMs(response, attempt));
        continue;
      }

      throw new DiscogsApiError(
        `Discogs request failed with status ${response.status}: ${responseText}`,
        response.status,
      );
    }
  }

  private async waitForRateLimitSlot(): Promise<void> {
    const now = Date.now();
    const delayMs = Math.max(0, this.nextRequestAt - now);
    this.nextRequestAt = Math.max(now, this.nextRequestAt) + this.minIntervalMs;

    if (delayMs > 0) {
      await this.sleep(delayMs);
    }
  }

  private shouldRetry(status: number): boolean {
    return status === 429 || (status >= 500 && status <= 599);
  }

  private computeRetryDelayMs(response: Response, attempt: number): number {
    const retryAfterHeader = response.headers.get('retry-after');
    if (retryAfterHeader) {
      const parsedSeconds = Number.parseFloat(retryAfterHeader);
      if (Number.isFinite(parsedSeconds) && parsedSeconds >= 0) {
        return parsedSeconds * 1000;
      }
    }

    return Math.min(1000 * 2 ** (attempt - 1), 5000);
  }
}
