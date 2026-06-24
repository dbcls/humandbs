/**
 * Dataset CRUD operations for Elasticsearch
 *
 * This module provides:
 * - Dataset retrieval (getDataset, getDatasetWithSeqNo, listDatasetVersions)
 * - Dataset creation (createDataset, generateDraftDatasetId)
 * - Dataset updates (updateDataset)
 * - Dataset deletion (deleteDataset)
 */
import { ConflictError } from "@/api/errors"
import { canAccessResearchDoc } from "@/api/es-client/auth"
import { esClient, ES_INDEX, isConflictError, isDocumentExistsError } from "@/api/es-client/client"
import { versionSortSpec } from "@/api/es-client/query-builders"
import { getResearchDoc } from "@/api/es-client/research"
import {
  getResearchVersionWithSeqNo,
  linkDatasetToResearch,
  unlinkDatasetFromResearch,
} from "@/api/es-client/research-version"
import { logger } from "@/api/logger"
import { EsDatasetSchema } from "@/api/types"
import type { AuthUser, CreateDatasetRequest, DatasetVersionItem, EsDataset, ResearchDetail, UpdateDatasetRequest } from "@/api/types"
import { hydrateExperiment } from "@/api/utils/hydrate-raw-html"

// === Dataset Retrieval ===

/**
 * Check if user can access a Dataset based on parent Research status
 */
const canAccessDataset = async (
  authUser: AuthUser | null,
  dataset: EsDataset,
): Promise<boolean> => {
  if (authUser?.isAdmin) return true

  // Get parent Research and check access
  const researchDoc = await getResearchDoc(dataset.humId)
  if (!researchDoc) return false

  return canAccessResearchDoc(authUser, researchDoc)
}

export const getDataset = async (
  datasetId: string,
  { version }: { version?: string },
  authUser: AuthUser | null = null,
): Promise<EsDataset | null> => {
  let dataset: EsDataset | null = null

  if (version) {
    const id = `${datasetId}-${version}`
    const res = await esClient.get<EsDataset>({
      index: ES_INDEX.dataset,
      id,
    }, { ignore: [404] })
    dataset = res.found && res._source ? EsDatasetSchema.parse(res._source) : null
  } else {
    // If the version is not specified, get the latest version
    const { hits } = await esClient.search<EsDataset>({
      index: ES_INDEX.dataset,
      size: 1,
      query: { term: { datasetId } },
      sort: [
        versionSortSpec("desc"),
        { releaseDate: { order: "desc" } },
      ],
      _source: true,
      track_total_hits: false,
    })
    const hit = hits.hits[0]
    dataset = hit?._source != null ? EsDatasetSchema.parse(hit._source) : null
  }

  if (!dataset) return null

  // Authorization check: verify user can access parent Research
  const canAccess = await canAccessDataset(authUser, dataset)
  if (!canAccess) return null

  return dataset
}

/**
 * Resolve the latest version string of a Dataset (by version desc, then releaseDate desc).
 * Returns null when no document with the given datasetId exists.
 */
export const resolveLatestDatasetVersion = async (datasetId: string): Promise<string | null> => {
  const { hits } = await esClient.search<EsDataset>({
    index: ES_INDEX.dataset,
    size: 1,
    query: { term: { datasetId } },
    sort: [
      versionSortSpec("desc"),
      { releaseDate: { order: "desc" } },
    ],
    _source: ["version"],
    track_total_hits: false,
  })
  return hits.hits[0]?._source?.version ?? null
}

/**
 * Get Dataset document with sequence number for optimistic locking
 */
export const getDatasetWithSeqNo = async (
  datasetId: string,
  version: string,
): Promise<{ doc: EsDataset; seqNo: number; primaryTerm: number } | null> => {
  const id = `${datasetId}-${version}`
  const res = await esClient.get<EsDataset>({
    index: ES_INDEX.dataset,
    id,
  }, { ignore: [404] })

  if (!res.found || !res._source) return null

  return {
    doc: EsDatasetSchema.parse(res._source),
    seqNo: res._seq_no ?? 0,
    primaryTerm: res._primary_term ?? 0,
  }
}

export const listDatasetVersions = async (
  datasetId: string,
  authUser: AuthUser | null = null,
): Promise<DatasetVersionItem[] | null> => {
  const res = await esClient.search<EsDataset>({
    index: ES_INDEX.dataset,
    size: 500,
    query: { term: { datasetId } },
    sort: [
      versionSortSpec("desc"),
      { releaseDate: { order: "desc" } },
    ],
    _source: ["version", "typeOfData", "criteria", "releaseDate", "humId"],
    track_total_hits: false,
  })

  const rows = res.hits.hits
    .map(h => h._source)
    .filter((d): d is EsDataset => !!d)

  if (rows.length === 0) return []

  // Authorization check: verify user can access parent Research (all versions share same humId)
  const firstRow = rows[0]
  const researchDoc = await getResearchDoc(firstRow.humId)
  if (!researchDoc || !canAccessResearchDoc(authUser, researchDoc)) {
    return null // Return null to indicate not found/unauthorized
  }

  return rows.map(d => ({
    version: d.version,
    typeOfData: d.typeOfData,
    criteria: d.criteria,
    releaseDate: d.releaseDate,
  }))
}

