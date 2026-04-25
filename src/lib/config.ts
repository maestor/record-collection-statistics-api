import { config as loadDotEnv } from 'dotenv';

import type { DatabaseConnectionOptions } from './database.js';

loadDotEnv();

// Type-only configuration contracts; Node coverage can map erased interface
// members back into the TypeScript source.
/* node:coverage disable */
export interface RuntimeConfig {
  apiReadKey?: string;
  databasePath: string;
  port: number;
  tursoAuthToken?: string;
  tursoDatabaseUrl?: string;
  useRemoteDb: boolean;
}

export interface DiscogsImportConfig extends RuntimeConfig {
  discogsAccessToken: string;
  discogsBaseUrl: string;
  discogsUserAgent: string;
  releaseTtlDays: number;
  minIntervalMs: number;
}
/* node:coverage enable */

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

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];

  if (!raw) {
    return defaultValue;
  }

  const normalized = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`Environment variable ${name} must be a boolean.`);
}

export function loadRuntimeConfig(): RuntimeConfig {
  const apiReadKey = process.env.API_READ_KEY?.trim();
  const tursoDatabaseUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoAuthToken = process.env.TURSO_AUTH_TOKEN?.trim();
  const useRemoteDb = readBooleanEnv('USE_REMOTE_DB', false);

  return {
    ...(apiReadKey ? { apiReadKey } : {}),
    ...(tursoDatabaseUrl ? { tursoDatabaseUrl } : {}),
    ...(tursoAuthToken ? { tursoAuthToken } : {}),
    databasePath: readStringEnv('DATABASE_PATH', 'var/discogs.sqlite'),
    port: readIntegerEnv('PORT', 3000),
    useRemoteDb,
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

export function buildDatabaseConnectionOptions(
  config: RuntimeConfig,
): DatabaseConnectionOptions {
  return {
    databasePath: config.databasePath,
    useRemoteDb: config.useRemoteDb,
    ...(config.tursoAuthToken ? { tursoAuthToken: config.tursoAuthToken } : {}),
    ...(config.tursoDatabaseUrl
      ? { tursoDatabaseUrl: config.tursoDatabaseUrl }
      : {}),
  };
}

export function describeDatabaseTarget(config: RuntimeConfig): string {
  if (config.useRemoteDb) {
    return `remote database (${config.tursoDatabaseUrl ?? 'unknown url'})`;
  }

  return `local database (${config.databasePath})`;
}
