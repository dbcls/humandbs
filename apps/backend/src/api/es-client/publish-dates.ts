/**
 * Values derived from a Research's published set
 *
 * Every date a user sees derives from one number per version: the day that
 * version was published. Which Dataset doc counts as the latest one derives
 * from the same published set. This module owns the operations that keep both
 * in step — stamping a version's release date at approve time, recomputing a
 * Research's dates, and recomputing a Dataset's `dateModified` and latest-version
 * flags.
 *
 * See [data-model.md § 日付フィールド] and [§ 最新版フラグ] for the definitions.
 */
import { esClient, ES_INDEX } from "@/api/es-client/client"
import { getResearchDoc } from "@/api/es-client/research"
import { lockedUpdateBody, mgetMap, uniq } from "@/api/es-client/utils"
import { ResearchVersionSchema } from "@/api/types"
import type { EsDataset, EsResearch } from "@/api/types"
import { isHumVersionAccessible, parseVersionNum } from "@/api/utils/version"
import { pickLatestVersions } from "@/es/dataset-latest"

/** Today in the `yyyy-MM-dd` shape every date field uses. */
export const today = (): string => new Date().toISOString().split("T")[0]

/** What a datasetId's version docs derive from the published set. */
export interface DatasetDerived {
  /** `max(versionReleaseDate, releaseDate)` over published versions, null when none. */
  dateModified: string | null
  latestVersion: string | null
  latestPublishedVersion: string | null
}

const EMPTY_DERIVED: DatasetDerived = {
  dateModified: null,
  latestVersion: null,
  latestPublishedVersion: null,
}

/**
 * Recompute everything a datasetId's docs derive from each other, and write it
 * onto every version doc of that datasetId.
 *
 * - `dateModified` is `max(versionReleaseDate, releaseDate)` over the *published*
 *   versions, denormalized so the value stays version-invariant (see
 *   `es/dataset-schema.ts`). `releaseDate` joins the max because DDBJ can publish
 *   a Dataset later than the version that introduced it, which would otherwise put
 *   the update date before the release date.
 * - `isLatest` / `isLatestPublished` name the newest version overall and the newest
 *   published one, which is what search and aggregation scope themselves to
 *   (`es/dataset-latest.ts`).
 *
 * Draft versions are left out of the published set: their dates exist only
 * because an unpublished version was opened, and surfacing one in the public
 * listing leaks that it exists.
 *
 * Pass `publishing` when calling this mid-approve. The Research doc still
 * carries the old `latestVersion` at that point, so without it the version
 * being published still counts as a draft — a datasetId born on that version
 * would keep `isLatestPublished` false and stay out of the public listing, and
 * with no published sibling to fall back on its `dateModified` would be left
 * null on a document that is about to go public (the schema requires a string,
 * so the public detail endpoint then fails to parse it).
 *
 * The flags are written even when nothing is published — a datasetId whose
 * parent has never been published still needs `isLatest` for its owner's
 * listing. Only `dateModified` is left alone in that case, keeping whatever an
 * earlier publication put there.
 */
export const syncDatasetDerived = async (
  datasetId: string,
  publishing?: { humId: string; latestVersion: string },
): Promise<DatasetDerived> => {
  const res = await esClient.search<EsDataset>({
    index: ES_INDEX.dataset,
    size: 1000,
    query: { term: { datasetId } },
    _source: ["humId", "humVersionId", "version", "versionReleaseDate", "releaseDate"],
  })
  const docs = res.hits.hits
    .map(h => h._source)
    .filter((d): d is EsDataset => d !== undefined)
  if (docs.length === 0) return EMPTY_DERIVED

  // The ceiling comes from the stored Research, except for the hum being
  // approved right now — its root has not been flipped to the new version yet.
  const ceilingOverride = new Map<string, string>()
  if (publishing) ceilingOverride.set(publishing.humId, publishing.latestVersion)

  const latestByHumId = new Map<string, string | null>()
  for (const humId of uniq(docs.map(d => d.humId))) {
    latestByHumId.set(humId,
      ceilingOverride.get(humId) ?? (await getResearchDoc(humId))?.latestVersion ?? null)
  }

  const { latestVersion, latestPublishedVersion } = pickLatestVersions(docs, latestByHumId)

  const candidates = docs
    .filter(d => isHumVersionAccessible(d.humVersionId, latestByHumId.get(d.humId) ?? null, false))
    .flatMap(d => [d.versionReleaseDate, d.releaseDate])
    .filter((d): d is string => d !== null && d !== undefined && d !== "")
  const dateModified = candidates.length > 0 ? candidates.reduce((a, b) => (a > b ? a : b)) : null

  await esClient.updateByQuery({
    index: ES_INDEX.dataset,
    refresh: true,
    conflicts: "proceed",
    query: { term: { datasetId } },
    script: {
      source: [
        "if (params.dateModified != null) { ctx._source.dateModified = params.dateModified; }",
        "ctx._source.isLatest = ctx._source.version == params.latestVersion;",
        "ctx._source.isLatestPublished = params.latestPublishedVersion != null"
        + " && ctx._source.version == params.latestPublishedVersion;",
      ].join("\n"),
      params: { dateModified, latestVersion, latestPublishedVersion },
    },
  })

  return { dateModified, latestVersion, latestPublishedVersion }
}

