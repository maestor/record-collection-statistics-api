import { config as loadDotEnv } from 'dotenv';

loadDotEnv();

export interface RuntimeConfig {
  apiReadKey?: string;
  databasePath: string;
  port: number;
}

export interface DiscogsImportConfig extends RuntimeConfig {
  discogsAccessToken: string;
  discogsBaseUrl: string;
  discogsUserAgent: string;
  releaseTtlDays: number;
  minIntervalMs: number;
}

function readStringEnv(
  name: string,
  defaultValue?: string,
  required = false,
): string {
  const value = process.env[name] ?? defaultValue;
  if (required && (!value || value.trim() === '')) {
    throw new Error(`Environment variable ${name} is required.`);
  }

  if (!value) {
    throw new Error(`Environment variable ${name} is not configured.`);
  }

  return value;
}

function readIntegerEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];

  if (!raw) {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer.`);
  }

  return parsed;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const apiReadKey = process.env.API_READ_KEY?.trim();

  return {
    ...(apiReadKey ? { apiReadKey } : {}),
    databasePath: readStringEnv('DATABASE_PATH', 'var/discogs.sqlite'),
    port: readIntegerEnv('PORT', 3000),
  };
}

export function loadDiscogsImportConfig(): DiscogsImportConfig {
  const runtime = loadRuntimeConfig();

  return {
    ...runtime,
    discogsAccessToken: readStringEnv('DISCOGS_ACCESS_TOKEN', undefined, true),
    discogsBaseUrl: readStringEnv(
      'DISCOGS_BASE_URL',
      'https://api.discogs.com',
    ),
    discogsUserAgent: readStringEnv(
      'DISCOGS_USER_AGENT',
      'record-collection-statistics-api/0.1 (+local)',
    ),
    releaseTtlDays: readIntegerEnv('DISCOGS_RELEASE_TTL_DAYS', 30),
    minIntervalMs: readIntegerEnv('DISCOGS_MIN_INTERVAL_MS', 1100),
  };
}
