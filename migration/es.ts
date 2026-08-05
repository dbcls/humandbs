/**
 * Reading the v1 Elasticsearch dump.
 *
 * The dump is three `_search` responses taken from the running v1 cluster and
 * placed under `migration/input/`. Types here describe the documents as they
 * are, not as v2 wants them — every difference is dealt with in `build.ts`, so
 * that this file stays a faithful reading of the input and the transformation
 * stays in one place.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

/** A field the v1 crawler stored as extracted text plus the HTML it came from. */
export interface EsRichText {
  text?: string | null
  rawHtml?: string | null
}

export interface EsBilingualRich {
  ja?: EsRichText | null
  en?: EsRichText | null
}

/** A field stored as a plain string per language. */
export interface EsBilingual {
  ja?: string | null
  en?: string | null
}

export interface EsLink {
  text?: string | null
  url?: string | null
}

export interface EsDataProvider {
  name?: EsBilingualRich | null
  organization?: {
    name?: EsBilingualRich | null
    address?: EsBilingualRich | null
  } | null
  orcid?: string | null
  email?: string | null
}

export interface EsResearchProject {
  name?: EsBilingualRich | null
  /** One link per language, unlike `summary.url` which holds a list. */
  url?: { ja?: EsLink | null, en?: EsLink | null } | null
}

export interface EsGrant {
  title?: EsBilingual | null
  agency?: { name?: EsBilingual | null } | null
  id?: string[] | null
}

export interface EsRelatedPublication {
  title?: EsBilingual | null
  doi?: string | null
  datasetIds?: string[] | null
}

export interface EsSummary {
  aims?: EsBilingualRich | null
  methods?: EsBilingualRich | null
  targets?: EsBilingualRich | null
  url?: { ja?: EsLink[] | null, en?: EsLink[] | null } | null
}

export interface EsSummaryShort {
  methods?: EsBilingualRich | null
  targets?: EsBilingualRich | null
  typeOfData?: EsBilingualRich | null
}

export interface EsControlledAccessUser {
  name?: EsBilingualRich | null
  organization?: {
    name?: EsBilingualRich | null
    address?: { country?: string | null } | null
  } | null
  researchTitle?: EsBilingual | null
  periodOfDataUse?: { startDate?: string | null, endDate?: string | null } | null
  datasetIds?: string[] | null
  orcid?: string | null
  email?: string | null
}

export interface EsResearch {
  humId: string
  status?: string | null
  /** Versions up to and including this one are published. */
  latestVersion?: string | null
  summaryShort?: EsSummaryShort | null
  controlledAccessUser?: EsControlledAccessUser[] | null
}

export interface EsResearchVersion {
  humId: string
  humVersionId: string
  version: string
  versionReleaseDate?: string | null
  datasets?: { datasetId: string, version: string }[] | null
  title?: EsBilingual | null
  summary?: EsSummary | null
  releaseNote?: EsBilingualRich | null
  dataProvider?: EsDataProvider[] | null
  researchProject?: EsResearchProject[] | null
  grant?: EsGrant[] | null
  relatedPublication?: EsRelatedPublication[] | null
}

export interface EsExperiment {
  /** Keyed by the English display string, which is what v1 used as key identity. */
  data?: Record<string, EsBilingualRich> | null
  /** The line above the table in the source article; v2's experiment label. */
  header?: EsBilingualRich | null
}

export interface EsDataset {
  datasetId: string
  version: string
  humId: string
  criteria?: string | null
  /** Plain strings, unlike most bilingual fields on a dataset document. */
  typeOfData?: EsBilingual | null
  experiments?: EsExperiment[] | null
}

const INPUT_DIR = join(import.meta.dirname, "input")

function readDump<T>(name: string): T[] {
  const path = join(INPUT_DIR, `${name}.json`)
  const raw = readFileSync(path, "utf8")
  const parsed = JSON.parse(raw) as { hits: { hits: { _source: T }[] } }
  return parsed.hits.hits.map((h) => h._source)
}

export function versionNumber(version: string | null | undefined): number | null {
  const m = /^v(\d+)$/.exec(version ?? "")
  return m ? Number(m[1]) : null
}

export interface Dump {
  research: Map<string, EsResearch>
  /** Published versions only, ordered by hum and then by version number. */
  publishedVersions: EsResearchVersion[]
  /** The highest published version of each research, by hum id. */
  latestVersion: Map<string, EsResearchVersion>
  /** Every dataset document, keyed by `datasetId` and version. */
  datasetsByKey: Map<string, EsDataset>
}

export function datasetKey(datasetId: string, version: string): string {
  return `${datasetId}@${version}`
}

/**
 * Decide which versions are published.
 *
 * **`research.status` does not decide it.** A research whose status is `draft`
 * still has published versions whenever an existing research is being given a
 * new one, so the test is the version number against `latestVersion`.
 */
