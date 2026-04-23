import type { DiscogsClient } from '../discogs/client.js';
import type {
  DiscogsCollectionField,
  DiscogsCollectionRelease,
} from '../discogs/types.js';
import type { ImportRepository } from '../repositories/import-repository.js';
import {
  normalizeCollectionField,
  normalizeCollectionFieldValue,
  normalizeCollectionItem,
  normalizeReleaseDetail,
} from './mappers.js';

export interface DiscogsImporterOptions {
  client: Pick<
    DiscogsClient,
    | 'getIdentity'
    | 'getCollectionFields'
    | 'getCollectionReleases'
    | 'getRelease'
  >;
  fullRefresh?: boolean;
  now?: () => Date;
  onProgress?: (event: DiscogsImportProgressEvent) => void;
  releaseTtlDays: number;
  repository: ImportRepository;
}

export interface DiscogsImportSummary {
  collectionItemsSeen: number;
  pagesProcessed: number;
  releasesRefreshed: number;
  runId: number;
  username: string;
}

export type DiscogsImportProgressEvent =
  | {
      runId: number;
      startedAt: string;
      type: 'run_started';
    }
  | {
      runId: number;
      totalFields: number;
      type: 'collection_fields_loaded';
      username: string;
    }
  | {
      collectionItemsSeen: number;
      itemsOnPage: number;
      page: number;
      runId: number;
      totalPages: number;
      type: 'collection_page_synced';
    }
  | {
      releaseCountInCollection: number;
      releaseCountToRefresh: number;
      runId: number;
      type: 'release_refresh_planned';
    }
  | {
      processed: number;
      releaseId: number;
      runId: number;
      totalToRefresh: number;
      type: 'release_refreshed';
    }
  | {
      releasesRefreshed: number;
      runId: number;
      type: 'release_refresh_skipped';
    }
  | {
      collectionItemsSeen: number;
      completedAt: string;
      pagesProcessed: number;
      releasesRefreshed: number;
      runId: number;
      type: 'run_completed';
      username: string;
    };

export class DiscogsImporter {
  private readonly client: Pick<
    DiscogsClient,
    | 'getIdentity'
    | 'getCollectionFields'
    | 'getCollectionReleases'
    | 'getRelease'
  >;
  private readonly fullRefresh: boolean;
  private readonly now: () => Date;
  private readonly onProgress:
    | ((event: DiscogsImportProgressEvent) => void)
    | undefined;
  private readonly releaseTtlDays: number;
  private readonly repository: ImportRepository;

  constructor(options: DiscogsImporterOptions) {
    this.client = options.client;
    this.fullRefresh = options.fullRefresh ?? false;
    this.now = options.now ?? (() => new Date());
    this.onProgress = options.onProgress;
    this.releaseTtlDays = options.releaseTtlDays;
    this.repository = options.repository;
  }