// === Dataset Creation ===

/**
 * Generate a draft Dataset ID
 * Format: DRAFT-{humId}-{uuid}
 */
export const generateDraftDatasetId = (humId: string): string => {
  const uuid = crypto.randomUUID().split("-")[0] // Short UUID (first 8 chars)
  return `DRAFT-${humId}-${uuid}`
}

/**
 * Get the next version number for a dataset
 */
const getNextDatasetVersion = async (datasetId: string): Promise<string> => {
  interface MaxVersionAggs {
    max_version: { value: number | null }
  }

  const res = await esClient.search<unknown, MaxVersionAggs>({
    index: ES_INDEX.dataset,
    size: 0,
    query: { term: { datasetId } },
    aggs: {
      max_version: {
        max: {
          script: {
            source: "Integer.parseInt(doc['version'].value.substring(1))",
          },
        },
      },
    },
  })

  const maxNum = res.aggregations?.max_version.value ?? 0
  return `v${maxNum + 1}`
}

/**
 * Recompute a dataset's version-invariant `dateModified` (the max
 * versionReleaseDate across its versions) and write it onto every version doc,
 * so the collapsed listing sort stays consistent (see `es/dataset-schema.ts`).
 * Returns the value written, or null when the datasetId has no documents left.
 */
export const syncDatasetDateModified = async (datasetId: string): Promise<string | null> => {
  const res = await esClient.search<EsDataset>({
    index: ES_INDEX.dataset,
    size: 1,
    query: { term: { datasetId } },
    sort: [{ versionReleaseDate: { order: "desc" } }],
    _source: ["versionReleaseDate"],
  })
  const maxDate = res.hits.hits[0]?._source?.versionReleaseDate ?? null
  if (maxDate === null) return null

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
 * Create a new Dataset
 * Authenticated user (parent Research owner) can create
 *
 * @param params - Dataset data
 * @param autoLinkToResearch - Whether to auto-link to ResearchVersion (default: true)
 * @returns Created Dataset document
 */
export const createDataset = async (
  params: CreateDatasetRequest & { datasetId?: string },
  autoLinkToResearch = true,
): Promise<EsDataset> => {
  const now = new Date().toISOString().split("T")[0]

  // Generate datasetId if not provided
  const datasetId = params.datasetId ?? generateDraftDatasetId(params.humId)

  // Get the next version number
  const version = await getNextDatasetVersion(datasetId)

  // Create Dataset document. A brand-new datasetId has a single version, so its
  // dateModified equals this version's releaseDate.
  const datasetDoc: EsDataset = {
    datasetId,
    version,
    versionReleaseDate: now,
    dateModified: now,
    humId: params.humId,
    humVersionId: params.humVersionId,
    releaseDate: params.releaseDate,
    criteria: params.criteria,
    typeOfData: params.typeOfData,
    experiments: params.experiments.map(hydrateExperiment),
  }

  const esId = `${datasetId}-${version}`

  // Index the dataset document
  // Use op_type: "create" to prevent overwriting existing documents
  try {
    await esClient.index({
      index: ES_INDEX.dataset,
      id: esId,
      body: datasetDoc,
      op_type: "create",
      refresh: "wait_for",
    })
  } catch (error) {
    if (isDocumentExistsError(error)) {
      throw ConflictError.forDuplicate("Dataset", esId)
    }
    throw new Error(`Failed to create Dataset: ${error}`)
  }

  // Auto-link to ResearchVersion if requested
  if (autoLinkToResearch) {
    try {
      // Extract humId from humVersionId (e.g., "hum0001-v1" -> "hum0001")
      const humId = params.humVersionId.replace(/-v\d+$/, "")
      await linkDatasetToResearch(humId, datasetId, version)
    } catch (error) {
      // Log warning but don't fail the dataset creation
      logger.warn("Failed to auto-link dataset to research", { error: String(error) })
    }
  }

  return EsDatasetSchema.parse(datasetDoc)
}

// === Dataset Updates ===

/**
 * Update Dataset document with optimistic locking
 * Owner or admin can update
 *
 * @param datasetId - Dataset ID
 * @param version - Dataset version
 * @param updates - Fields to update
 * @param seqNo - Sequence number for optimistic locking
 * @param primaryTerm - Primary term for optimistic locking
 * @returns Updated Dataset document, null on conflict
 */
export const updateDataset = async (
  datasetId: string,
  version: string,
  updates: Partial<Omit<UpdateDatasetRequest, "_seq_no" | "_primary_term" | "humId" | "humVersionId">>,
  seqNo: number,
  primaryTerm: number,
): Promise<EsDataset | null> => {
  const esId = `${datasetId}-${version}`

  // 初回ドラフトサイクル検出 (architecture.md § Dataset のバージョン)
  const existing = await getDatasetWithSeqNo(datasetId, version)
  if (!existing) return null
  if (existing.seqNo !== seqNo || existing.primaryTerm !== primaryTerm) return null

  const currentDoc = existing.doc
  const parentResearch = await getResearchDoc(currentDoc.humId)

  if (parentResearch?.latestVersion && parentResearch.draftVersion) {
    const latestHumVersionId = `${currentDoc.humId}-${parentResearch.latestVersion}`
    const latestVersionInfo = await getResearchVersionWithSeqNo(latestHumVersionId)
    const pinnedEntry = latestVersionInfo?.doc.datasets.find(d => d.datasetId === datasetId)
    if (pinnedEntry?.version === currentDoc.version) {
      return bumpDatasetVersion(datasetId, currentDoc, updates, parentResearch.draftVersion)
    }
  }

  // humId / humVersionId are intentionally not writable here: parent linkage is
  // pinned by the URL-resolved Dataset doc + parent Research preload. Anything
  // the caller passes in the request body is rejected at the handler boundary
  // (routes/dataset.ts), and this layer is a second backstop.
  const hydratedDoc: Record<string, unknown> = {}
  if (updates.releaseDate !== undefined) hydratedDoc.releaseDate = updates.releaseDate
  if (updates.criteria !== undefined) hydratedDoc.criteria = updates.criteria
  if (updates.typeOfData !== undefined) hydratedDoc.typeOfData = updates.typeOfData
  if (updates.experiments !== undefined) hydratedDoc.experiments = updates.experiments.map(hydrateExperiment)

  try {
    await esClient.update({
      index: ES_INDEX.dataset,
      id: esId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: hydratedDoc,
      },
      refresh: "wait_for",
    })

    const result = await getDatasetWithSeqNo(datasetId, version)
    return result?.doc ?? null
  } catch (error: unknown) {
    if (isConflictError(error)) return null
    throw error
  }
}

