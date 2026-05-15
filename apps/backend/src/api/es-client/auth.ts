/**
 * Authorization filters for Elasticsearch queries
 *
 * This module provides:
 * - Status-based query filters for Research resources
 * - Permission checks for document access
 * - Helper functions for filtering by parent Research visibility
 */
import type { estypes } from "@elastic/elasticsearch"

import { ConflictError, ForbiddenError, NotFoundError } from "@/api/errors"
import { esClient, ES_INDEX } from "@/api/es-client/client"
import type { AuthUser, EsResearch, ResearchStatus, StatusAction } from "@/api/types"
import { StatusTransitions } from "@/api/types"

// === Authorization Filters ===

/**
 * Build Elasticsearch filter based on user authorization level
 *
 * - public (authUser=null): `latestVersion exists AND status != "deleted"`
 * - auth (authUser!=null, !isAdmin): above OR `uids` contains userId
 * - admin: No filter (can see all)
 */
export const buildStatusFilter = (authUser: AuthUser | null): estypes.QueryDslQueryContainer | null => {
  if (authUser?.isAdmin) {
    // Admin can see everything
    return null
  }

  // Public visibility: latestVersion exists AND not deleted
  const publicFilter: estypes.QueryDslQueryContainer = {
    bool: {
      must: [{ exists: { field: "latestVersion" } }],
      must_not: [{ term: { status: "deleted" } }],
    },
  }

  if (authUser) {
    // Authenticated user: public visible OR own resources (userId in uids)
    return {
      bool: {
        should: [
          publicFilter,
          { term: { uids: authUser.userId } },
        ],
        minimum_should_match: 1,
      },
    }
  }

  // Public: latestVersion exists AND not deleted
  return publicFilter
}

/**
 * Validate that a parent Research is in a state that allows child-dataset
 * mutations (create / update / delete). Throws NotFoundError when the parent
 * is missing or logically deleted (preserves the 404 cloak for deleted
 * Research per architecture.md § deleted 状態) and a ConflictError when it
 * is not in draft (RFC 7231 § 6.5.8 — "the request could not be completed
 * due to a conflict with the current state of the target resource").
 *
 * 409 matches `loadResearchAndAuthorize.requireDraftStatus` and
 * `loadDatasetAndAuthorize.requireParentDraft` so the API surface is uniform.
 */
export function validateParentResearchForMutation(
  research: EsResearch | null,
  humId: string,
): asserts research is EsResearch {
  if (!research) {
    throw new NotFoundError(`Parent Research ${humId} not found`)
  }
  if (research.status === "deleted") {
    throw new NotFoundError(`Parent Research ${humId} not found`)
  }
  if (research.status !== "draft") {
    throw new ConflictError(
      `Cannot mutate dataset: parent Research is in '${research.status}' status, expected 'draft'`,
    )
  }
}

/**
 * Validate that the caller is allowed to request `status` in listing/search.
 * Throws ForbiddenError on violation, no-op when the request is allowed or when
 * no status was requested. Status-aware result filtering (own-resources
 * scoping for authenticated non-admins) is performed separately in the
 * search/listing layer; this function only gates entry.
 *
 * Rules (architecture.md § deleted 状態, § status フィルタの権限):
 * - undefined: no-op (default visibility applies)
 * - "published": allowed for everyone
 * - "deleted": admin only
 * - others ("draft", "review"): authenticated only
 */
export const validateRequestedStatus = (
  authUser: AuthUser | null,
  requestedStatus: ResearchStatus | undefined,
): void => {
  if (!requestedStatus) return
  if (requestedStatus === "published") return
  if (requestedStatus === "deleted") {
    if (!authUser?.isAdmin) {
      throw new ForbiddenError("Only admins can access deleted resources")
    }
    return
  }
  if (!authUser) {
    throw new ForbiddenError("Public users can only access published resources")
  }
}

/**
 * Check if user can access a specific Research based on latestVersion, status and uids
 */
export const canAccessResearchDoc = (
  authUser: AuthUser | null,
  researchDoc: Pick<EsResearch, "latestVersion" | "status" | "uids">,
): boolean => {
  if (authUser?.isAdmin) return true
  // deleted は admin 以外 (owner 含む) には 404
  if (researchDoc.status === "deleted") return false
  if (researchDoc.latestVersion !== null) return true
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
  research: EsResearch,
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
