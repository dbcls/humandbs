/**
 * DRA Submission -> Dataset template payload
 *
 * Traversal:
 *   DRA submission -> DRP study (via /dblink)
 *                  -> DRX experiments (via /dblink on DRP)
 *                  -> per DRX: 1 /dblink call returns DRR / DRS / BioSample
 *                              IDs, then DRS / BioSample details are fetched
 *                              in parallel.
 *
 * 1 DRX = 1 experiment row. BioSample attributes (snake_case key) merge into
 * the row's data dictionary. Failures of individual DRX entries surface in
 * warnings rather than aborting the whole template, and partial failures
 * within a DRX (DRS / BioSample fetch error) are also recorded so the admin
 * knows what is missing vs. what was simply absent upstream.
 */
import { parseBiosampleAttributes } from "@/api/external/ddbj-search/biosample"
import {
  DblinkAccessionType,
  fetchDblink,
  fetchDblinkTargets,
} from "@/api/external/ddbj-search/dblink"
import {
  fetchBiosample,
  fetchSraExperiment,
  fetchSraSample,
  fetchSraSubmission,
} from "@/api/external/ddbj-search/entries"
import type {
  SraExperimentDetail,
  SraSampleDetail,
} from "@/api/external/ddbj-search/entries"
import type { DatasetTemplateData } from "@/api/types/templates"
import { createEmptySearchableFields } from "@/crawler/llm/extract"
import type {
  ReadType,
  SearchableExperimentFields,
} from "@/crawler/types/structured"

/** Steady-state concurrency for per-DRX traversal of DDBJ Search. */
const DRX_FETCH_CONCURRENCY = 5

const orNull = (s: string | null | undefined): string | null =>
  s?.trim() ? s : null

const toBilingualTextEn = (
  s: string | null | undefined,
): { ja: string | null; en: string | null } => ({
  ja: null,
  en: orNull(s),
})

const ISO_DATE_RE = /^(\d{4}-\d{2}-\d{2})/

const isoDateOnly = (s: string | null | undefined): string | null => {
  if (!s) return null
  const m = ISO_DATE_RE.exec(s)
  return m ? m[1] : null
}

const firstOrNull = (xs: string[] | null | undefined): string | null => {
  if (!xs || xs.length === 0) return null
  return xs[0]
}

const joinArray = (xs: string[] | null | undefined): string | null => {
  if (!xs || xs.length === 0) return null
  const filtered = xs.filter(
    (s): s is string => typeof s === "string" && s.trim() !== "",
  )
  return filtered.length ? filtered.join(", ") : null
}

const filterStrings = (xs: string[] | null | undefined): string[] => {
  if (!xs) return []
  return xs.filter((s): s is string => typeof s === "string" && s.trim() !== "")
}

const toReadType = (layout: string | null | undefined): ReadType | null => {
  if (!layout) return null
  const norm = layout.trim().toUpperCase()
  if (norm === "PAIRED") return "paired-end"
  if (norm === "SINGLE") return "single-end"
  return null
}

/**
 * Build a SearchableExperimentFields populated with what DDBJ Search API
 * exposes mechanically. Other fields (subject info / diseases / tissues /
 * population / etc.) stay at their empty defaults; admins fill them in (or a
 * downstream LLM extract step does, when applicable).
 *
 * Exported for unit tests; not part of the public mapping surface.
 */
export const buildSearchableFromDrx = (
  experiment: SraExperimentDetail,
): SearchableExperimentFields => {
  const base = createEmptySearchableFields()
  base.assayType = filterStrings(experiment.libraryStrategy)
  base.readType = toReadType(experiment.libraryLayout)
  const vendor = orNull(experiment.platform)
  const models = filterStrings(experiment.instrumentModel)
  if (vendor || models.length > 0) {
    base.platforms = models.length > 0
      ? models.map((model) => ({ vendor, model }))
      : [{ vendor, model: null }]
  }
  return base
}

interface ExperimentRowSource {
  drxId: string
  experiment: SraExperimentDetail
  drrIds: string[]
  drsId: string | null
  drsDetail: SraSampleDetail | null
  bsId: string | null
  bsAttrs: Record<string, string>
}

const buildExperimentRow = (src: ExperimentRowSource) => {
  const data: Record<string, { ja: { text: string } | null; en: { text: string } | null } | null> = {}

  const set = (key: string, value: string | null | undefined) => {
    const v = orNull(value)
    if (!v) return
    data[key] = { ja: null, en: { text: v } }
  }

  set("Title", src.experiment.title)
  set("Description", src.experiment.description)
  set("Library Strategy", joinArray(src.experiment.libraryStrategy))
  set("Library Source", joinArray(src.experiment.librarySource))
  set("Library Selection", joinArray(src.experiment.librarySelection))
  set("Library Layout", src.experiment.libraryLayout)
  set("Library Name", src.experiment.libraryName)
  set("Library Construction Protocol", src.experiment.libraryConstructionProtocol)
  set("Platform", src.experiment.platform)
  set("Instrument Model", joinArray(src.experiment.instrumentModel))
  set("Run Accessions", joinArray(src.drrIds))
  set("Sample Accession", src.drsId)
  set("BioSample", src.bsId)
  if (src.drsDetail?.organism) {
    const orgName = orNull(src.drsDetail.organism.name)
    const orgId = orNull(src.drsDetail.organism.identifier)
    if (orgName && orgId) {
      set("Organism", `${orgName} (taxonomy_id: ${orgId})`)
    } else if (orgName) {
      set("Organism", orgName)
    }
  }
  for (const [k, v] of Object.entries(src.bsAttrs)) {
    set(k, v)
  }

  return {
    header: {
      ja: { text: src.drxId },
      en: { text: src.drxId },
    },
    data,
    searchable: buildSearchableFromDrx(src.experiment),
  }
}

