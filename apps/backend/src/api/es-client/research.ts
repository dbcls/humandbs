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
  BilingualText,
  CreateResearchRequest,
  EsDataset,
  EsResearch,
  Grant,
  Person,
  Publication,
  ResearchProject,
  ResearchVersion,
  ResearchDetail,
  ResearchStatus,
  Summary,
  UpdateResearchRequest,
} from "@/api/types"
import {
  hydrateBilingualTextValue,
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
  if (!await canAccessResearchDoc(authUser, researchDoc)) {
    return null // Return null to hide existence from unauthorized users
  }

  // Version resolution (owner/admin gets draft, others get published only)
  const resolvedVersion = await resolveVersionForUser(authUser, researchDoc, version) ?? undefined
  if (!resolvedVersion) return null

  const researchVersionDoc = await getResearchVersion(humId, { version: resolvedVersion })
  if (!researchVersionDoc) return null

  // datasets is now { datasetId, version }[]
  const dsRefs = researchVersionDoc.datasets
  const dsIds = dsRefs.map(ref => `${ref.datasetId}-${ref.version}`)
  const dsMap = await mgetMap(ES_INDEX.dataset, dsIds, (doc: unknown) => EsDatasetSchema.parse(doc))
  const datasets = dsIds.map(id => dsMap.get(id)).filter((x): x is EsDataset => !!x)

  // Content SSOT: the resolved RV doc. Root content is a `latestVersion`
  // snapshot only, so overlay per-version fields on top of the root spread.
  // `pickVersionContent` falls back to root values for pre-migration RVs
  // whose content fields are still null.
  const content = pickVersionContent(researchVersionDoc, extractResearchContent(researchDoc))

  const { versionIds: _versionIds, ...researchDocRest } = researchDoc

  return ResearchDetailSchema.parse({
    ...researchDocRest,
    ...content,
    humVersionId: researchVersionDoc.humVersionId,
    version: researchVersionDoc.version,
    versionReleaseDate: researchVersionDoc.versionReleaseDate,
    releaseNote: researchVersionDoc.releaseNote,
    datasets,
  })
}

// === Content field helpers ===

/**
 * Content fields that live on ResearchVersion as the per-version SSOT and are
 * mirrored on the Research root only as the `latestVersion` snapshot for
 * search / listing. Splitting them out prevents draft edits from leaking to
 * public viewers via the Research root.
 *
 * `summaryShort` and `controlledAccessUser` are NOT here: `summaryShort` is a
 * per-humId Joomla-derived listing snippet, `controlledAccessUser` is
 * accumulated across versions by the CAU pipeline. Both stay Research-only.
 */
export interface ResearchContentSnapshot {
  title: BilingualText
  summary: Summary
  dataProvider: Person[]
  researchProject: ResearchProject[]
  grant: Grant[]
  relatedPublication: Publication[]
}

const DEFAULT_SUMMARY: Summary = {
  aims: { ja: null, en: null },
  methods: { ja: null, en: null },
  targets: { ja: null, en: null },
  url: { ja: [], en: [] },
}

/** Hydrate an UpdateResearchRequest / CreateResearchRequest into a full content snapshot with sensible defaults. */
export const buildContentSnapshot = (
  updates: Pick<UpdateResearchRequest, "title" | "summary" | "dataProvider" | "researchProject" | "grant" | "relatedPublication">,
): ResearchContentSnapshot => ({
  title: updates.title ?? { ja: null, en: null },
  summary: updates.summary ? hydrateSummary(updates.summary) : DEFAULT_SUMMARY,
  dataProvider: updates.dataProvider?.map(hydratePerson) ?? [],
  researchProject: updates.researchProject?.map(hydrateResearchProject) ?? [],
  grant: updates.grant ?? [],
  relatedPublication: updates.relatedPublication ?? [],
})

/**
 * Extract only the content fields the caller sent (for partial updates).
 * Empty object when no content field is present — signals "no RV content write".
 */
const buildContentUpdate = (
  updates: Pick<UpdateResearchRequest, "title" | "summary" | "dataProvider" | "researchProject" | "grant" | "relatedPublication">,
): Partial<ResearchContentSnapshot> => {
  const out: Partial<ResearchContentSnapshot> = {}
  if (updates.title !== undefined) out.title = updates.title
  if (updates.summary !== undefined) out.summary = hydrateSummary(updates.summary)
  if (updates.dataProvider !== undefined) out.dataProvider = updates.dataProvider.map(hydratePerson)
  if (updates.researchProject !== undefined) out.researchProject = updates.researchProject.map(hydrateResearchProject)
  if (updates.grant !== undefined) out.grant = updates.grant
  if (updates.relatedPublication !== undefined) out.relatedPublication = updates.relatedPublication
  return out
}