  async run(): Promise<DiscogsImportSummary> {
    const startedAt = this.now().toISOString();
    const syncRun = await this.repository.startSyncRun({
      fullRefresh: this.fullRefresh,
      releaseTtlDays: this.releaseTtlDays,
      startedAt,
    });
    this.emitProgress({
      type: 'run_started',
      runId: syncRun.id,
      startedAt,
    });

    try {
      const identity = await this.client.getIdentity();
      await this.repository.updateRunProgress(syncRun.id, {
        username: identity.username,
      });

      const fieldsResponse = await this.client.getCollectionFields(
        identity.username,
      );
      await this.repository.upsertCollectionFields(
        fieldsResponse.fields.map((field) =>
          normalizeCollectionField(field, this.now().toISOString()),
        ),
      );
      this.emitProgress({
        type: 'collection_fields_loaded',
        runId: syncRun.id,
        username: identity.username,
        totalFields: fieldsResponse.fields.length,
      });

      let page = 1;
      let totalPages = 1;
      let collectionItemsSeen = 0;

      do {
        const pageResponse = await this.client.getCollectionReleases(
          identity.username,
          page,
          100,
        );
        totalPages = pageResponse.pagination.pages;

        await this.persistCollectionPage(
          syncRun.id,
          pageResponse.releases,
          fieldsResponse.fields,
        );
        collectionItemsSeen += pageResponse.releases.length;

        await this.repository.updateRunProgress(syncRun.id, {
          pagesProcessedDelta: 1,
          itemsSeenDelta: pageResponse.releases.length,
        });
        this.emitProgress({
          type: 'collection_page_synced',
          runId: syncRun.id,
          page,
          totalPages,
          itemsOnPage: pageResponse.releases.length,
          collectionItemsSeen,
        });

        page += 1;
      } while (page <= totalPages);

      const currentReleaseIds = await this.repository.listReleaseIdsSeenInRun(
        syncRun.id,
      );
      const releaseIdsToRefresh = this.fullRefresh
        ? currentReleaseIds
        : await this.repository.listReleaseIdsNeedingRefresh(
            currentReleaseIds,
            this.now().toISOString(),
          );
      this.emitProgress({
        type: 'release_refresh_planned',
        runId: syncRun.id,
        releaseCountInCollection: currentReleaseIds.length,
        releaseCountToRefresh: releaseIdsToRefresh.length,
      });

      let releasesRefreshed = 0;
      if (releaseIdsToRefresh.length === 0) {
        this.emitProgress({
          type: 'release_refresh_skipped',
          runId: syncRun.id,
          releasesRefreshed,
        });
      }

      for (const releaseId of releaseIdsToRefresh) {
        const fetchedAt = this.now().toISOString();
        const detail = await this.client.getRelease(releaseId);
        const normalizedRelease = normalizeReleaseDetail(
          detail,
          fetchedAt,
          this.releaseTtlDays,
        );
        await this.repository.upsertRelease(normalizedRelease);
        releasesRefreshed += 1;
        await this.repository.updateRunProgress(syncRun.id, {
          releasesRefreshedDelta: 1,
        });
        this.emitProgress({
          type: 'release_refreshed',
          runId: syncRun.id,
          releaseId,
          processed: releasesRefreshed,
          totalToRefresh: releaseIdsToRefresh.length,
        });
      }

      await this.repository.pruneCollectionItemsNotSeenInRun(syncRun.id);
      const completedAt = this.now().toISOString();
      await this.repository.setSyncState(
        'last_successful_sync_at',
        completedAt,
        completedAt,
      );
      await this.repository.setSyncState(
        'last_successful_username',
        identity.username,
        completedAt,
      );
      await this.repository.finishRunSuccess(syncRun.id, completedAt);
      this.emitProgress({
        type: 'run_completed',
        runId: syncRun.id,
        username: identity.username,
        completedAt,
        pagesProcessed: totalPages,
        collectionItemsSeen,
        releasesRefreshed,
      });

      return {
        runId: syncRun.id,
        username: identity.username,
        pagesProcessed: totalPages,
        collectionItemsSeen,
        releasesRefreshed,
      };
    } catch (error) {
      const completedAt = this.now().toISOString();
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown Discogs import error';
      await this.repository.finishRunFailure(
        syncRun.id,
        completedAt,
        errorMessage,
      );
      throw error;
    }
  }

  private async persistCollectionPage(
    runId: number,
    releases: DiscogsCollectionRelease[],
    fields: DiscogsCollectionField[],
  ): Promise<void> {
    const nowIso = this.now().toISOString();
    const knownFieldIds = new Set(fields.map((field) => field.id));
    const normalizedItems = releases.map((release) =>
      normalizeCollectionItem(release, runId, nowIso),
    );
    const valuesByInstance = new Map<
      number,
      NonNullable<ReturnType<typeof normalizeCollectionFieldValue>>[]
    >();

    for (const release of releases) {
      const values = (release.notes ?? [])
        .map((note) =>
          normalizeCollectionFieldValue(release.instance_id, note, nowIso),
        )
        .filter(
          (value): value is NonNullable<typeof value> =>
            value !== null && knownFieldIds.has(value.fieldId),
        );
      valuesByInstance.set(release.instance_id, values);
    }

    await this.repository.upsertCollectionItems(
      normalizedItems,
      valuesByInstance,
    );
  }

  private emitProgress(event: DiscogsImportProgressEvent): void {
    this.onProgress?.(event);
  }
}
