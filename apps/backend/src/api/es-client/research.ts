/**
 * Research CRUD operations for Elasticsearch
 *
 * This module provides:
 * - Research document retrieval (getResearchDoc, getResearchWithSeqNo, getResearchDetail)
 * - Research creation (createResearch, generateNextHumId)
 * - Research updates (updateResearch, updateResearchStatus, updateResearchUids)
 * - Research deletion (deleteResearch)
 */
import { ConflictError } from "@/api/errors"
import { canAccessResearchDoc } from "@/api/es-client/auth"
import { esClient, ES_INDEX, isDocumentExistsError } from "@/api/es-client/client"
import { getResearchVersion } from "@/api/es-client/research-version"
import { mgetMap } from "@/api/es-client/utils"
import {
  EsDatasetDocSchema,
  EsResearchDocSchema,
  EsResearchVersionDocSchema,
  EsResearchDetailSchema,
} from "@/api/types"
import type {
  AuthUser,
  EsDatasetDoc,
  EsResearchDoc,
  EsResearchVersionDoc,
  EsResearchDetail,
  ResearchStatus,
} from "@/api/types"

// === Elasticsearch Error Helpers ===

interface EsErrorMeta {
  meta?: { statusCode?: number; body?: { error?: { type?: string; reason?: string } } }
}

/**
 * Type guard for Elasticsearch client errors
 */
const isEsError = (error: unknown): error is EsErrorMeta => {
  return error !== null && typeof error === "object" && "meta" in error
}

/**
 * Check if error is a version conflict (HTTP 409)
 */
const isVersionConflict = (error: unknown): boolean => {
  return isEsError(error) && error.meta?.statusCode === 409
}

/**
 * Create an Error with ES operation context
 */
const createEsError = (error: unknown, operation: string, humId: string): Error => {
  if (isEsError(error)) {
    const statusCode = error.meta?.statusCode
    const errorType = error.meta?.body?.error?.type
    const reason = error.meta?.body?.error?.reason
    return new Error(
      `ES ${operation} failed for ${humId}: status=${statusCode}, type=${errorType}, reason=${reason}`,
      { cause: error },
    )
  }
  return new Error(`${operation} failed for ${humId}: ${String(error)}`, { cause: error })
}

// === Research Document Retrieval ===

export const getResearchDoc = async (
  humId: string,
): Promise<EsResearchDoc | null> => {
  const id = humId // lang suffix removed (BilingualText format)
  const res = await esClient.get<EsResearchDoc>({
    index: ES_INDEX.research,
    id,
  }, { ignore: [404] })
  return res.found && res._source ? EsResearchDocSchema.parse(res._source) : null
}

/**
 * Get Research document with sequence number for optimistic locking
 */
export const getResearchWithSeqNo = async (
  humId: string,
): Promise<{ doc: EsResearchDoc; seqNo: number; primaryTerm: number } | null> => {
  const res = await esClient.get<EsResearchDoc>({
    index: ES_INDEX.research,
    id: humId,
  }, { ignore: [404] })

  if (!res.found || !res._source) return null

  return {
    doc: EsResearchDocSchema.parse(res._source),
    seqNo: res._seq_no ?? 0,
    primaryTerm: res._primary_term ?? 0,
  }
}

export const getResearchDetail = async (
  humId: string,
  { version }: { version?: string },
  authUser: AuthUser | null = null,
): Promise<EsResearchDetail | null> => {
  const [researchWithSeqNo, researchVersionDoc] = await Promise.all([
    getResearchWithSeqNo(humId),
    getResearchVersion(humId, { version }),
  ])
  if (!researchWithSeqNo || !researchVersionDoc) return null

  const { doc: researchDoc, seqNo, primaryTerm } = researchWithSeqNo

  // Authorization check: verify user can access this Research
  if (!canAccessResearchDoc(authUser, researchDoc)) {
    return null // Return null to hide existence from unauthorized users
  }

  // datasets is now { datasetId, version }[]
  const dsRefs = researchVersionDoc.datasets
  const dsIds = dsRefs.map(ref => `${ref.datasetId}-${ref.version}`)
  const dsMap = await mgetMap(ES_INDEX.dataset, dsIds, (doc: unknown) => EsDatasetDocSchema.parse(doc))
  const datasets = dsIds.map(id => dsMap.get(id)).filter((x): x is EsDatasetDoc => !!x)

  const { versionIds: _versionIds, ...researchDocRest } = researchDoc

  return EsResearchDetailSchema.parse({
    ...researchDocRest,
    humVersionId: researchVersionDoc.humVersionId,
    version: researchVersionDoc.version,
    versionReleaseDate: researchVersionDoc.versionReleaseDate,
    releaseNote: researchVersionDoc.releaseNote,
    datasets,
    // Include optimistic locking fields
    _seq_no: seqNo,
    _primary_term: primaryTerm,
  })
}

