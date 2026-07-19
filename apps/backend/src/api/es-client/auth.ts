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
 * Get humIds of published Research for Dataset filtering
 * Used when Dataset visibility depends on parent Research status
 */
export const getPublishedHumIds = async (authUser: AuthUser | null): Promise<string[] | null> => {
  if (authUser?.isAdmin) {
    // Admin can see all datasets
    return null
  }

  const statusFilter = await buildStatusFilter(authUser)
  if (!statusFilter) return null

  interface HumIdAggs {
    humIds: estypes.AggregationsTermsAggregateBase<{ key: string; doc_count: number }>
  }

  const res = await esClient.search<unknown, HumIdAggs>({
    index: ES_INDEX.research,
    size: 0,
    query: statusFilter,
    aggs: {
      humIds: { terms: { field: "humId", size: 10000 } },
    },
  })

  const buckets = res.aggregations?.humIds.buckets
  if (!Array.isArray(buckets)) return []
  return buckets.map(b => b.key)
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
