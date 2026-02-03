/**
 * Research Version operations for Elasticsearch
 *
 * This module provides:
 * - ResearchVersion retrieval (getResearchVersion, listResearchVersions)
 * - ResearchVersion creation (createResearchVersion)
 * - Dataset linking (linkDatasetToResearch, unlinkDatasetFromResearch)
 */
import { canAccessResearchDoc } from "@/api/es-client/auth"
import { esClient, ES_INDEX } from "@/api/es-client/client"
import { mgetMap } from "@/api/es-client/utils"
import {
  EsResearchDocSchema,
  EsResearchVersionDocSchema,
} from "@/api/types"
import type {
  AuthUser,
  EsResearchDoc,
  EsResearchVersionDoc,
} from "@/api/types"

// === ResearchVersion Retrieval ===

export const getResearchVersion = async (
  humId: string,
  { version }: { version?: string },
): Promise<EsResearchVersionDoc | null> => {
  if (version) {
    const id = `${humId}-${version}` // lang suffix removed (BilingualText format)
    const res = await esClient.get<EsResearchVersionDoc>({
      index: ES_INDEX.researchVersion,
      id,
    }, { ignore: [404] })
    return res.found && res._source ? EsResearchVersionDocSchema.parse(res._source) : null
  }

  // If the version is not specified, get the latest version
  const { hits } = await esClient.search<EsResearchVersionDoc>({
    index: ES_INDEX.researchVersion,
    size: 1,
    query: { term: { humId } },
    sort: [
      { version: { order: "desc" } },
      { versionReleaseDate: { order: "desc" } },
    ],
    _source: true,
    track_total_hits: false,
  })
  const hit = hits.hits[0]
  return hit?._source != null ? EsResearchVersionDocSchema.parse(hit._source) : null
}

/**
 * Get ResearchVersion document with sequence number for optimistic locking
 */
export const getResearchVersionWithSeqNo = async (
  humVersionId: string,
): Promise<{ doc: EsResearchVersionDoc; seqNo: number; primaryTerm: number } | null> => {
  const res = await esClient.get<EsResearchVersionDoc>({
    index: ES_INDEX.researchVersion,
    id: humVersionId,
  }, { ignore: [404] })

  if (!res.found || !res._source) return null

  return {
    doc: EsResearchVersionDocSchema.parse(res._source),
    seqNo: res._seq_no ?? 0,
    primaryTerm: res._primary_term ?? 0,
  }
}

export const listResearchVersions = async (
  humId: string,
  authUser: AuthUser | null = null,
): Promise<EsResearchVersionDoc[] | null> => {
  const res = await esClient.get<EsResearchDoc>({
    index: ES_INDEX.research,
    id: humId, // lang suffix removed (BilingualText format)
  }, { ignore: [404] })
  if (!res.found || !res._source) return null
  const researchDoc = EsResearchDocSchema.parse(res._source)

  // Authorization check: verify user can access this Research
  if (!canAccessResearchDoc(authUser, researchDoc)) {
    return null // Return null to hide existence from unauthorized users
  }

  const rvIds = researchDoc.versionIds
  if (rvIds.length === 0) return []
  const rvMap = await mgetMap(ES_INDEX.researchVersion, rvIds, (doc: unknown) => EsResearchVersionDocSchema.parse(doc))

  return rvIds
    .map((id: string) => rvMap.get(id))
    .filter((x): x is EsResearchVersionDoc => !!x)
}

export const listResearchVersionsSorted = async (
  humId: string,
  authUser: AuthUser | null = null,
): Promise<EsResearchVersionDoc[] | null> => {
  const rows = await listResearchVersions(humId, authUser)
  if (!rows) return null
  const verNum = (v: string) => Number(/^v(\d+)$/.exec(v)?.[1] ?? -1)
  rows.sort((a, b) => verNum(b.version) - verNum(a.version))
  return rows
}

// === ResearchVersion Creation ===

/**
 * Create a new Research version
 * Owner or admin can create
 *
 * @param humId - Research ID
 * @param releaseNote - Release note for the new version
 * @param datasets - Optional datasets to link (defaults to copying from latest version)
 * @param seqNo - Sequence number for optimistic locking
 * @param primaryTerm - Primary term for optimistic locking
 * @returns Created ResearchVersion, null on conflict
 */