/**
 * Pick per-version content out of a ResearchVersion doc, falling back to the
 * Research root when a field is null/undefined (pre-migration RV docs).
 * Used by `createResearchVersion` when seeding a new version, and by
 * `getResearchDetail` when merging the response.
 */
export const pickVersionContent = (
  rv: Pick<ResearchVersion, "title" | "summary" | "dataProvider" | "researchProject" | "grant" | "relatedPublication">,
  fallback: ResearchContentSnapshot,
): ResearchContentSnapshot => ({
  title: rv.title ?? fallback.title,
  summary: rv.summary ?? fallback.summary,
  dataProvider: rv.dataProvider ?? fallback.dataProvider,
  researchProject: rv.researchProject ?? fallback.researchProject,
  grant: rv.grant ?? fallback.grant,
  relatedPublication: rv.relatedPublication ?? fallback.relatedPublication,
})

const extractResearchContent = (research: EsResearch): ResearchContentSnapshot => ({
  title: research.title,
  summary: research.summary,
  dataProvider: research.dataProvider,
  researchProject: research.researchProject,
  grant: research.grant,
  relatedPublication: research.relatedPublication,
})

// === Research Creation ===

/**
 * Create Research with initial version (v1)
 * Admin only - creates Research (status=draft) + ResearchVersion (v1)
 *
 * Both the Research root doc and the v1 RV doc carry the same content
 * snapshot so subsequent draft edits (which target the RV only) start from a
 * consistent state.
 */
