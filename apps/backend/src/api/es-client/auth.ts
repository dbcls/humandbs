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
import type { AuthUser, EsResearchDoc, StatusAction } from "@/api/types"
import { StatusTransitions } from "@/api/types"

// === Authorization Filters ===

/**
 * Build Elasticsearch filter based on user authorization level
 *
 * - public (authUser=null): Only `status=published`
 * - auth (authUser!=null, !isAdmin): `status=published` OR `uids` contains userId
 * - admin: No filter (can see all)
 */
export const buildStatusFilter = (authUser: AuthUser | null): estypes.QueryDslQueryContainer | null => {
  if (authUser?.isAdmin) {
    // Admin can see everything
    return null
  }

  if (authUser) {
    // Authenticated user: published OR own resources (userId in uids)
    return {
      bool: {
        should: [
          { term: { status: "published" } },
          { term: { uids: authUser.userId } },
        ],
        minimum_should_match: 1,
      },
    }
  }

  // Public: only published
  return { term: { status: "published" } }
}

/**
 * Check if user can access a specific Research based on status and uids
 */
export const canAccessResearchDoc = (
  authUser: AuthUser | null,
  researchDoc: EsResearchDoc,
): boolean => {
  if (authUser?.isAdmin) return true
  if (researchDoc.status === "published") return true
  if (authUser && researchDoc.uids.includes(authUser.userId)) return true
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

  const statusFilter = buildStatusFilter(authUser)
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
export const canPerformTransition = (
  authUser: AuthUser | null,
  action: StatusAction,
  research: EsResearchDoc,
): boolean => {
  if (!authUser) return false

  // Admin can do any transition
  if (authUser.isAdmin) return true

  // Owner can only submit
  if (action === "submit" && research.uids.includes(authUser.userId)) {
    return true
  }

  return false
}