// === Research Creation ===

/**
 * Generate next humId
 * humId format: "hum" + 4 digits (hum0001, hum0002, ...)
 *
 * Uses Sort Query (descending) with size=1 for efficient index-based retrieval
 */
export const generateNextHumId = async (): Promise<string> => {
  const res = await esClient.search<{ humId: string }>({
    index: ES_INDEX.research,
    size: 1,
    _source: ["humId"],
    sort: [{ humId: { order: "desc" } }],
    track_total_hits: false,
  })

  const hit = res.hits.hits[0]
  if (hit?._source?.humId == null) {
    // No existing documents, start from hum0001
    return "hum0001"
  }

  // Extract number from humId (e.g., "hum0123" → 123)
  const match = /^hum(\d+)$/.exec(hit._source.humId)
  const maxNum = match ? parseInt(match[1], 10) : 0
  return `hum${String(maxNum + 1).padStart(4, "0")}`
}

/**
 * Create Research with initial version (v1)
 * Admin only - creates Research (status=draft) + ResearchVersion (v1)
 *
 * @param params - Research data (title, summary, dataProvider, etc.)
 * @param uids - User IDs (Keycloak sub) who can edit this research
 * @param humId - Optional humId (auto-generated if not provided)
 * @param initialReleaseNote - Optional release note for v1
 * @returns Created Research and ResearchVersion
 */