/**
 * Patch a published Dataset in-place (no version bump).
 *
 * @returns Updated Dataset document, null on conflict
 */
export const patchDataset = async (
  datasetId: string,
  version: string,
  updates: Partial<Omit<UpdateDatasetRequest, "_seq_no" | "_primary_term" | "humId" | "humVersionId">>,
  seqNo: number,
  primaryTerm: number,
): Promise<EsDataset | null> => {
  const esId = `${datasetId}-${version}`

  const hydratedDoc: Record<string, unknown> = {}
  if (updates.releaseDate !== undefined) hydratedDoc.releaseDate = updates.releaseDate
  if (updates.criteria !== undefined) hydratedDoc.criteria = updates.criteria
  if (updates.typeOfData !== undefined) hydratedDoc.typeOfData = updates.typeOfData
  if (updates.experiments !== undefined) hydratedDoc.experiments = updates.experiments.map(hydrateExperiment)

  try {
    await esClient.update({
      index: ES_INDEX.dataset,
      id: esId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: { doc: hydratedDoc },
      refresh: "wait_for",
    })

    await syncDatasetDateModified(datasetId)

    const result = await getDatasetWithSeqNo(datasetId, version)
    return result?.doc ?? null
  } catch (error: unknown) {
    if (isConflictError(error)) return null
    throw error
  }
}