export const createResearchVersion = async (
  humId: string,
  releaseNote: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null },
  datasets: { datasetId: string; version: string }[] | undefined,
  seqNo: number,
  primaryTerm: number,
): Promise<EsResearchVersionDoc | null> => {
  const now = new Date().toISOString().split("T")[0]

  // Get current research to determine new version number
  const researchRes = await esClient.get<EsResearchDoc>({
    index: ES_INDEX.research,
    id: humId,
  }, { ignore: [404] })
  if (!researchRes.found || !researchRes._source) {
    throw new Error(`Research ${humId} not found`)
  }
  const research = EsResearchDocSchema.parse(researchRes._source)

  // Calculate new version number
  const currentVersionNum = research.versionIds.length
  const newVersion = `v${currentVersionNum + 1}`
  const newHumVersionId = `${humId}.${newVersion}`

  // If datasets not provided, copy from latest version
  let datasetsToUse = datasets
  if (datasetsToUse === undefined) {
    const latestVersion = await getResearchVersion(humId, {})
    datasetsToUse = latestVersion?.datasets ?? []
  }

  // Create new ResearchVersion document
  const versionDoc: EsResearchVersionDoc = {
    humId,
    humVersionId: newHumVersionId,
    version: newVersion,
    versionReleaseDate: now,
    datasets: datasetsToUse,
    releaseNote,
  }

  // Index the version document first
  try {
    await esClient.index({
      index: ES_INDEX.researchVersion,
      id: newHumVersionId,
      body: versionDoc,
      refresh: "wait_for",
    })
  } catch (error) {
    throw new Error(`Failed to create ResearchVersion: ${error}`)
  }

  // Update Research to add new version to versionIds and update latestVersion
  try {
    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          versionIds: [...research.versionIds, newHumVersionId],
          latestVersion: newVersion,
          dateModified: now,
        },
      },
      refresh: "wait_for",
    })
  } catch (error: unknown) {
    // Best effort rollback: delete the version document
    await esClient.delete({
      index: ES_INDEX.researchVersion,
      id: newHumVersionId,
    }, { ignore: [404] })

    // Check for version conflict
    if (error && typeof error === "object" && "meta" in error) {
      const esError = error as { meta?: { statusCode?: number } }
      if (esError.meta?.statusCode === 409) {
        return null // Conflict
      }
    }
    throw error
  }

  return EsResearchVersionDocSchema.parse(versionDoc)
}

// === Dataset Linking ===

/**
 * Link a Dataset to a Research (updates latest ResearchVersion)
 * Owner or admin can link
 *
 * @param humId - Research ID
 * @param datasetId - Dataset ID to link
 * @param version - Dataset version to link
 * @returns Updated datasets array, null on conflict or not found
 */
export const linkDatasetToResearch = async (
  humId: string,
  datasetId: string,
  version: string,
): Promise<{ datasetId: string; version: string }[] | null> => {
  // Get latest ResearchVersion
  const latestVersion = await getResearchVersion(humId, {})
  if (!latestVersion) {
    return null
  }

  const humVersionId = latestVersion.humVersionId

  // Get with sequence number for optimistic locking
  const versionWithSeq = await getResearchVersionWithSeqNo(humVersionId)
  if (!versionWithSeq) {
    return null
  }

  const { doc, seqNo, primaryTerm } = versionWithSeq

  // Check if dataset is already linked
  const isAlreadyLinked = doc.datasets.some(
    d => d.datasetId === datasetId && d.version === version,
  )
  if (isAlreadyLinked) {
    return doc.datasets // Already linked, return current state
  }

  // Add dataset to the list
  const newDatasets = [...doc.datasets, { datasetId, version }]

  try {
    await esClient.update({
      index: ES_INDEX.researchVersion,
      id: humVersionId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          datasets: newDatasets,
        },
      },
      refresh: "wait_for",
    })

    return newDatasets
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
 * Unlink a Dataset from a Research (updates latest ResearchVersion)
 * Owner or admin can unlink
 *
 * @param humId - Research ID
 * @param datasetId - Dataset ID to unlink
 * @param version - Optional: specific version to unlink (if not provided, unlinks all versions)
 * @returns true on success, false on conflict or not found
 */
export const unlinkDatasetFromResearch = async (
  humId: string,
  datasetId: string,
  version?: string,
): Promise<boolean> => {
  // Get latest ResearchVersion
  const latestVersion = await getResearchVersion(humId, {})
  if (!latestVersion) {
    return false
  }

  const humVersionId = latestVersion.humVersionId

  // Get with sequence number for optimistic locking
  const versionWithSeq = await getResearchVersionWithSeqNo(humVersionId)
  if (!versionWithSeq) {
    return false
  }

  const { doc, seqNo, primaryTerm } = versionWithSeq

  // Filter out the dataset(s)
  const newDatasets = version
    ? doc.datasets.filter(d => !(d.datasetId === datasetId && d.version === version))
    : doc.datasets.filter(d => d.datasetId !== datasetId)

  // If nothing was removed, still return success
  if (newDatasets.length === doc.datasets.length) {
    return true // Nothing to unlink, but not an error
  }

  try {
    await esClient.update({
      index: ES_INDEX.researchVersion,
      id: humVersionId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          datasets: newDatasets,
        },
      },
      refresh: "wait_for",
    })

    return true
  } catch (error: unknown) {
    // Check for version conflict
    if (error && typeof error === "object" && "meta" in error) {
      const esError = error as { meta?: { statusCode?: number } }
      if (esError.meta?.statusCode === 409) {
        return false // Conflict
      }
    }
    throw error
  }
}
