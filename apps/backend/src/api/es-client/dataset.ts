/**
 * Dataset CRUD operations for Elasticsearch
 *
 * This module provides:
 * - Dataset retrieval (getDataset, getDatasetWithSeqNo, listDatasetVersions)
 * - Dataset creation (createDataset, generateDraftDatasetId)
 * - Dataset updates (updateDataset, replaceDatasetId)
 * - Dataset deletion (deleteDataset)
 */
import { canAccessResearchDoc } from "@/api/es-client/auth"
import { esClient, ES_INDEX } from "@/api/es-client/client"
import { getResearchDoc } from "@/api/es-client/research"
import {
  getResearchVersion,
  getResearchVersionWithSeqNo,
  linkDatasetToResearch,
  unlinkDatasetFromResearch,
} from "@/api/es-client/research-version"
import { EsDatasetDocSchema } from "@/api/types"
import type { AuthUser, DatasetVersionItem, EsDatasetDoc, EsResearchDetail } from "@/api/types"

// === Dataset Retrieval ===

/**
 * Check if user can access a Dataset based on parent Research status
 */
const canAccessDataset = async (
  authUser: AuthUser | null,
  dataset: EsDatasetDoc,
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
): Promise<EsDatasetDoc | null> => {
  let dataset: EsDatasetDoc | null = null

  if (version) {
    const id = `${datasetId}-${version}` // lang suffix removed (BilingualText format)
    const res = await esClient.get<EsDatasetDoc>({
      index: ES_INDEX.dataset,
      id,
    }, { ignore: [404] })
    dataset = res.found && res._source ? EsDatasetDocSchema.parse(res._source) : null
  } else {
    // If the version is not specified, get the latest version
    const { hits } = await esClient.search<EsDatasetDoc>({
      index: ES_INDEX.dataset,
      size: 1,
      query: { term: { datasetId } },
      sort: [
        { version: { order: "desc" } },
        { releaseDate: { order: "desc" } },
      ],
      _source: true,
      track_total_hits: false,
    })
    const hit = hits.hits[0]
    dataset = hit && hit._source ? EsDatasetDocSchema.parse(hit._source) : null
  }

  if (!dataset) return null

  // Authorization check: verify user can access parent Research
  const canAccess = await canAccessDataset(authUser, dataset)
  if (!canAccess) return null

  return dataset
}

/**
 * Get Dataset document with sequence number for optimistic locking
 */
export const getDatasetWithSeqNo = async (
  datasetId: string,
  version: string,
): Promise<{ doc: EsDatasetDoc; seqNo: number; primaryTerm: number } | null> => {
  const id = `${datasetId}-${version}`
  const res = await esClient.get<EsDatasetDoc>({
    index: ES_INDEX.dataset,
    id,
  }, { ignore: [404] })

  if (!res.found || !res._source) return null

  return {
    doc: EsDatasetDocSchema.parse(res._source),
    seqNo: res._seq_no ?? 0,
    primaryTerm: res._primary_term ?? 0,
  }
}