export const createResearch = async (params: {
  title?: { ja: string | null; en: string | null }
  summary?: {
    aims: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
    methods: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
    targets: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
    url: { ja: { text: string; url: string }[]; en: { text: string; url: string }[] }
    footers: { ja: { text: string; rawHtml: string }[]; en: { text: string; rawHtml: string }[] }
  }
  dataProvider?: {
    name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
    email?: string | null
    orcid?: string | null
    organization?: {
      name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      address?: { country?: string | null } | null
    } | null
    datasetIds?: string[]
    researchTitle?: { ja: string | null; en: string | null }
    periodOfDataUse?: { startDate: string | null; endDate: string | null } | null
  }[]
  researchProject?: {
    name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
    url?: { ja: { text: string; url: string } | null; en: { text: string; url: string } | null } | null
  }[]
  grant?: {
    id: string[]
    title: { ja: string | null; en: string | null }
    agency: { name: { ja: string | null; en: string | null } }
  }[]
  relatedPublication?: {
    title: { ja: string | null; en: string | null }
    doi?: string | null
    datasetIds?: string[]
  }[]
  uids?: string[]
  humId?: string
  initialReleaseNote?: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
}): Promise<{ research: EsResearchDoc; version: EsResearchVersionDoc }> => {
  const now = new Date().toISOString().split("T")[0]

  // Default summary structure
  const defaultSummary = {
    aims: { ja: null, en: null },
    methods: { ja: null, en: null },
    targets: { ja: null, en: null },
    url: { ja: [], en: [] },
    footers: { ja: [], en: [] },
  }

  // Retry logic for auto-generated humId (race condition prevention)
  const MAX_RETRIES = 3
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Generate humId if not provided
    const humId = params.humId ?? await generateNextHumId()
    const version = "v1"
    const humVersionId = `${humId}.${version}`

    // Create Research document with defaults for optional fields
    const researchDoc: EsResearchDoc = {
      humId,
      url: { ja: `https://humandbs.dbcls.jp/hum${humId.substring(3).padStart(4, "0")}`, en: `https://humandbs.dbcls.jp/en/hum${humId.substring(3).padStart(4, "0")}` },
      title: params.title ?? { ja: null, en: null },
      summary: params.summary ?? defaultSummary,
      dataProvider: params.dataProvider ?? [],
      researchProject: params.researchProject ?? [],
      grant: params.grant ?? [],
      relatedPublication: params.relatedPublication ?? [],
      controlledAccessUser: [],
      versionIds: [humVersionId],
      latestVersion: version,
      datePublished: now,
      dateModified: now,
      status: "draft",
      uids: params.uids ?? [],
    }

    // Create ResearchVersion document (v1)
    const versionDoc: EsResearchVersionDoc = {
      humId,
      humVersionId,
      version,
      versionReleaseDate: now,
      datasets: [],
      releaseNote: params.initialReleaseNote ?? { ja: null, en: null },
    }

    // Index documents (version first, then research)
    // Use op_type: "create" to prevent overwriting existing documents
    try {
      await esClient.index({
        index: ES_INDEX.researchVersion,
        id: humVersionId,
        body: versionDoc,
        op_type: "create",
        refresh: "wait_for",
      })
    } catch (error) {
      if (isDocumentExistsError(error)) {
        if (params.humId) {
          // Explicit humId provided - don't retry, throw conflict error
          throw ConflictError.forDuplicate("ResearchVersion", humVersionId)
        }
        // Auto-generated humId - retry with new ID
        lastError = error as Error
        continue
      }
      throw new Error(`Failed to create ResearchVersion: ${error}`)
    }

    try {
      await esClient.index({
        index: ES_INDEX.research,
        id: humId,
        body: researchDoc,
        op_type: "create",
        refresh: "wait_for",
      })
    } catch (error) {
      // Best effort rollback: delete the version document
      await esClient.delete({
        index: ES_INDEX.researchVersion,
        id: humVersionId,
      }, { ignore: [404] })

      if (isDocumentExistsError(error)) {
        if (params.humId) {
          // Explicit humId provided - don't retry, throw conflict error
          throw ConflictError.forDuplicate("Research", humId)
        }
        // Auto-generated humId - retry with new ID
        lastError = error as Error
        continue
      }
      throw new Error(`Failed to create Research: ${error}`)
    }

    // Success - return the created documents
    return {
      research: EsResearchDocSchema.parse(researchDoc),
      version: EsResearchVersionDocSchema.parse(versionDoc),
    }
  }

  // All retries exhausted
  throw lastError ?? new Error("Failed to create Research after retries")
}

// === Research Updates ===

/**
 * Update Research document with optimistic locking
 * Owner or admin can update
 *
 * @param humId - Research ID
 * @param updates - Fields to update
 * @param seqNo - Sequence number for optimistic locking
 * @param primaryTerm - Primary term for optimistic locking
 * @returns Updated Research document, null on conflict
 */
export const updateResearch = async (
  humId: string,
  updates: {
    url?: { ja: string | null; en: string | null }
    title?: { ja: string | null; en: string | null }
    summary?: {
      aims: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      methods: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      targets: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      url: { ja: { text: string; url: string }[]; en: { text: string; url: string }[] }
      footers: { ja: { text: string; rawHtml: string }[]; en: { text: string; rawHtml: string }[] }
    }
    dataProvider?: {
      name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      email?: string | null
      orcid?: string | null
      organization?: {
        name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
        address?: { country?: string | null } | null
      } | null
      datasetIds?: string[]
      researchTitle?: { ja: string | null; en: string | null }
      periodOfDataUse?: { startDate: string | null; endDate: string | null } | null
    }[]
    researchProject?: {
      name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      url?: { ja: { text: string; url: string } | null; en: { text: string; url: string } | null } | null
    }[]
    grant?: {
      id: string[]
      title: { ja: string | null; en: string | null }
      agency: { name: { ja: string | null; en: string | null } }
    }[]
    relatedPublication?: {
      title: { ja: string | null; en: string | null }
      doi?: string | null
      datasetIds?: string[]
    }[]
    controlledAccessUser?: {
      name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      email?: string | null
      orcid?: string | null
      organization?: {
        name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
        address?: { country?: string | null } | null
      } | null
      datasetIds?: string[]
      researchTitle?: { ja: string | null; en: string | null }
      periodOfDataUse?: { startDate: string | null; endDate: string | null } | null
    }[]
  },
  seqNo: number,
  primaryTerm: number,
): Promise<EsResearchDoc | null> => {
  try {
    const now = new Date().toISOString().split("T")[0]

    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          ...updates,
          dateModified: now,
        },
      },
      refresh: "wait_for",
    })

    return await getResearchDoc(humId)
  } catch (error: unknown) {
    if (isVersionConflict(error)) return null
    throw createEsError(error,"updateResearch", humId)
  }
}