const bumpDatasetVersion = async (
  datasetId: string,
  currentDoc: EsDataset,
  updates: Partial<Omit<UpdateDatasetRequest, "_seq_no" | "_primary_term" | "humId" | "humVersionId">>,
  draftVersion: string,
): Promise<EsDataset | null> => {
  const humId = currentDoc.humId
  const draftHumVersionId = `${humId}-${draftVersion}`
  const nextVersion = await getNextDatasetVersion(datasetId)
  const nextEsId = `${datasetId}-${nextVersion}`

  // humId / humVersionId are derived from the existing dataset doc and the
  // parent's draftVersion — never from `updates` — so a request body cannot
  // repoint the dataset to a different parent Research.
  const newDoc: EsDataset = {
    ...currentDoc,
    version: nextVersion,
    humVersionId: draftHumVersionId,
    humId,
    releaseDate: updates.releaseDate ?? currentDoc.releaseDate,
    criteria: updates.criteria ?? currentDoc.criteria,
    typeOfData: updates.typeOfData ?? currentDoc.typeOfData,
    experiments: updates.experiments !== undefined
      ? updates.experiments.map(hydrateExperiment)
      : currentDoc.experiments,
  }

  try {
    await esClient.index({
      index: ES_INDEX.dataset,
      id: nextEsId,
      body: newDoc,
      op_type: "create",
      refresh: "wait_for",
    })
  } catch (error) {
    if (isDocumentExistsError(error)) {
      throw ConflictError.forDuplicate("Dataset", nextEsId)
    }
    throw new Error(`Failed to create new Dataset version: ${error}`)
  }

  try {
    const draftVersionInfo = await getResearchVersionWithSeqNo(draftHumVersionId)
    if (!draftVersionInfo) {
      throw new Error(`Parent draft ResearchVersion ${draftHumVersionId} not found`)
    }
    const { doc: versionDoc, seqNo: parentSeqNo, primaryTerm: parentPrimaryTerm } = draftVersionInfo
    const newDatasets = versionDoc.datasets.map(d =>
      d.datasetId === datasetId && d.version === currentDoc.version
        ? { datasetId, version: nextVersion }
        : d,
    )
    await esClient.update({
      index: ES_INDEX.researchVersion,
      id: draftHumVersionId,
      if_seq_no: parentSeqNo,
      if_primary_term: parentPrimaryTerm,
      body: { doc: { datasets: newDatasets } },
      refresh: "wait_for",
    })
  } catch (error) {
    // Compensating delete on the freshly-created new-version doc when the
    // parent ResearchVersion reference swap fails. `refresh: "wait_for"` so
    // a follow-up GET / list does not observe the orphan during the visible
    // refresh window (the caller will see the 409 we return below).
    await esClient.delete({
      index: ES_INDEX.dataset,
      id: nextEsId,
      refresh: "wait_for",
    }, { ignore: [404] })

    if (isConflictError(error)) return null
    throw new Error(`Failed to update parent ResearchVersion references: ${error}`)
  }

  // A new version became the latest; keep dateModified version-invariant across
  // all docs of this datasetId so the listing sort stays consistent.
  const maxDate = await syncDatasetDateModified(datasetId)
  return EsDatasetSchema.parse({ ...newDoc, dateModified: maxDate ?? newDoc.dateModified })
}

// === Dataset Deletion ===

/**
 * Delete Dataset (physical deletion)
 * Admin only - removes from ES and ResearchVersion.datasets
 *
 * @param datasetId - Dataset ID
 * @param version - Dataset version to delete (or all versions if not specified)
 * @returns true on success
 */
export const deleteDataset = async (
  datasetId: string,
  version?: string,
): Promise<boolean> => {
  if (version) {
    // Delete specific version
    const esId = `${datasetId}-${version}`

    // Get the dataset to find humId
    const dataset = await getDataset(datasetId, { version })
    if (!dataset) {
      return true // Already deleted
    }

    // Remove from ResearchVersion.datasets
    await unlinkDatasetFromResearch(dataset.humId, datasetId, version)

    // Delete the document
    await esClient.delete({
      index: ES_INDEX.dataset,
      id: esId,
      refresh: "wait_for",
    }, { ignore: [404] })

    // Removing a version can change the max versionReleaseDate; resync the
    // remaining docs' dateModified so the listing sort stays correct.
    await syncDatasetDateModified(datasetId)

    return true
  } else {
    // Delete all versions of this dataset
    // First, get all versions
    const { hits } = await esClient.search<EsDataset>({
      index: ES_INDEX.dataset,
      size: 1000,
      query: { term: { datasetId } },
      _source: ["version", "humId"],
    })

    if (hits.hits.length === 0) {
      return true // Already deleted
    }

    // Get humId from first hit for unlinking
    const firstHit = hits.hits[0]?._source
    if (firstHit) {
      // Remove all versions from ResearchVersion.datasets
      await unlinkDatasetFromResearch(firstHit.humId, datasetId)
    }

    // Delete all documents
    await esClient.deleteByQuery({
      index: ES_INDEX.dataset,
      query: { term: { datasetId } },
      refresh: true,
    })

    return true
  }
}

// === Additional Dataset Functions ===

/**
 * Get Research by Dataset ID
 * Returns the parent Research that contains the specified Dataset
 */
export const getResearchByDatasetId = async (
  datasetId: string,
  authUser: AuthUser | null = null,
): Promise<ResearchDetail | null> => {
  // Import getResearchDetail dynamically to avoid circular dependency
  const { getResearchDetail } = await import("@/api/es-client/research")

  // First, get the Dataset to find its humId
  const dataset = await getDataset(datasetId, {}, authUser)
  if (!dataset) return null

  // Get the Research detail using the humId from the Dataset
  return getResearchDetail(dataset.humId, {}, authUser)
}