/**
 * Run `syncDatasetDerived` over every datasetId under a Research.
 *
 * Called when the Research's published ceiling moves (approve / unpublish).
 * Narrowing this to the Datasets born on the version being published would miss
 * a version left above the old ceiling by an abandoned draft cycle: it is not
 * born on the version being approved, yet the higher ceiling pulls it into the
 * published set and moves `isLatestPublished` onto it.
 *
 * `publishingVersion` is the version being approved right now, for the same
 * reason `syncDatasetDerived` takes `publishing`.
 */
export const syncDatasetDerivedForResearch = async (
  humId: string,
  publishingVersion?: string,
): Promise<void> => {
  const { hits } = await esClient.search<EsDataset>({
    index: ES_INDEX.dataset,
    size: 1000,
    query: { term: { humId } },
    _source: ["datasetId"],
  })
  const datasetIds = uniq(
    hits.hits.map(h => h._source?.datasetId).filter((id): id is string => id !== undefined),
  )

  for (const datasetId of datasetIds) {
    await syncDatasetDerived(
      datasetId,
      publishingVersion ? { humId, latestVersion: publishingVersion } : undefined,
    )
  }
}

/**
 * Record `date` as the day `version` was published: onto the ResearchVersion,
 * onto the Datasets born on it, and into the derived values of every Dataset
 * under this Research.
 *
 * Only Datasets whose `humVersionId` names this version get the release date. A
 * Dataset that has not changed since an earlier version is referenced by this
 * version's `datasets` array but was not born here, and its release date must
 * not move just because the parent Research gained a version. The derived
 * values are recomputed for all of them, because the ceiling moved
 * (`syncDatasetDerivedForResearch`).
 */
export const stampVersionReleaseDate = async (
  humId: string,
  version: string,
  date: string,
): Promise<void> => {
  const humVersionId = `${humId}-${version}`

  await esClient.update({
    index: ES_INDEX.researchVersion,
    id: humVersionId,
    body: lockedUpdateBody({ versionReleaseDate: date }),
    refresh: "wait_for",
  })

  const { hits } = await esClient.search<EsDataset>({
    index: ES_INDEX.dataset,
    size: 1000,
    query: { term: { humVersionId } },
    _source: ["datasetId", "version"],
  })
  const born = hits.hits
    .map(h => h._source)
    .filter((d): d is EsDataset => d !== undefined)

  for (const doc of born) {
    await esClient.update({
      index: ES_INDEX.dataset,
      id: `${doc.datasetId}-${doc.version}`,
      body: lockedUpdateBody({ versionReleaseDate: date }),
      refresh: "wait_for",
    })
  }

  // Runs after every write above: the derived values are computed over the
  // sibling versions, so they need the new dates already visible. `version` is
  // the one being published, which the Research doc does not say yet — it is
  // still the draft there until the caller updates the root.
  await syncDatasetDerivedForResearch(humId, version)
}

/**
 * `datePublished` / `dateModified` for a Research whose published set ends at
 * `latestVersion` — the min and max release date among the versions up to it.
 *
 * Both are null when nothing is published. Versions above `latestVersion` are
 * drafts (and the migration left orphans up there); including either would
 * leak an unpublished version's date into the public listing.
 */
export const computeResearchDates = async (
  research: Pick<EsResearch, "versionIds">,
  latestVersion: string | null,
): Promise<{ datePublished: string | null; dateModified: string | null }> => {
  if (latestVersion === null) return { datePublished: null, dateModified: null }

  const rvMap = await mgetMap(
    ES_INDEX.researchVersion,
    research.versionIds,
    (doc: unknown) => ResearchVersionSchema.parse(doc),
  )
  const latestNum = parseVersionNum(latestVersion)
  const dates = [...rvMap.values()]
    .filter(rv => parseVersionNum(rv.version) <= latestNum)
    .map(rv => rv.versionReleaseDate)
    .filter((d): d is string => d !== null && d !== "")

  if (dates.length === 0) return { datePublished: null, dateModified: null }

  return {
    datePublished: dates.reduce((a, b) => (a < b ? a : b)),
    dateModified: dates.reduce((a, b) => (a > b ? a : b)),
  }
}