/**
 * Update Research status with optimistic locking
 * Returns updated document with sequence info on success, null on conflict
 */
export const updateResearchStatus = async (
  humId: string,
  newStatus: ResearchStatus,
  seqNo: number,
  primaryTerm: number,
): Promise<{ doc: EsResearchDoc; seqNo: number; primaryTerm: number; dateModified: string } | null> => {
  try {
    const now = new Date().toISOString().split("T")[0]

    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          status: newStatus,
          dateModified: now,
        },
      },
      refresh: "wait_for",
    })

    // Fetch updated document with new sequence info
    const result = await getResearchWithSeqNo(humId)
    if (!result) return null

    return {
      doc: result.doc,
      seqNo: result.seqNo,
      primaryTerm: result.primaryTerm,
      dateModified: now,
    }
  } catch (error: unknown) {
    if (isVersionConflict(error)) return null
    throw createEsError(error,"updateResearchStatus", humId)
  }
}

/**
 * Update Research UIDs (owner list) with optimistic locking
 * Admin only - changes who can edit this research
 * Returns updated uids on success, null on conflict
 */
export const updateResearchUids = async (
  humId: string,
  uids: string[],
  seqNo: number,
  primaryTerm: number,
): Promise<string[] | null> => {
  try {
    const now = new Date().toISOString().split("T")[0]

    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          uids,
          dateModified: now,
        },
      },
      refresh: "wait_for",
    })

    return uids
  } catch (error: unknown) {
    if (isVersionConflict(error)) return null
    throw createEsError(error,"updateResearchUids", humId)
  }
}

// === Research Deletion ===

/**
 * Delete Research (logical deletion)
 * Admin only - sets status to "deleted"
 *
 * @param humId - Research ID
 * @param seqNo - Sequence number for optimistic locking
 * @param primaryTerm - Primary term for optimistic locking
 * @returns true on success, false on conflict
 */
export const deleteResearch = async (
  humId: string,
  seqNo: number,
  primaryTerm: number,
): Promise<boolean> => {
  try {
    const now = new Date().toISOString().split("T")[0]

    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          status: "deleted",
          dateModified: now,
        },
      },
      refresh: "wait_for",
    })

    return true
  } catch (error: unknown) {
    if (isVersionConflict(error)) return false
    throw createEsError(error,"deleteResearch", humId)
  }
}

// === Additional Research Functions ===

/**
 * Get pending reviews (Research with status='review')
 * Admin only - returns list of Research awaiting approval
 */
export const getPendingReviews = async (
  page = 1,
  limit = 20,
): Promise<{ data: EsResearchDoc[]; total: number }> => {
  const from = (page - 1) * limit

  const res = await esClient.search<EsResearchDoc>({
    index: ES_INDEX.research,
    from,
    size: limit,
    query: { term: { status: "review" } },
    sort: [{ dateModified: { order: "desc" } }],
    _source: true,
    track_total_hits: true,
  })

  const data = res.hits.hits
    .map(hit => hit._source)
    .filter((doc): doc is EsResearchDoc => !!doc)
    .map(doc => EsResearchDocSchema.parse(doc))

  const total = typeof res.hits.total === "number" ? res.hits.total : res.hits.total?.value ?? 0

  return { data, total }
}
