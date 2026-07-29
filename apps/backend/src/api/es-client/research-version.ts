/**
 * Research Version operations for Elasticsearch
 *
 * This module provides:
 * - ResearchVersion retrieval (getResearchVersion, listResearchVersions)
 * - ResearchVersion creation (createResearchVersion)
 * - ResearchVersion update (updateResearchVersionReleaseNote)
 * - Dataset linking (linkDatasetToResearch, unlinkDatasetFromResearch)
 */
import { ConflictError } from "@/api/errors"
import { canAccessResearchDoc } from "@/api/es-client/auth"
import { esClient, ES_INDEX, isConflictError, isDocumentExistsError } from "@/api/es-client/client"
import { lockedUpdateBody, mgetMap } from "@/api/es-client/utils"
import {
  EsResearchSchema,
  ResearchVersionSchema,
} from "@/api/types"
import type {
  AuthUser,
  EsResearch,
  ResearchVersion,
} from "@/api/types"
import type { BilingualTextValueRequest } from "@/api/types/request-schemas"
import { hydrateBilingualTextValue } from "@/api/utils/hydrate-raw-html"
import { nextVersionNumber, resolveEditTargetVersion } from "@/api/utils/version"

/**
 * Read the Research root doc. Local rather than imported from
 * `es-client/research` because that module already imports this one.
 */
const getResearchRoot = async (humId: string): Promise<EsResearch | null> => {
  const res = await esClient.get<EsResearch>({
    index: ES_INDEX.research,
    id: humId,
  }, { ignore: [404] })

  return res.found && res._source ? EsResearchSchema.parse(res._source) : null
}

/**
 * humVersionId that dataset links belong to, resolved from the Research root's
 * `draftVersion` / `latestVersion` — the same routing `updateResearch` uses for
 * content. Null when the Research is missing or names no version.
 */
const resolveEditTargetHumVersionId = async (humId: string): Promise<string | null> => {
  const research = await getResearchRoot(humId)
  if (!research) return null
  const version = resolveEditTargetVersion(research)

  return version ? `${humId}-${version}` : null
}

/**
 * Extract per-version content snapshot from either a ResearchVersion
 * (SSOT after migration) or the Research root (fallback for pre-migration
 * RV docs whose content fields are null). Prefer the RV when populated so
 * a v2 draft doesn't clobber v1's snapshot with root's current state.
 */
const pickContentForNewVersion = (
  latestRv: ResearchVersion | null,
  research: EsResearch,
) => ({
  title: latestRv?.title ?? research.title,
  summary: latestRv?.summary ?? research.summary,
  dataProvider: latestRv?.dataProvider ?? research.dataProvider,
  researchProject: latestRv?.researchProject ?? research.researchProject,
  grant: latestRv?.grant ?? research.grant,
  relatedPublication: latestRv?.relatedPublication ?? research.relatedPublication,
})

// === ResearchVersion Retrieval ===

/**
 * Fetch one ResearchVersion by version.
 *
 * The version is always explicit: callers resolve it from the Research root's
 * `latestVersion` / `draftVersion`. Picking the highest-numbered RV instead
 * would silently select an orphan above `latestVersion` — the migration left
 * such docs, and their content was never published.
 */
export const getResearchVersion = async (
  humId: string,
  { version }: { version: string },
): Promise<ResearchVersion | null> => {
  const res = await esClient.get<ResearchVersion>({
    index: ES_INDEX.researchVersion,
    id: `${humId}-${version}`,
  }, { ignore: [404] })

  return res.found && res._source ? ResearchVersionSchema.parse(res._source) : null
}

/**
 * Get ResearchVersion document with sequence number for optimistic locking
 */
export const getResearchVersionWithSeqNo = async (
  humVersionId: string,
): Promise<{ doc: ResearchVersion; seqNo: number; primaryTerm: number } | null> => {
  const res = await esClient.get<ResearchVersion>({
    index: ES_INDEX.researchVersion,
    id: humVersionId,
  }, { ignore: [404] })

  if (!res.found || !res._source) return null

  return {
    doc: ResearchVersionSchema.parse(res._source),
    seqNo: res._seq_no ?? 0,
    primaryTerm: res._primary_term ?? 0,
  }
}

export const listResearchVersions = async (
  humId: string,
  authUser: AuthUser | null = null,
): Promise<ResearchVersion[] | null> => {
  const res = await esClient.get<EsResearch>({
    index: ES_INDEX.research,
    id: humId,
  }, { ignore: [404] })
  if (!res.found || !res._source) return null
  const researchDoc = EsResearchSchema.parse(res._source)

  // Authorization check: verify user can access this Research
  if (!await canAccessResearchDoc(authUser, researchDoc)) {
    return null // Return null to hide existence from unauthorized users
  }

  const rvIds = researchDoc.versionIds
  if (rvIds.length === 0) return []
  const rvMap = await mgetMap(ES_INDEX.researchVersion, rvIds, (doc: unknown) => ResearchVersionSchema.parse(doc))

  return rvIds
    .map((id: string) => rvMap.get(id))
    .filter((x): x is ResearchVersion => !!x)
}