export const listDatasetVersions = async (
  datasetId: string,
  authUser: AuthUser | null = null,
): Promise<DatasetVersionItem[] | null> => {
  const res = await esClient.search<EsDatasetDoc>({
    index: ES_INDEX.dataset,
    size: 500,
    query: { term: { datasetId } },
    sort: [
      { version: { order: "desc" } },
      { releaseDate: { order: "desc" } },
    ],
    _source: ["version", "typeOfData", "criteria", "releaseDate", "humId"],
    track_total_hits: false,
  })

  const rows = res.hits.hits
    .map(h => h._source)
    .filter((d): d is EsDatasetDoc => !!d)

  if (rows.length === 0) return []

  // Authorization check: verify user can access parent Research (all versions share same humId)
  const firstRow = rows[0]
  const researchDoc = await getResearchDoc(firstRow.humId)
  if (!researchDoc || !canAccessResearchDoc(authUser, researchDoc)) {
    return null // Return null to indicate not found/unauthorized
  }

  return rows.map(d => ({
    version: d.version,
    typeOfData: d.typeOfData ?? null,
    criteria: d.criteria ?? null,
    releaseDate: d.releaseDate ?? null,
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

  const maxNum = res.aggregations?.max_version?.value ?? 0
  return `v${maxNum + 1}`
}

/**
 * Create a new Dataset
 * Authenticated user (parent Research owner) can create
 *
 * @param params - Dataset data
 * @param autoLinkToResearch - Whether to auto-link to ResearchVersion (default: true)
 * @returns Created Dataset document
 */
export const createDataset = async (params: {
  datasetId?: string // Optional: auto-generates DRAFT-{humId}-{uuid} if not provided
  humId: string
  humVersionId: string
  releaseDate: string
  criteria: "Controlled-access (Type I)" | "Controlled-access (Type II)" | "Unrestricted-access"
  typeOfData: { ja: string | null; en: string | null }
  experiments: {
    header: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
    data: Record<string, { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null } | null>
    footers: { ja: { text: string; rawHtml: string }[]; en: { text: string; rawHtml: string }[] }
  }[]
}, autoLinkToResearch = true): Promise<EsDatasetDoc> => {
  const now = new Date().toISOString().split("T")[0]

  // Generate datasetId if not provided
  const datasetId = params.datasetId ?? generateDraftDatasetId(params.humId)

  // Get the next version number
  const version = await getNextDatasetVersion(datasetId)

  // Create Dataset document
  const datasetDoc: EsDatasetDoc = {
    datasetId,
    version,
    versionReleaseDate: now,
    humId: params.humId,
    humVersionId: params.humVersionId,
    releaseDate: params.releaseDate,
    criteria: params.criteria,
    typeOfData: params.typeOfData,
    experiments: params.experiments,
  }

  const esId = `${datasetId}-${version}`

  // Index the dataset document
  try {
    await esClient.index({
      index: ES_INDEX.dataset,
      id: esId,
      body: datasetDoc,
      refresh: "wait_for",
    })
  } catch (error) {
    throw new Error(`Failed to create Dataset: ${error}`)
  }

  // Auto-link to ResearchVersion if requested
  if (autoLinkToResearch) {
    try {
      // Extract humId from humVersionId (e.g., "hum0001.v1" -> "hum0001")
      const humId = params.humVersionId.split(".")[0]
      await linkDatasetToResearch(humId, datasetId, version)
    } catch (error) {
      // Log warning but don't fail the dataset creation
      console.warn(`Failed to auto-link dataset to research: ${error}`)
    }
  }

  return EsDatasetDocSchema.parse(datasetDoc)
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
  updates: {
    releaseDate?: string
    criteria?: "Controlled-access (Type I)" | "Controlled-access (Type II)" | "Unrestricted-access"
    typeOfData?: { ja: string | null; en: string | null }
    experiments?: {
      header: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      data: Record<string, { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null } | null>
      footers: { ja: { text: string; rawHtml: string }[]; en: { text: string; rawHtml: string }[] }
    }[]
    humId?: string
    humVersionId?: string
  },
  seqNo: number,
  primaryTerm: number,
): Promise<EsDatasetDoc | null> => {
  const esId = `${datasetId}-${version}`

  try {
    await esClient.update({
      index: ES_INDEX.dataset,
      id: esId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: updates,
      },
      refresh: "wait_for",
    })

    const result = await getDatasetWithSeqNo(datasetId, version)
    return result?.doc ?? null
  } catch (error: unknown) {
    // Check for version conflict
    if (error && typeof error === "object" && "meta" in error) {
      const esError = error as { meta?: { statusCode?: number } }
      if (esError.meta?.statusCode === 409) {
        return null // Conflict
      }
    }
    throw error
  }
}

/**
 * Replace Dataset ID (for converting draft ID to official ID)
 * Owner or admin can replace
 *
 * This is a complex operation:
 * 1. Get old Dataset document
 * 2. Create new document with new datasetId
 * 3. Update ResearchVersion.datasets references
 * 4. Delete old document
 *
 * @param oldDatasetId - Current dataset ID
 * @param version - Dataset version
 * @param newDatasetId - New dataset ID
 * @returns Updated Dataset document, null on not found
 */
export const replaceDatasetId = async (
  oldDatasetId: string,
  version: string,
  newDatasetId: string,
): Promise<EsDatasetDoc | null> => {
  // Get old dataset
  const oldResult = await getDatasetWithSeqNo(oldDatasetId, version)
  if (!oldResult) {
    return null
  }

  const oldDoc = oldResult.doc
  const oldEsId = `${oldDatasetId}-${version}`
  const newEsId = `${newDatasetId}-${version}`

  // Create new document with new datasetId
  const newDoc: EsDatasetDoc = {
    ...oldDoc,
    datasetId: newDatasetId,
  }

  // Index the new document
  try {
    await esClient.index({
      index: ES_INDEX.dataset,
      id: newEsId,
      body: newDoc,
      refresh: "wait_for",
    })
  } catch (error) {
    throw new Error(`Failed to create new Dataset with ID ${newDatasetId}: ${error}`)
  }

  // Update ResearchVersion.datasets references
  const humId = oldDoc.humId
  try {
    const latestVersion = await getResearchVersion(humId, {})
    if (latestVersion) {
      const versionWithSeq = await getResearchVersionWithSeqNo(latestVersion.humVersionId)
      if (versionWithSeq) {
        const { doc: versionDoc, seqNo, primaryTerm } = versionWithSeq
        const newDatasets = versionDoc.datasets.map(d =>
          d.datasetId === oldDatasetId && d.version === version
            ? { datasetId: newDatasetId, version }
            : d,
        )

        await esClient.update({
          index: ES_INDEX.researchVersion,
          id: latestVersion.humVersionId,
          if_seq_no: seqNo,
          if_primary_term: primaryTerm,
          body: {
            doc: { datasets: newDatasets },
          },
          refresh: "wait_for",
        })
      }
    }
  } catch (error) {
    // If reference update fails, delete the new document and rethrow
    await esClient.delete({
      index: ES_INDEX.dataset,
      id: newEsId,
    }, { ignore: [404] })
    throw new Error(`Failed to update ResearchVersion references: ${error}`)
  }

  // Delete old document
  try {
    await esClient.delete({
      index: ES_INDEX.dataset,
      id: oldEsId,
      refresh: "wait_for",
    })
  } catch (error) {
    // Log warning but don't fail - new document exists
    console.warn(`Failed to delete old Dataset ${oldEsId}: ${error}`)
  }

  return EsDatasetDocSchema.parse(newDoc)
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

    return true
  } else {
    // Delete all versions of this dataset
    // First, get all versions
    const { hits } = await esClient.search<EsDatasetDoc>({
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
): Promise<EsResearchDetail | null> => {
  // Import getResearchDetail dynamically to avoid circular dependency
  const { getResearchDetail } = await import("@/api/es-client/research")

  // First, get the Dataset to find its humId
  const dataset = await getDataset(datasetId, {}, authUser)
  if (!dataset) return null

  // Get the Research detail using the humId from the Dataset
  return getResearchDetail(dataset.humId, {}, authUser)
}
