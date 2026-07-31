/**
 * Publication dates
 *
 * Every date a user sees derives from one number per version: the day that
 * version was published. This module owns the two operations that keep the
 * derived values in step — stamping a version's release date at approve time,
 * and recomputing a Research's dates from its published versions.
 *
 * See [data-model.md § 日付フィールド] for the definitions.
 */
import { esClient, ES_INDEX } from "@/api/es-client/client"
import { getResearchDoc } from "@/api/es-client/research"
import { lockedUpdateBody, mgetMap, uniq } from "@/api/es-client/utils"
import { ResearchVersionSchema } from "@/api/types"
import type { EsDataset, EsResearch } from "@/api/types"
import { isHumVersionAccessible, parseVersionNum } from "@/api/utils/version"

/** Today in the `yyyy-MM-dd` shape every date field uses. */
export const today = (): string => new Date().toISOString().split("T")[0]

/**
 * Recompute a dataset's version-invariant `dateModified` and write it onto
 * every version doc, so the collapsed listing sort stays consistent (see
 * `es/dataset-schema.ts`).
 *
 * The value is `max(versionReleaseDate, releaseDate)` over the *published*
 * versions. Draft versions are left out: their dates exist only because an
 * unpublished version was opened, and surfacing one in the public listing leaks
 * that it exists. `releaseDate` joins the max because DDBJ can publish a Dataset
 * later than the version that introduced it, which would otherwise put the
 * update date before the release date.
 *
 * Pass `publishing` when calling this mid-approve. The Research doc still
 * carries the old `latestVersion` at that point, so without it the version
 * being published still counts as a draft — and a datasetId born on that
 * version has no published sibling to fall back on, which leaves `dateModified`
 * null on a document that is about to go public (the schema requires a string,
 * so the public detail endpoint then fails to parse it).
 *
 * Returns the value written, or null when the datasetId has no published docs.
 */
export const syncDatasetDateModified = async (
  datasetId: string,
  publishing?: { humId: string; latestVersion: string },
): Promise<string | null> => {
  const res = await esClient.search<EsDataset>({
    index: ES_INDEX.dataset,
    size: 1000,
    query: { term: { datasetId } },
    _source: ["humId", "humVersionId", "versionReleaseDate", "releaseDate"],
  })
  const docs = res.hits.hits
    .map(h => h._source)
    .filter((d): d is EsDataset => d !== undefined)
  if (docs.length === 0) return null

  // The ceiling comes from the stored Research, except for the hum being
  // approved right now — its root has not been flipped to the new version yet.
  const ceilingOverride = new Map<string, string>()
  if (publishing) ceilingOverride.set(publishing.humId, publishing.latestVersion)

  const latestByHumId = new Map<string, string | null>()
  for (const humId of uniq(docs.map(d => d.humId))) {
    latestByHumId.set(humId,
      ceilingOverride.get(humId) ?? (await getResearchDoc(humId))?.latestVersion ?? null)
  }

  const candidates = docs
    .filter(d => isHumVersionAccessible(d.humVersionId, latestByHumId.get(d.humId) ?? null, false))
    .flatMap(d => [d.versionReleaseDate, d.releaseDate])
    .filter((d): d is string => d !== null && d !== undefined && d !== "")
  if (candidates.length === 0) return null
  const maxDate = candidates.reduce((a, b) => (a > b ? a : b))

  await esClient.updateByQuery({
    index: ES_INDEX.dataset,
    refresh: true,
    conflicts: "proceed",
    query: { term: { datasetId } },
    script: {
      source: "ctx._source.dateModified = params.d",
      params: { d: maxDate },
    },
  })

  return maxDate
}

/**
 * Record `date` as the day `version` was published: onto the ResearchVersion,
 * onto the Datasets born on it, and into those datasetIds' `dateModified`.
 *
 * Only Datasets whose `humVersionId` names this version are touched. A Dataset
 * that has not changed since an earlier version is referenced by this version's
 * `datasets` array but was not born here, and its release date must not move
 * just because the parent Research gained a version.
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

  // Runs after every write above: `dateModified` is a max over the sibling
  // versions, so it needs the new dates already visible. `version` is the one
  // being published, which the Research doc does not say yet — it is still the
  // draft there until the caller updates the root.
  for (const datasetId of uniq(born.map(d => d.datasetId))) {
    await syncDatasetDateModified(datasetId, { humId, latestVersion: version })
  }
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