export const createResearch = async (
  params: CreateResearchRequest,
): Promise<{ research: EsResearch; version: ResearchVersion }> => {
  const now = new Date().toISOString().split("T")[0]

  const humId = params.humId
  const version = "v1"
  const humVersionId = `${humId}-${version}`

  const content = buildContentSnapshot(params)

  const researchDoc: EsResearch = {
    humId,
    url: { ja: `https://humandbs.dbcls.jp/${humId}`, en: `https://humandbs.dbcls.jp/en/${humId}` },
    ...content,
    controlledAccessUser: [],
    versionIds: [humVersionId],
    latestVersion: null,
    draftVersion: version,
    datePublished: null,
    dateModified: now,
    status: "draft",
    summaryShort: params.summaryShort
      ? {
        methods: hydrateBilingualTextValue(params.summaryShort.methods),
        typeOfData: hydrateBilingualTextValue(params.summaryShort.typeOfData),
        targets: hydrateBilingualTextValue(params.summaryShort.targets),
      }
      : null,
  }

  const versionDoc: ResearchVersion = {
    humId,
    humVersionId,
    version,
    versionReleaseDate: now,
    datasets: [],
    releaseNote: { ja: null, en: null },
    ...content,
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
 * Update Research document with optimistic locking.
 * Owner or admin can update. Handles both draft edits and published patches.
 *
 * ## Write routing
 *
 * Content fields (title / summary / dataProvider / researchProject / grant /
 * relatedPublication) live on the RV doc as the per-version SSOT and mirror
 * onto the Research root only as the `latestVersion` snapshot. The router:
 *
 * - Always writes content updates to `RV[draftVersion ?? latestVersion]`.
 * - Additionally writes them to the Research root iff the target version is
 *   the currently published `latestVersion` — i.e. an in-place patch. Draft
 *   edits (V-new-version draft where `latestVersion != null`) never touch
 *   root content, so public viewers keep seeing the published snapshot.
 * - For N-new-hum drafts (`latestVersion == null`) the Research is not
 *   publicly visible, so writing content to root would be safe — but we keep
 *   the invariant "root content = latestVersion snapshot" by NOT writing to
 *   root and letting `approve` sync it. Root retains the creation-time
 *   content, which is fine (nobody public can read it yet).
 *
 * `summaryShort` and `url` stay Research-root-only (see contentSnapshot doc
 * above); they update on every call.
 *
 * @param research   Preloaded root doc — status / latestVersion / draftVersion
 *                   drive the write routing above.
 * @returns Updated Research root doc; null on optimistic-lock conflict.
 */
export const updateResearch = async (
  humId: string,
  research: Pick<EsResearch, "status" | "latestVersion" | "draftVersion">,
  updates: Omit<UpdateResearchRequest, "_seq_no" | "_primary_term" | "releaseNote"> & {
    url?: { ja: string | null; en: string | null }
  },
  seqNo: number,
  primaryTerm: number,
): Promise<EsResearch | null> => {
  const now = new Date().toISOString().split("T")[0]

  const contentUpdate = buildContentUpdate(updates)
  const hasContent = Object.keys(contentUpdate).length > 0

  // Root-only fields (never per-version).
  const rootDoc: Record<string, unknown> = { dateModified: now }
  if (updates.url !== undefined) rootDoc.url = updates.url
  if (updates.summaryShort !== undefined) {
    rootDoc.summaryShort = updates.summaryShort === null
      ? null
      : {
        methods: hydrateBilingualTextValue(updates.summaryShort.methods),
        typeOfData: hydrateBilingualTextValue(updates.summaryShort.typeOfData),
        targets: hydrateBilingualTextValue(updates.summaryShort.targets),
      }
  }

  // RV write target and whether root should also carry the content update.
  const targetVersion = research.draftVersion ?? research.latestVersion
  if (hasContent && !targetVersion) {
    throw new Error(`updateResearch: Research ${humId} has no draftVersion or latestVersion`)
  }
  const shouldMirrorRoot = hasContent && targetVersion === research.latestVersion
  if (shouldMirrorRoot) Object.assign(rootDoc, contentUpdate)

  try {
    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: { doc: rootDoc },
      refresh: "wait_for",
    })
  } catch (error: unknown) {
    if (isConflictError(error)) return null
    throw createEsError(error, "updateResearch", humId)
  }

  // RV content update runs only after the root update succeeds — the root's
  // optimistic lock is the concurrency gate. A network failure here leaves
  // root.dateModified bumped without RV content changing; the caller retries.
  if (hasContent && targetVersion) {
    try {
      await esClient.update({
        index: ES_INDEX.researchVersion,
        id: `${humId}-${targetVersion}`,
        body: { doc: contentUpdate },
        refresh: "wait_for",
      })
    } catch (error: unknown) {
      throw createEsError(error, "updateResearch(RV)", humId)
    }
  }

  const refreshed = await getResearchDoc(humId)
  if (!refreshed) return null

  // For V-new-version draft edits, content was written only to RV[draftVersion]
  // — the root doc's content is still the stale latestVersion snapshot. Return
  // the caller their fresh edit by overlaying RV content on the root when the
  // edit went somewhere other than the latestVersion RV.
  if (hasContent && targetVersion && targetVersion !== refreshed.latestVersion) {
    const rv = await getResearchVersion(humId, { version: targetVersion })
    if (rv) {
      const content = pickVersionContent(rv, extractResearchContent(refreshed))
      return { ...refreshed, ...content }
    }
  }
  return refreshed
}

/**
 * Copy content from `RV[version]` back onto the Research root. Called by
 * `approve` (draft → published) so the Research root snapshot tracks the
 * newly-published version. Idempotent: repeating the sync is a no-op when
 * root and RV are already in sync.
 *
 * Only fields present (non-null) on the RV are written — a pre-migration RV
 * with null content fields keeps the root's current values instead of
 * wiping them.
 */
export const syncResearchRootFromVersion = async (
  humId: string,
  version: string,
): Promise<void> => {
  const rv = await getResearchVersion(humId, { version })
  if (!rv) {
    throw new Error(`syncResearchRootFromVersion: RV ${humId}-${version} not found`)
  }
  const doc: Record<string, unknown> = {}
  if (rv.title != null) doc.title = rv.title
  if (rv.summary != null) doc.summary = rv.summary
  if (rv.dataProvider != null) doc.dataProvider = rv.dataProvider
  if (rv.researchProject != null) doc.researchProject = rv.researchProject
  if (rv.grant != null) doc.grant = rv.grant
  if (rv.relatedPublication != null) doc.relatedPublication = rv.relatedPublication
  if (Object.keys(doc).length === 0) return

  try {
    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      body: { doc },
      refresh: "wait_for",
    })
  } catch (error: unknown) {
    throw createEsError(error, "syncResearchRootFromVersion", humId)
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