export function selectPublishedVersions(
  research: Map<string, EsResearch>,
  versions: EsResearchVersion[],
): Pick<Dump, "publishedVersions" | "latestVersion"> {
  const publishedVersions = versions
    .filter((rv) => {
      const latest = versionNumber(research.get(rv.humId)?.latestVersion)
      const current = versionNumber(rv.version)
      return latest !== null && current !== null && current <= latest
    })
    .sort((a, b) => a.humId.localeCompare(b.humId)
      || (versionNumber(a.version) ?? 0) - (versionNumber(b.version) ?? 0))

  const latestVersion = new Map<string, EsResearchVersion>()
  for (const rv of publishedVersions) {
    const held = latestVersion.get(rv.humId)
    if (!held || (versionNumber(rv.version) ?? 0) > (versionNumber(held.version) ?? 0)) {
      latestVersion.set(rv.humId, rv)
    }
  }

  return { publishedVersions, latestVersion }
}

export function loadDump(): Dump {
  const research = new Map(readDump<EsResearch>("research").map((r) => [r.humId, r]))
  const datasets = readDump<EsDataset>("dataset")
  const datasetsByKey = new Map(datasets.map((d) => [datasetKey(d.datasetId, d.version), d]))

  return {
    research,
    ...selectPublishedVersions(research, readDump<EsResearchVersion>("research-version")),
    datasetsByKey,
  }
}

export interface PublishedDataset {
  /** The v1 dataset id, which becomes the pinned label in v2. */
  label: string
  humId: string
  doc: EsDataset
  /** The release date of the earliest published version that listed it. */
  firstListedOn: string | null
}

export interface DatasetSelection {
  datasets: PublishedDataset[]
  /**
   * Dataset ids listed by versions of more than one research. A dataset belongs
   * to exactly one research in v2, so anything here is a defect in the input
   * rather than a shape v2 can hold.
   */
  sharedAcrossResearch: { label: string, humIds: string[] }[]
  /** Ids a published version pins but no document exists for. */
  missingDocuments: string[]
}

/**
 * Choose one document per dataset id.
 *
 * v1 versions its dataset documents; v2 does not, because the archived data
 * does not change and only its description does. The version to keep is the one
 * the latest published research version pins — the numerically highest is not
 * it, since v1 numbered dataset versions by content and 113 of them run
 * backwards in time.
 *
 * The set of ids comes from **every** published version, not just the latest
 * one: four datasets are reachable only from an older version, and dropping
 * them would leave those versions pointing at nothing.
 */
export function selectPublishedDatasets(dump: Dump): DatasetSelection {
  const pinnedVersions = new Map<string, Set<string>>()
  const firstListedOn = new Map<string, string>()
  const preferred = new Map<string, string>()
  const humsOf = new Map<string, Set<string>>()

  for (const rv of dump.publishedVersions) {
    const isLatest = dump.latestVersion.get(rv.humId) === rv
    for (const ref of rv.datasets ?? []) {
      let versions = pinnedVersions.get(ref.datasetId)
      if (!versions) {
        versions = new Set()
        pinnedVersions.set(ref.datasetId, versions)
      }
      versions.add(ref.version)

      let hums = humsOf.get(ref.datasetId)
      if (!hums) {
        hums = new Set()
        humsOf.set(ref.datasetId, hums)
      }
      hums.add(rv.humId)

      const date = rv.versionReleaseDate
      const held = firstListedOn.get(ref.datasetId)
      if (date && (!held || date < held)) firstListedOn.set(ref.datasetId, date)
      if (isLatest) preferred.set(ref.datasetId, ref.version)
    }
  }

  const datasets: PublishedDataset[] = []
  const sharedAcrossResearch: { label: string, humIds: string[] }[] = []
  const missingDocuments: string[] = []

  for (const [label, versions] of [...pinnedVersions].sort((a, b) => a[0].localeCompare(b[0]))) {
    const hums = [...(humsOf.get(label) ?? [])].sort()
    if (hums.length > 1) sharedAcrossResearch.push({ label, humIds: hums })
    const humId = hums[0]
    if (humId === undefined) continue

    // The version the latest published research version pins, then the highest
    // pinned version that a document actually exists for.
    const pinnedByLatest = preferred.get(label)
    const candidates = [
      ...(pinnedByLatest === undefined ? [] : [pinnedByLatest]),
      ...[...versions].sort((a, b) => (versionNumber(b) ?? 0) - (versionNumber(a) ?? 0)),
    ]
    const doc = candidates
      .map((v) => dump.datasetsByKey.get(datasetKey(label, v)))
      .find((d) => d !== undefined)
    if (!doc) {
      missingDocuments.push(label)
      continue
    }

    datasets.push({ label, humId, doc, firstListedOn: firstListedOn.get(label) ?? null })
  }
  return { datasets, sharedAcrossResearch, missingDocuments }
}