export const listResearchVersionsSorted = async (
  humId: string,
  authUser: AuthUser | null = null,
): Promise<ResearchVersion[] | null> => {
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
  releaseNote: BilingualTextValueRequest,
  datasets: { datasetId: string; version: string }[] | undefined,
  seqNo: number,
  primaryTerm: number,
): Promise<ResearchVersion | null> => {
  const now = new Date().toISOString().split("T")[0]

  const research = await getResearchRoot(humId)
  if (!research) {
    throw new Error(`Research ${humId} not found`)
  }

  const newVersion = `v${nextVersionNumber(research.versionIds)}`
  const newHumVersionId = `${humId}-${newVersion}`

  // Source of both dataset refs and the content snapshot: the published
  // version named by `latestVersion`, not whichever RV carries the highest
  // number. An RV above `latestVersion` — the migration left orphans there —
  // holds content that was never published, and copying it into the new draft
  // would publish it at the next approve.
  const latestRv = research.latestVersion
    ? await getResearchVersion(humId, { version: research.latestVersion })
    : null
  const datasetsToUse = datasets ?? latestRv?.datasets ?? []
  const content = pickContentForNewVersion(latestRv, research)

  // Create new ResearchVersion document — carries the copied content so the
  // draft starts from the published version's snapshot and PUT /update writes
  // land on this RV doc without perturbing the Research root.
  const versionDoc: ResearchVersion = {
    humId,
    humVersionId: newHumVersionId,
    version: newVersion,
    versionReleaseDate: now,
    datasets: datasetsToUse,
    releaseNote: hydrateBilingualTextValue(releaseNote),
    ...content,
  }

  // Index the version document first
  // Use op_type: "create" to prevent overwriting existing documents
  try {
    await esClient.index({
      index: ES_INDEX.researchVersion,
      id: newHumVersionId,
      body: versionDoc,
      op_type: "create",
      refresh: "wait_for",
    })
  } catch (error) {
    if (isDocumentExistsError(error)) {
      throw ConflictError.forDuplicate("ResearchVersion", newHumVersionId)
    }
    throw new Error(`Failed to create ResearchVersion: ${error}`)
  }

  // Update Research to add new version to versionIds, set draftVersion, and change status to draft
  // latestVersion is NOT changed here (keeps the published version visible)
  try {
    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: lockedUpdateBody({
        versionIds: [...research.versionIds, newHumVersionId],
        draftVersion: newVersion,
        status: "draft",
        dateModified: now,
      }),
      refresh: "wait_for",
    })
  } catch (error: unknown) {
    // Best effort rollback: delete the version document
    await esClient.delete({
      index: ES_INDEX.researchVersion,
      id: newHumVersionId,
    }, { ignore: [404] })

    if (isConflictError(error)) return null
    throw error
  }

  return ResearchVersionSchema.parse(versionDoc)
}

// === Dataset Linking ===

/**
 * Link a Dataset to the Research's edit target version (draft when one is in
 * flight, otherwise the published version). Owner or admin can link.
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
  const humVersionId = await resolveEditTargetHumVersionId(humId)
  if (!humVersionId) {
    return null
  }

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
      body: lockedUpdateBody({ datasets: newDatasets }),
      refresh: "wait_for",
    })

    return newDatasets
  } catch (error: unknown) {
    if (isConflictError(error)) return null
    throw error
  }
}

/**
 * Unlink a Dataset from the Research's edit target version (draft when one is
 * in flight, otherwise the published version). Owner or admin can unlink.
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
  const humVersionId = await resolveEditTargetHumVersionId(humId)
  if (!humVersionId) {
    return false
  }

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
      body: lockedUpdateBody({ datasets: newDatasets }),
      refresh: "wait_for",
    })

    return true
  } catch (error: unknown) {
    if (isConflictError(error)) return false
    throw error
  }
}

// === ResearchVersion Update ===

export const updateResearchVersionReleaseNote = async (
  humVersionId: string,
  releaseNote: BilingualTextValueRequest,
  seqNo: number,
  primaryTerm: number,
): Promise<boolean> => {
  try {
    await esClient.update({
      index: ES_INDEX.researchVersion,
      id: humVersionId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: lockedUpdateBody({ releaseNote: hydrateBilingualTextValue(releaseNote) }),
      refresh: "wait_for",
    })
    return true
  } catch (error: unknown) {
    if (isConflictError(error)) return false
    throw error
  }
}
