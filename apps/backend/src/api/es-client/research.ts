/**
 * Research CRUD operations for Elasticsearch
 *
 * This module provides:
 * - Research document retrieval (getResearchDoc, getResearchWithSeqNo, getResearchDetail)
 * - Research creation (createResearch)
 * - Research updates (updateResearch, updateResearchStatus, updateResearchUids)
 * - Research deletion (deleteResearch)
 */
import { ConflictError } from "@/api/errors"
import { canAccessResearchDoc } from "@/api/es-client/auth"
import { esClient, ES_INDEX, isConflictError, isDocumentExistsError } from "@/api/es-client/client"
import { getResearchVersion } from "@/api/es-client/research-version"
import { mgetMap } from "@/api/es-client/utils"
import {
  EsDatasetSchema,
  EsResearchSchema,
  ResearchVersionSchema,
  ResearchDetailSchema,
} from "@/api/types"
import type {
  AuthUser,
  CreateResearchRequest,
  EsDataset,
  EsResearch,
  ResearchVersion,
  ResearchDetail,
  ResearchStatus,
  UpdateResearchRequest,
} from "@/api/types"
import {
  hydratePerson,
  hydrateResearchProject,
  hydrateSummary,
} from "@/api/utils/hydrate-raw-html"
import { resolveVersionForUser } from "@/api/utils/version"

// === Elasticsearch Error Helpers ===

interface EsErrorMeta {
  meta?: { statusCode?: number; body?: { error?: { type?: string; reason?: string } } }
}

const isEsError = (error: unknown): error is EsErrorMeta => {
  return error !== null && typeof error === "object" && "meta" in error
}

/**
 * Wrap an Elasticsearch error with operation context (preserves the original via `cause`).
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
): Promise<EsResearch | null> => {
  const id = humId
  const res = await esClient.get<EsResearch>({
    index: ES_INDEX.research,
    id,
  }, { ignore: [404] })
  return res.found && res._source ? EsResearchSchema.parse(res._source) : null
}

/**
 * Get Research document with sequence number for optimistic locking
 */
export const getResearchWithSeqNo = async (
  humId: string,
): Promise<{ doc: EsResearch; seqNo: number; primaryTerm: number } | null> => {
  const res = await esClient.get<EsResearch>({
    index: ES_INDEX.research,
    id: humId,
  }, { ignore: [404] })

  if (!res.found || !res._source) return null

  return {
    doc: EsResearchSchema.parse(res._source),
    seqNo: res._seq_no ?? 0,
    primaryTerm: res._primary_term ?? 0,
  }
}

export const getResearchDetail = async (
  humId: string,
  { version }: { version?: string },
  authUser: AuthUser | null = null,
): Promise<ResearchDetail | null> => {
  // Fetch Research first (version resolution depends on Research fields)
  const researchDoc = await getResearchDoc(humId)
  if (!researchDoc) return null

  // Authorization check: verify user can access this Research
  if (!canAccessResearchDoc(authUser, researchDoc)) {
    return null // Return null to hide existence from unauthorized users
  }

  // Version resolution (owner/admin gets draft, others get published only)
  const resolvedVersion = resolveVersionForUser(authUser, researchDoc, version) ?? undefined
  if (!resolvedVersion) return null

  const researchVersionDoc = await getResearchVersion(humId, { version: resolvedVersion })
  if (!researchVersionDoc) return null

  // datasets is now { datasetId, version }[]
  const dsRefs = researchVersionDoc.datasets
  const dsIds = dsRefs.map(ref => `${ref.datasetId}-${ref.version}`)
  const dsMap = await mgetMap(ES_INDEX.dataset, dsIds, (doc: unknown) => EsDatasetSchema.parse(doc))
  const datasets = dsIds.map(id => dsMap.get(id)).filter((x): x is EsDataset => !!x)

  const { versionIds: _versionIds, ...researchDocRest } = researchDoc

  return ResearchDetailSchema.parse({
    ...researchDocRest,
    humVersionId: researchVersionDoc.humVersionId,
    version: researchVersionDoc.version,
    versionReleaseDate: researchVersionDoc.versionReleaseDate,
    releaseNote: researchVersionDoc.releaseNote,
    datasets,
  })
}

// === Research Creation ===

/**
 * Create Research with initial version (v1)
 * Admin only - creates Research (status=draft) + ResearchVersion (v1)
 */
