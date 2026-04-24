import type {
  DiscogsCollectionField,
  DiscogsCollectionFieldValue,
  DiscogsCollectionRelease,
  DiscogsReleaseDetail,
} from '../discogs/types.js';
import { addDays, toIsoUtc } from '../lib/time.js';

// Type-only mapper contracts; Node coverage can map erased interface members
// back into the TypeScript source.
/* node:coverage disable */
export interface NormalizedCollectionField {
  fieldId: number;
  fieldType: string;
  isPublic: number;
  lines: number | null;
  name: string;
  optionsJson: string | null;
  position: number;
  rawJson: string;
  updatedAt: string;
}

export interface NormalizedCollectionItem {
  createdAt: string;
  dateAdded: string;
  folderId: number;
  instanceId: number;
  lastSeenSyncRunId: number;
  rating: number;
  rawJson: string;
  releaseId: number;
  updatedAt: string;
}

export interface NormalizedCollectionFieldValue {
  fieldId: number;
  instanceId: number;
  rawJson: string;
  updatedAt: string;
  valueText: string;
}

export interface NormalizedReleaseDetail {
  artists: Array<{
    anv: string | null;
    artistId: number | null;
    joinText: string | null;
    name: string;
    position: number;
    resourceUrl: string | null;
    role: string | null;
    thumbnailUrl: string | null;
    tracks: string | null;
  }>;
  coverImage: string | null;
  country: string | null;
  dataQuality: string | null;
  fetchedAt: string;
  formats: Array<{
    descriptionsJson: string;
    formatText: string | null;
    name: string;
    position: number;
    qty: string | null;
  }>;
  genres: Array<{
    genre: string;
  }>;
  identifiers: Array<{
    description: string | null;
    identifierType: string;
    position: number;
    value: string;
  }>;
  labels: Array<{
    catno: string | null;
    entityType: string | null;
    entityTypeName: string | null;
    labelId: number | null;
    name: string;
    position: number;
    resourceUrl: string | null;
    thumbnailUrl: string | null;
  }>;
  lowestPrice: number | null;
  masterId: number | null;
  numForSale: number | null;
  rawJson: string;
  releaseId: number;
  releaseYear: number | null;
  released: string | null;
  resourceUrl: string | null;
  staleAfter: string;
  status: string | null;
  styles: Array<{
    style: string;
  }>;
  thumb: string | null;
  title: string;
  tracks: Array<{
    duration: string | null;
    extraartistsJson: string;
    position: number;
    title: string;
    trackPosition: string | null;
    trackType: string;
  }>;
  uri: string | null;
  communityHave: number | null;
  communityRatingAverage: number | null;
  communityRatingCount: number | null;
  communityWant: number | null;
  artistsSort: string | null;
}
/* node:coverage enable */

export function normalizeCollectionField(
  field: DiscogsCollectionField,
  nowIso: string,
): NormalizedCollectionField {
  return {
    fieldId: field.id,
    name: field.name,
    fieldType: field.type,
    position: field.position,
    isPublic: field.public ? 1 : 0,
    optionsJson: field.options ? JSON.stringify(field.options) : null,
    lines: field.lines ?? null,
    rawJson: JSON.stringify(field),
    updatedAt: nowIso,
  };
}

export function normalizeCollectionItem(
  item: DiscogsCollectionRelease,
  runId: number,
  nowIso: string,
): NormalizedCollectionItem {
  return {
    instanceId: item.instance_id,
    releaseId: item.id,
    folderId: item.folder_id,
    rating: item.rating,
    dateAdded: toIsoUtc(item.date_added),
    lastSeenSyncRunId: runId,
    rawJson: JSON.stringify(item),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function normalizeCollectionFieldValue(
  instanceId: number,
  note: DiscogsCollectionFieldValue,
  nowIso: string,
): NormalizedCollectionFieldValue | null {
  const fieldId = Number(note.field_id);
  if (!Number.isFinite(fieldId)) {
    return null;
  }

  return {
    instanceId,
    fieldId,
    valueText: note.value,
    rawJson: JSON.stringify(note),
    updatedAt: nowIso,
  };
}

export function normalizeReleaseDetail(
  release: DiscogsReleaseDetail,
  fetchedAt: string,
  releaseTtlDays: number,
): NormalizedReleaseDetail {
  return {
    releaseId: release.id,
    masterId: release.master_id ?? null,
    status: release.status ?? null,
    title: release.title,
    artistsSort: release.artists_sort ?? null,
    releaseYear: release.year ?? null,
    released: release.released ?? null,
    country: release.country ?? null,
    dataQuality:
      release.data_quality ?? release.community?.data_quality ?? null,
    communityHave: release.community?.have ?? null,
    communityWant: release.community?.want ?? null,
    communityRatingCount: release.community?.rating?.count ?? null,
    communityRatingAverage: release.community?.rating?.average ?? null,
    lowestPrice: release.lowest_price ?? null,
    numForSale: release.num_for_sale ?? null,
    thumb: release.thumb ?? null,
    coverImage:
      release.images?.find((image) => image.uri)?.uri ?? release.thumb ?? null,
    resourceUrl: release.resource_url ?? null,
    uri: release.uri ?? null,
    rawJson: JSON.stringify(release),
    fetchedAt,
    staleAfter: addDays(fetchedAt, releaseTtlDays),
    artists:
      release.artists?.map((artist, position) => ({
        position,
        artistId: artist.id ?? null,
        name: artist.name,
        anv: artist.anv ?? null,
        joinText: artist.join ?? null,
        role: artist.role ?? null,
        tracks: artist.tracks ?? null,
        resourceUrl: artist.resource_url ?? null,
        thumbnailUrl: artist.thumbnail_url ?? null,
      })) ?? [],
    labels:
      release.labels?.map((label, position) => ({
        position,
        labelId: label.id ?? null,
        name: label.name,
        catno: label.catno ?? null,
        entityType: label.entity_type ?? null,
        entityTypeName: label.entity_type_name ?? null,
        resourceUrl: label.resource_url ?? null,
        thumbnailUrl: label.thumbnail_url ?? null,
      })) ?? [],
    formats:
      release.formats?.map((format, position) => ({
        position,
        name: format.name,
        qty: format.qty ?? null,
        formatText: format.text ?? null,
        descriptionsJson: JSON.stringify(format.descriptions ?? []),
      })) ?? [],
    genres: (release.genres ?? []).map((genre) => ({ genre })),
    styles: (release.styles ?? []).map((style) => ({ style })),
    identifiers:
      release.identifiers?.map((identifier, position) => ({
        position,
        identifierType: identifier.type,
        value: identifier.value,
        description: identifier.description ?? null,
      })) ?? [],
    tracks:
      release.tracklist?.map((track, position) => ({
        position,
        trackPosition: track.position ?? null,
        trackType: track.type_ ?? 'track',
        title: track.title,
        duration: track.duration ?? null,
        extraartistsJson: JSON.stringify(track.extraartists ?? []),
      })) ?? [],
  };
}
