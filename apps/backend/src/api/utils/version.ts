/**
 * Version utilities
 *
 * Provides version number parsing and version resolution logic.
 */
import { isOwner } from "@/api/services/ownership"
import type { AuthUser, ResearchDetail } from "@/api/types"
import { parseVersionFromHumVersionId, parseVersionNum } from "@/es/version"

// Version string arithmetic lives in `@/es/version` so ingest can share it.
export { isHumVersionAccessible, parseVersionFromHumVersionId, parseVersionNum } from "@/es/version"

/** Version fields that decide which ResearchVersion a write lands on. */
export interface VersionState {
  latestVersion: string | null
  draftVersion: string | null
}

/**
 * The ResearchVersion an edit writes to: the in-flight draft when one exists,
 * otherwise the published version (in-place patch). Content fields, release
 * notes, dataset links and newly created Datasets all resolve their target
 * through this, so a single edit can never scatter across two versions.
 *
 * Null only when the Research has neither a draft nor a published version,
 * which no valid state produces — callers treat it as a broken document.
 */
export const resolveEditTargetVersion = (research: VersionState): string | null =>
  research.draftVersion ?? research.latestVersion

/**
 * Next version number to mint: one past the highest ever issued, taken from
 * `versionIds` rather than its length.
 *
 * Counting instead would reuse numbers whenever `versionIds` has a gap — the
 * migration left six such Research docs. A reused number either collides with
 * the existing version (409, and the Research can never be versioned again) or,
 * when the gap sits below `latestVersion`, mints a draft that the version-number
 * comparison in `isHumVersionAccessible` reads as published.
 */
export const nextVersionNumber = (versionIds: string[]): number => {
  const issued = versionIds
    .map(parseVersionFromHumVersionId)
    .filter((v): v is string => v !== null)
    .map(parseVersionNum)

  return (issued.length > 0 ? Math.max(...issued) : 0) + 1
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