export const createResearch = async (
  params: CreateResearchRequest,
): Promise<{ research: EsResearch; version: ResearchVersion }> => {
  const now = new Date().toISOString().split("T")[0]

  const defaultSummary = {
    aims: { ja: null, en: null },
    methods: { ja: null, en: null },
    targets: { ja: null, en: null },
    url: { ja: [], en: [] },
  }

  const humId = params.humId
  const version = "v1"
  const humVersionId = `${humId}-${version}`

  const researchDoc: EsResearch = {
    humId,
    url: { ja: `https://humandbs.dbcls.jp/${humId}`, en: `https://humandbs.dbcls.jp/en/${humId}` },
    title: params.title ?? { ja: null, en: null },
    summary: params.summary ? hydrateSummary(params.summary) : defaultSummary,
    dataProvider: params.dataProvider?.map(hydratePerson) ?? [],
    researchProject: params.researchProject?.map(hydrateResearchProject) ?? [],
    grant: params.grant ?? [],
    relatedPublication: params.relatedPublication ?? [],
    controlledAccessUser: [],
    versionIds: [humVersionId],
    latestVersion: null,
    draftVersion: version,
    datePublished: null,
    dateModified: now,
    status: "draft",
    uids: params.uids ?? [],
  }

  const versionDoc: ResearchVersion = {
    humId,
    humVersionId,
    version,
    versionReleaseDate: now,
    datasets: [],
    releaseNote: { ja: null, en: null },
  }

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
      throw ConflictError.forDuplicate("ResearchVersion", humVersionId)
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
    await esClient.delete({
      index: ES_INDEX.researchVersion,
      id: humVersionId,
    }, { ignore: [404] })

    if (isDocumentExistsError(error)) {
      throw ConflictError.forDuplicate("Research", humId)
    }
    throw new Error(`Failed to create Research: ${error}`)
  }

  return {
    research: EsResearchSchema.parse(researchDoc),
    version: ResearchVersionSchema.parse(versionDoc),
  }
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
  updates: Omit<UpdateResearchRequest, "_seq_no" | "_primary_term"> & {
    url?: { ja: string | null; en: string | null }
  },
  seqNo: number,
  primaryTerm: number,
): Promise<EsResearch | null> => {
  try {
    const now = new Date().toISOString().split("T")[0]

    const hydratedDoc: Record<string, unknown> = {
      dateModified: now,
    }
    if (updates.url !== undefined) hydratedDoc.url = updates.url
    if (updates.title !== undefined) hydratedDoc.title = updates.title
    if (updates.summary !== undefined) hydratedDoc.summary = hydrateSummary(updates.summary)
    if (updates.dataProvider !== undefined) hydratedDoc.dataProvider = updates.dataProvider.map(hydratePerson)
    if (updates.researchProject !== undefined) hydratedDoc.researchProject = updates.researchProject.map(hydrateResearchProject)
    if (updates.grant !== undefined) hydratedDoc.grant = updates.grant
    if (updates.relatedPublication !== undefined) hydratedDoc.relatedPublication = updates.relatedPublication

    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: hydratedDoc,
      },
      refresh: "wait_for",
    })

    return await getResearchDoc(humId)
  } catch (error: unknown) {
    if (isConflictError(error)) return null
    throw createEsError(error,"updateResearch", humId)
  }
}

/**
 * Update Research status with optimistic locking
 * Optionally updates latestVersion/draftVersion alongside status
 * Returns updated document with sequence info on success, null on conflict
 */
export const updateResearchStatus = async (
  humId: string,
  newStatus: ResearchStatus,
  seqNo: number,
  primaryTerm: number,
  versionUpdates?: { latestVersion?: string | null; draftVersion?: string | null; datePublished?: string | null },
): Promise<{ doc: EsResearch; seqNo: number; primaryTerm: number; dateModified: string } | null> => {
  try {
    const now = new Date().toISOString().split("T")[0]

    const updateDoc: Record<string, unknown> = {
      status: newStatus,
      dateModified: now,
    }
    if (versionUpdates?.latestVersion !== undefined) {
      updateDoc.latestVersion = versionUpdates.latestVersion
    }
    if (versionUpdates?.draftVersion !== undefined) {
      updateDoc.draftVersion = versionUpdates.draftVersion
    }
    if (versionUpdates?.datePublished !== undefined) {
      updateDoc.datePublished = versionUpdates.datePublished
    }

    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: updateDoc,
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
    if (isConflictError(error)) return null
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
    if (isConflictError(error)) return null
    throw createEsError(error,"updateResearchUids", humId)
  }
}

// === Research Deletion ===

/**
 * Delete Research (logical deletion) and physically delete linked Datasets
 * Admin only - physically deletes Research, all linked ResearchVersions, and all linked Datasets
 */
export const deleteResearch = async (
  humId: string,
  seqNo: number,
  primaryTerm: number,
): Promise<boolean> => {
  try {
    await esClient.delete({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      refresh: "wait_for",
    })

    await esClient.deleteByQuery({
      index: ES_INDEX.researchVersion,
      query: { term: { humId } },
      refresh: true,
    })

    await esClient.deleteByQuery({
      index: ES_INDEX.dataset,
      query: { term: { humId } },
      refresh: true,
    })

    return true
  } catch (error: unknown) {
    if (isConflictError(error)) return false
    throw createEsError(error,"deleteResearch", humId)
  }
}