interface DrxResult {
  row?: ReturnType<typeof buildExperimentRow>
  warnings: string[]
}

const processOneDrx = async (
  drxId: string,
  requestId?: string,
): Promise<DrxResult> => {
  const warnings: string[] = []
  try {
    // 1 entry fetch + 1 dblink call covers DRR / DRS / BioSample IDs.
    const [experiment, dblink] = await Promise.all([
      fetchSraExperiment(drxId, requestId),
      fetchDblink(DblinkAccessionType.SRA_EXPERIMENT, drxId, requestId),
    ])
    if (!experiment) {
      return { warnings: [`${drxId}: sra-experiment entry not found (404)`] }
    }

    const xrefs = dblink?.dbXrefs ?? []
    const drsIds = xrefs
      .filter((x) => x.type === DblinkAccessionType.SRA_SAMPLE)
      .map((x) => x.identifier)
    const bsIds = xrefs
      .filter((x) => x.type === DblinkAccessionType.BIOSAMPLE)
      .map((x) => x.identifier)
    const drrIds = xrefs
      .filter((x) => x.type === DblinkAccessionType.SRA_RUN)
      .map((x) => x.identifier)
    const drsId = firstOrNull(drsIds)
    const bsId = firstOrNull(bsIds)

    const safeFetch = async <T>(
      fn: () => Promise<T | null>,
      label: string,
    ): Promise<T | null> => {
      try {
        return await fn()
      } catch (e) {
        warnings.push(
          `${drxId} ${label}: fetch failed (${e instanceof Error ? e.message : String(e)})`,
        )
        return null
      }
    }
    const [drsDetail, bsDetail] = await Promise.all([
      drsId
        ? safeFetch(() => fetchSraSample(drsId, requestId), `DRS ${drsId}`)
        : Promise.resolve(null),
      bsId
        ? safeFetch(() => fetchBiosample(bsId, requestId), `BioSample ${bsId}`)
        : Promise.resolve(null),
    ])
    const bsAttrs = bsDetail ? parseBiosampleAttributes(bsDetail.properties) : {}

    return {
      row: buildExperimentRow({
        drxId,
        experiment,
        drrIds,
        drsId,
        drsDetail,
        bsId,
        bsAttrs,
      }),
      warnings,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { warnings: [`${drxId}: fetch failed (${msg})`] }
  }
}

/**
 * Steady-state N-concurrent worker pool: starts `limit` workers and each
 * pulls the next item off a shared cursor until the input is exhausted. A
 * slow item only stalls one worker, not the whole batch.
 */
const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length)
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  }
  const workerCount = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

/**
 * Build a dataset template from a DRA Submission accession.
 *
 * Returns null when the submission itself is not found (caller -> 404).
 * Throws (DdbjSearchApiError) when DDBJ returns 5xx / network error for the
 * root submission, which surfaces as a 500 INTERNAL_ERROR via the global
 * error handler.
 *
 * Partial failures on DRP / DRX / DRS / BioSample traversal are absorbed
 * into warnings — root submission availability is the only hard precondition.
 */
export const mapDraSubmissionToDatasetTemplate = async (
  draSubmissionId: string,
  requestId?: string,
): Promise<DatasetTemplateData | null> => {
  const submission = await fetchSraSubmission(draSubmissionId, requestId)
  if (!submission) return null

  const warnings: string[] = []

  // submission -> study (typically 1)
  let drpIds: string[] = []
  try {
    drpIds = await fetchDblinkTargets(
      DblinkAccessionType.SRA_SUBMISSION,
      draSubmissionId,
      DblinkAccessionType.SRA_STUDY,
      requestId,
    )
  } catch (err) {
    warnings.push(
      `${draSubmissionId}: dblink to sra-study failed (${err instanceof Error ? err.message : String(err)})`,
    )
  }

  // study -> experiments (collect all DRX across all DRP)
  const drxIds: string[] = []
  for (const drp of drpIds) {
    try {
      const xs = await fetchDblinkTargets(
        DblinkAccessionType.SRA_STUDY,
        drp,
        DblinkAccessionType.SRA_EXPERIMENT,
        requestId,
      )
      drxIds.push(...xs)
    } catch (err) {
      warnings.push(
        `${drp}: dblink to sra-experiment failed (${err instanceof Error ? err.message : String(err)})`,
      )
    }
  }
  // De-duplicate (a DRX could in theory link from multiple DRP, though rare)
  const uniqueDrxIds = Array.from(new Set(drxIds))

  const results = await mapWithConcurrency(
    uniqueDrxIds,
    DRX_FETCH_CONCURRENCY,
    (drxId) => processOneDrx(drxId, requestId),
  )

  const experiments = []
  for (const r of results) {
    warnings.push(...r.warnings)
    if (r.row) experiments.push(r.row)
  }

  return {
    datasetId: undefined,
    releaseDate: isoDateOnly(submission.datePublished) ?? undefined,
    criteria: "Unrestricted-access",
    typeOfData: toBilingualTextEn(
      orNull(submission.title) ?? orNull(submission.description),
    ),
    experiments,
    warnings,
  }
}
