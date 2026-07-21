/**
 * Version utilities
 *
 * Provides version number parsing and version resolution logic.
 */
import { isOwner } from "@/api/services/ownership"
import type { AuthUser, ResearchDetail } from "@/api/types"

/** Parse version number from version string (e.g., "v2" -> 2) */
export const parseVersionNum = (v: string): number => {
  const match = /^v(\d+)$/.exec(v)
  if (!match) {
    throw new Error(`Invalid version format: "${v}"`)
  }

  return parseInt(match[1], 10)
}

/**
 * Extract the version part from a humVersionId (e.g., "hum0006-v8" -> "v8").
 * Returns null if the id does not match the expected shape.
 */
export const parseVersionFromHumVersionId = (humVersionId: string): string | null => {
  const idx = humVersionId.lastIndexOf("-")
  if (idx <= 0) return null // must have a non-empty humId prefix
  const ver = humVersionId.slice(idx + 1)
  return /^v\d+$/.test(ver) ? ver : null
}

/**
 * Non-owner/admin visibility ceiling: a Dataset (or ResearchVersion) whose
 * humVersionId points to a version *after* the parent Research's
 * `latestVersion` (i.e. a draft) must be hidden.
 *
 * - owner/admin: always visible
 * - parent has no latestVersion (N-draft): always hidden for non-owner/admin
 * - otherwise: visible iff `parseVersionNum(childVersion) <= parseVersionNum(latestVersion)`
 *
 * Returns false when the humVersionId cannot be parsed (defensive; unknown-shape
 * ids are treated as hidden for non-owner/admin).
 */
export const isHumVersionAccessible = (
  humVersionId: string,
  parentLatestVersion: string | null,
  isOwnerOrAdmin: boolean,
): boolean => {
  if (isOwnerOrAdmin) return true
  if (parentLatestVersion === null) return false
  const childVer = parseVersionFromHumVersionId(humVersionId)
  if (childVer === null) return false
  return parseVersionNum(childVer) <= parseVersionNum(parentLatestVersion)
}

/** Check if user is the resource owner or an admin */
export const isOwnerOrAdmin = async (
  authUser: AuthUser | null,
  humId: string,
): Promise<boolean> => {
  if (!authUser) return false
  if (authUser.isAdmin) return true
  return isOwner(authUser.username, humId)
}

/** Sync variant for use in loops where ownership is pre-resolved */
export const isOwnerOrAdminSync = (
  authUser: AuthUser | null,
  ownedHumIds: Set<string>,
  humId: string,
): boolean => {
  if (!authUser) return false
  return authUser.isAdmin || ownedHumIds.has(humId)
}

/**
 * Apply value-based access control to a Research detail.
 *
 * Owner/admin sees the actual values; everyone else sees the published view
 * (status forced to "published", uids cleared, draftVersion hidden). This is
 * the single source of truth shared by the single-detail handler and the
 * batch-get handler so the two never diverge.
 */
export const sanitizeResearchDetailForUser = async (
  detail: ResearchDetail,
  authUser: AuthUser | null,
): Promise<ResearchDetail> => {
  if (await isOwnerOrAdmin(authUser, detail.humId)) {
    return detail
  }

  return {
    ...detail,
    status: "published",
    draftVersion: null,
  }
}

/**
 * Resolve which version to use based on user authorization
 *
 * - No requested version: owner/admin gets draftVersion (fallback latestVersion), others get latestVersion
 * - Explicit version: non-owner can only access up to latestVersion number
 */
export const resolveVersionForUser = async (
  authUser: AuthUser | null,
  research: { humId: string; latestVersion: string | null; draftVersion: string | null },
  requestedVersion?: string,
): Promise<string | null> => {
  if (!requestedVersion) {
    if (await isOwnerOrAdmin(authUser, research.humId)) {
      return research.draftVersion ?? research.latestVersion
    }

    return research.latestVersion
  }

  // Explicit version: non-owner can only access published versions
  if (!await isOwnerOrAdmin(authUser, research.humId)) {
    if (!research.latestVersion) return null
    const requestedNum = parseVersionNum(requestedVersion)
    const publishedNum = parseVersionNum(research.latestVersion)
    if (requestedNum > publishedNum) return null
  }

  return requestedVersion
}
