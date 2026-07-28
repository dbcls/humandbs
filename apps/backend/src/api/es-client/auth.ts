/**
 * Authorization filters for Elasticsearch queries
 *
 * This module provides:
 * - Status-based query filters for Research resources
 * - Permission checks for document access
 * - Helper functions for filtering by parent Research visibility
 */
import type { estypes } from "@elastic/elasticsearch"

import { esClient, ES_INDEX } from "@/api/es-client/client"
import { getOwnedHumIds, isOwner } from "@/api/services/ownership"
import type { AuthUser, EsResearch, ResearchStatus, StatusAction } from "@/api/types"
import { StatusTransitions } from "@/api/types"
import { parseVersionNum } from "@/api/utils/version"

// === Authorization Filters ===

/**
 * Build Elasticsearch filter based on user authorization level
 *
 * - public (authUser=null): `latestVersion exists`
 * - auth (authUser!=null, !isAdmin): above OR `uids` contains userId
 * - admin: No filter (can see all)
 */
export const buildStatusFilter = async (authUser: AuthUser | null): Promise<estypes.QueryDslQueryContainer | null> => {
  if (authUser?.isAdmin) {
    return null
  }

  const publicFilter: estypes.QueryDslQueryContainer = {
    exists: { field: "latestVersion" },
  }

  if (authUser) {
    const ownedHumIds = await getOwnedHumIds(authUser.username)
    return {
      bool: {
        should: [
          publicFilter,
          ...(ownedHumIds.length > 0 ? [{ terms: { humId: ownedHumIds } }] : []),
        ],
        minimum_should_match: 1,
      },
    }
  }

  return publicFilter
}

/**
 * Result of `checkRequestedStatus` — pure data, no HTTP semantics.
 *
 * The route layer translates `{ allowed: false }` to `ForbiddenError`.
 * Status-aware result filtering (own-resources scoping for authenticated
 * non-admins) is performed separately in the search/listing layer; this
 * function only gates entry.
 *
 * Rules:
 * - undefined: allowed (default visibility applies)
 * - "published": allowed for everyone
 * - others ("draft", "review"): authenticated only
 */
export type RequestedStatusCheck =
  | { allowed: true }
  | { allowed: false; message: string }

export const checkRequestedStatus = (
  authUser: AuthUser | null,
  requestedStatus: ResearchStatus | undefined,
): RequestedStatusCheck => {
  if (!requestedStatus) return { allowed: true }
  if (requestedStatus === "published") return { allowed: true }
  if (!authUser) {
    return { allowed: false, message: "Public users can only access published resources" }
  }
  return { allowed: true }
}

/**
 * Check if user can access a specific Research based on latestVersion, status and uids
 */
export const canAccessResearchDoc = async (
  authUser: AuthUser | null,
  researchDoc: Pick<EsResearch, "humId" | "latestVersion" | "status">,
): Promise<boolean> => {
  if (authUser?.isAdmin) return true
  if (researchDoc.latestVersion !== null) return true
  if (authUser) return isOwner(authUser.username, researchDoc.humId)

  return false
}

/**
 * Map each Research the caller may see to its `latestVersion`, which is the
 * per-humId ceiling on Dataset visibility: draft-release Datasets sit on
 * `humVersionId > latestVersion` and must stay hidden even though their parent
 * Research is otherwise publicly visible.
 *
 * - admin: returns `null` (no filter, all Datasets visible)
 * - public/authenticated non-admin: `Map<humId, latestVersion | null>`
 *   - For N-new-hum drafts owned by the caller, `latestVersion` is `null`;
 *     `isHumVersionAccessible` will hide them from non-owner viewers via a
 *     separate ownership check upstream.
 */
export const getAccessibleHumsWithLatest = async (
  authUser: AuthUser | null,
): Promise<Map<string, string | null> | null> => {
  if (authUser?.isAdmin) return null

  const statusFilter = await buildStatusFilter(authUser)
  if (!statusFilter) return null

  // ES `_search` with `_source: ["humId", "latestVersion"]` — bounded at 10k
  // Research docs (production has ~500). No pagination needed.
  const res = await esClient.search<Pick<EsResearch, "humId" | "latestVersion">>({
    index: ES_INDEX.research,
    size: 10000,
    query: statusFilter,
    _source: ["humId", "latestVersion"],
    track_total_hits: false,
  })

  const map = new Map<string, string | null>()
  for (const hit of res.hits.hits) {
    if (!hit._source) continue
    map.set(hit._source.humId, hit._source.latestVersion ?? null)
  }
  return map
}

