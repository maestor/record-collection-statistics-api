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
  private readonly releaseTtlDays: number;
  private readonly repository: ImportRepository;

  constructor(options: DiscogsImporterOptions) {
    this.client = options.client;
    this.fullRefresh = options.fullRefresh ?? false;
    this.now = options.now ?? (() => new Date());
    this.releaseTtlDays = options.releaseTtlDays;
    this.repository = options.repository;
  }

  async run(): Promise<DiscogsImportSummary> {
    const startedAt = this.now().toISOString();
    const syncRun = this.repository.startSyncRun({
      fullRefresh: this.fullRefresh,
      releaseTtlDays: this.releaseTtlDays,
      startedAt,
    });

    try {
      const identity = await this.client.getIdentity();
      this.repository.updateRunProgress(syncRun.id, {
        username: identity.username,
      });

      const fieldsResponse = await this.client.getCollectionFields(
        identity.username,
      );
      this.repository.upsertCollectionFields(
        fieldsResponse.fields.map((field) =>
          normalizeCollectionField(field, this.now().toISOString()),
        ),
      );

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

        this.persistCollectionPage(
          syncRun.id,
          pageResponse.releases,
          fieldsResponse.fields,
        );
        collectionItemsSeen += pageResponse.releases.length;

        this.repository.updateRunProgress(syncRun.id, {
          pagesProcessedDelta: 1,
          itemsSeenDelta: pageResponse.releases.length,
        });

        page += 1;
      } while (page <= totalPages);

      const currentReleaseIds = this.repository.listReleaseIdsSeenInRun(
        syncRun.id,
      );
      const releaseIdsToRefresh = this.fullRefresh
        ? currentReleaseIds
        : this.repository.listReleaseIdsNeedingRefresh(
            currentReleaseIds,
            this.now().toISOString(),
          );

      let releasesRefreshed = 0;
      for (const releaseId of releaseIdsToRefresh) {
        const fetchedAt = this.now().toISOString();
        const detail = await this.client.getRelease(releaseId);
        const normalizedRelease = normalizeReleaseDetail(
          detail,
          fetchedAt,
          this.releaseTtlDays,
        );
        this.repository.upsertRelease(normalizedRelease);
        releasesRefreshed += 1;
        this.repository.updateRunProgress(syncRun.id, {
          releasesRefreshedDelta: 1,
        });
      }

      this.repository.pruneCollectionItemsNotSeenInRun(syncRun.id);
      const completedAt = this.now().toISOString();
      this.repository.setSyncState(
        'last_successful_sync_at',
        completedAt,
        completedAt,
      );
      this.repository.setSyncState(
        'last_successful_username',
        identity.username,
        completedAt,
      );
      this.repository.finishRunSuccess(syncRun.id, completedAt);

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
      this.repository.finishRunFailure(syncRun.id, completedAt, errorMessage);
      throw error;
    }
  }

  private persistCollectionPage(
    runId: number,
    releases: DiscogsCollectionRelease[],
    fields: DiscogsCollectionField[],
  ): void {
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

    this.repository.upsertCollectionItems(normalizedItems, valuesByInstance);
  }
}
