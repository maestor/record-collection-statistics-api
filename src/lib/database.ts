import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  type Client,
  createClient,
  type InArgs,
  type ResultSet,
  type Transaction,
} from '@libsql/client';

export interface DatabaseConnectionOptions {
  databasePath: string;
  tursoAuthToken?: string;
  tursoDatabaseUrl?: string;
  useRemoteDb?: boolean;
}

interface DatabaseExecutor {
  execute(stmt: { args?: InArgs; sql: string }): Promise<ResultSet>;
  executeMultiple(sql: string): Promise<void>;
}

export class DatabaseSession {
  protected readonly executor: DatabaseExecutor;

  constructor(executor: DatabaseExecutor) {
    this.executor = executor;
  }

  async execute(sql: string, args: InArgs = []): Promise<ResultSet> {
    return this.executor.execute({ sql, args });
  }

  async executeMultiple(sql: string): Promise<void> {
    await this.executor.executeMultiple(sql);
  }

  async queryAll<T>(sql: string, args: InArgs = []): Promise<T[]> {
    const result = await this.execute(sql, args);
    return result.rows as T[];
  }

  async queryOne<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
    const rows = await this.queryAll<T>(sql, args);
    return rows[0];
  }
}

class TransactionSession extends DatabaseSession {
  private readonly transaction: Transaction;

  constructor(transaction: Transaction) {
    super(transaction);
    this.transaction = transaction;
  }

  async commit(): Promise<void> {
    await this.transaction.commit();
  }

  async rollback(): Promise<void> {
    await this.transaction.rollback();
  }

  close(): void {
    if (!this.transaction.closed) {
      this.transaction.close();
    }
  }
}

export class DatabaseClient extends DatabaseSession {
  private readonly client: Client;

  constructor(client: Client) {
    super(client);
    this.client = client;
  }

  get protocol(): string {
    return this.client.protocol;
  }

  async withTransaction<T>(
    callback: (transaction: DatabaseSession) => Promise<T>,
  ): Promise<T> {
    const transaction = new TransactionSession(
      await this.client.transaction('write'),
    );

    try {
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    } finally {
      transaction.close();
    }
  }

  close(): void {
    this.client.close();
  }
}

export function openDatabase(
  options: DatabaseConnectionOptions,
): DatabaseClient {
  const useRemoteDb = options.useRemoteDb ?? false;

  if (useRemoteDb) {
    if (!options.tursoDatabaseUrl?.trim()) {
      throw new Error(
        'TURSO_DATABASE_URL is required when USE_REMOTE_DB is true.',
      );
    }

    if (!options.tursoAuthToken?.trim()) {
      throw new Error(
        'TURSO_AUTH_TOKEN is required when USE_REMOTE_DB is true.',
      );
    }

    return new DatabaseClient(
      createClient({
        url: options.tursoDatabaseUrl,
        authToken: options.tursoAuthToken,
      }),
    );
  }

  mkdirSync(dirname(options.databasePath), { recursive: true });

  return new DatabaseClient(
    createClient({
      url: `file:${options.databasePath}`,
    }),
  );
}