/**
 * Build a Dataset-side visibility filter from `humLatestMap` + `ownedHumIdSet`.
 *
 * Enumerates every accessible humVersionId as a `terms` filter so pagination
 * (`from + size`) and cardinality (`uniq_ids`) stay accurate — the previous
 * post-filter approach dropped whole collapse groups after ES had already
 * counted them, inflating `pagination.total` and thinning deep pages.
 *
 * Rules:
 * - owner humId → `terms: humId` (all versions visible, no need to enumerate)
 * - non-owner humId with `latestVersion != null` → enumerate `v1..latestVersion`
 * - non-owner humId with `latestVersion == null` (N-new-hum draft) → excluded
 *
 * Returns a `__no_match__` sentinel when nothing is accessible so the query
 * fails closed (same idiom used at search.ts around the requestedStatus branch).
 */
export const buildAccessibleVersionFilter = (
  humLatestMap: Map<string, string | null>,
  ownedHumIdSet: Set<string>,
): estypes.QueryDslQueryContainer => {
  const humVersionIds: string[] = []
  const ownedHumIds: string[] = []
  for (const [humId, latestVersion] of humLatestMap) {
    if (ownedHumIdSet.has(humId)) {
      ownedHumIds.push(humId)
      continue
    }
    if (latestVersion === null) continue
    const latestN = parseVersionNum(latestVersion)
    for (let v = 1; v <= latestN; v++) humVersionIds.push(`${humId}-v${v}`)
  }
  const should: estypes.QueryDslQueryContainer[] = []
  if (humVersionIds.length > 0) should.push({ terms: { humVersionId: humVersionIds } })
  if (ownedHumIds.length > 0) should.push({ terms: { humId: ownedHumIds } })
  if (should.length === 0) return { term: { humId: "__no_match__" } }
  return { bool: { should, minimum_should_match: 1 } }
}

/**
 * Resolve the Dataset-side visibility filter for a caller in one step.
 *
 * Every query that reads the Dataset index — search, facets, stats, and the
 * Research-search lookups that resolve humIds from Dataset matches — must carry
 * this filter, so a Dataset hidden from one endpoint is hidden from all of them.
 *
 * Returns `null` for admin (no filter, all Datasets visible). A caller with no
 * accessible Research at all gets the `__no_match__` sentinel from
 * `buildAccessibleVersionFilter`, so the query fails closed without a separate
 * empty-result branch at each call site.
 */
export const buildDatasetVisibilityFilter = async (
  authUser: AuthUser | null,
): Promise<estypes.QueryDslQueryContainer | null> => {
  const humLatestMap = await getAccessibleHumsWithLatest(authUser)
  if (humLatestMap === null) return null

  const ownedHumIdSet = new Set(authUser ? await getOwnedHumIds(authUser.username) : [])
  return buildAccessibleVersionFilter(humLatestMap, ownedHumIdSet)
}

// === Status Transition Validation ===

/**
 * Validate a status transition is allowed
 * Returns error message if invalid, null if valid
 */
export const validateStatusTransition = (
  currentStatus: string,
  action: StatusAction,
): string | null => {
  const transition = StatusTransitions[action] as { from: string; to: string } | undefined
  if (!transition) {
    return `Invalid action: ${action}`
  }
  if (currentStatus !== transition.from) {
    return `Cannot ${action}: current status is ${currentStatus}, expected ${transition.from}`
  }
  return null
}

/**
 * Check if user can perform a status transition
 */
export const canPerformTransition = async (
  authUser: AuthUser | null,
  action: StatusAction,
  research: EsResearch,
): Promise<boolean> => {
  if (!authUser) return false

  // Admin can do any transition
  if (authUser.isAdmin) return true

  // Owner can only submit
  if (action === "submit" && await isOwner(authUser.username, research.humId)) {
    return true
  }

  return false
}
