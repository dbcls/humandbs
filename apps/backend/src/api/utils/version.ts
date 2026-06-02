/**
 * Version utilities
 *
 * Provides version number parsing and version resolution logic.
 */
import type { AuthUser, ResearchDetail } from "@/api/types"

/** Parse version number from version string (e.g., "v2" -> 2) */
export const parseVersionNum = (v: string): number => {
  const match = /^v(\d+)$/.exec(v)
  if (!match) {
    throw new Error(`Invalid version format: "${v}"`)
  }

  return parseInt(match[1], 10)
}

/** Check if user is the resource owner or an admin */
export const isOwnerOrAdmin = (
  authUser: AuthUser | null,
  uids: string[],
): boolean => {
  if (!authUser) return false

  return authUser.isAdmin || uids.includes(authUser.userId)
}

/**
 * Apply value-based access control to a Research detail.
 *
 * Owner/admin sees the actual values; everyone else sees the published view
 * (status forced to "published", uids cleared, draftVersion hidden). This is
 * the single source of truth shared by the single-detail handler and the
 * batch-get handler so the two never diverge.
 */
export const sanitizeResearchDetailForUser = (
  detail: ResearchDetail,
  authUser: AuthUser | null,
): ResearchDetail => {
  if (isOwnerOrAdmin(authUser, detail.uids)) {
    return detail
  }

  return {
    ...detail,
    status: "published",
    uids: [],
    draftVersion: null,
  }
}

/**
 * Resolve which version to use based on user authorization
 *
 * - No requested version: owner/admin gets draftVersion (fallback latestVersion), others get latestVersion
 * - Explicit version: non-owner can only access up to latestVersion number
 */
export const resolveVersionForUser = (
  authUser: AuthUser | null,
  research: { latestVersion: string | null; draftVersion: string | null; uids: string[] },
  requestedVersion?: string,
): string | null => {
  if (!requestedVersion) {
    if (isOwnerOrAdmin(authUser, research.uids)) {
      return research.draftVersion ?? research.latestVersion
    }

    return research.latestVersion
  }

  // Explicit version: non-owner can only access published versions
  if (!isOwnerOrAdmin(authUser, research.uids)) {
    if (!research.latestVersion) return null
    const requestedNum = parseVersionNum(requestedVersion)
    const publishedNum = parseVersionNum(research.latestVersion)
    if (requestedNum > publishedNum) return null
  }

  return requestedVersion
}
