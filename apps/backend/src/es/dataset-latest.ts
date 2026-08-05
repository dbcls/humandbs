/**
 * Which Dataset doc of a datasetId is the latest one.
 *
 * Search, aggregation and filtering only ever look at the latest version of
 * each datasetId, and Elasticsearch cannot work that out at query time —
 * `collapse` does not apply to aggregations, and there is no way to compare one
 * document's version against its siblings. So each doc carries the answer, and
 * this module is the single definition of it, shared by ingest, the live write
 * paths and the backfill script ([data-model.md § 最新版フラグ]).
 *
 * Two flags, because "latest" differs by viewer: public and non-owners see the
 * latest published version, owners and admins the latest including drafts.
 */
import { isHumVersionAccessible, parseVersionNum } from "@/es/version"

/** The version identity of one Dataset doc — all this module needs. */
export interface DatasetVersionRef {
  version: string
  humId: string
  humVersionId: string
}

export interface DatasetLatestFlags {
  isLatest: boolean
  isLatestPublished: boolean
}

export interface LatestVersions {
  /** Null only when there is no orderable doc at all. */
  latestVersion: string | null
  /** Null when no version of this datasetId is published. */
  latestPublishedVersion: string | null
}

/**
 * Highest version among `versions`, or null when none can be ordered.
 *
 * Versions that do not parse are dropped rather than thrown on: the same doc
 * would break the Painless version sort (`query-builders.ts § versionSortSpec`)
 * anyway, and one malformed document must not take down an ingest run or an
 * approve.
 */
const maxVersion = (versions: string[]): string | null => {
  let best: { version: string; num: number } | null = null
  for (const version of versions) {
    let num: number
    try {
      num = parseVersionNum(version)
    } catch {
      continue
    }
    if (best === null || num > best.num) best = { version, num }
  }

  return best?.version ?? null
}

/**
 * The latest and latest-published version of one datasetId.
 *
 * `ceilingByHumId` maps the parent humId to its `latestVersion` (null when the
 * Research has never been published). Published means the same thing here as it
 * does for the derived dates: at or below the parent's published ceiling.
 */
export const pickLatestVersions = (
  docs: DatasetVersionRef[],
  ceilingByHumId: Map<string, string | null>,
): LatestVersions => ({
  latestVersion: maxVersion(docs.map(d => d.version)),
  latestPublishedVersion: maxVersion(
    docs
      .filter(d => isHumVersionAccessible(d.humVersionId, ceilingByHumId.get(d.humId) ?? null, false))
      .map(d => d.version),
  ),
})

/**
 * Flags for every version of one datasetId, keyed by version.
 *
 * Invariants: exactly one `isLatest` when any doc is orderable, at most one
 * `isLatestPublished`, and the latter's version never above the former's.
 */
export const computeDatasetLatestFlags = (
  docs: DatasetVersionRef[],
  ceilingByHumId: Map<string, string | null>,
): Map<string, DatasetLatestFlags> => {
  const { latestVersion, latestPublishedVersion } = pickLatestVersions(docs, ceilingByHumId)

  return new Map(docs.map(d => [d.version, {
    isLatest: d.version === latestVersion,
    isLatestPublished: latestPublishedVersion !== null && d.version === latestPublishedVersion,
  }]))
}

/** Group Dataset docs by datasetId, for callers holding a whole index worth. */
export const groupByDatasetId = <T extends { datasetId: string }>(docs: T[]): Map<string, T[]> => {
  const groups = new Map<string, T[]>()
  for (const doc of docs) {
    const group = groups.get(doc.datasetId)
    if (group) group.push(doc)
    else groups.set(doc.datasetId, [doc])
  }

  return groups
}
