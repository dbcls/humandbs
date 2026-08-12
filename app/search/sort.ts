/**
 * The orderings a search can be asked for.
 *
 * They live apart from the query itself because three places need to agree on
 * them and one of them is `app/api/endpoints.ts`, which `routes.ts` reads while
 * the route table is being built — nothing it pulls in may touch the database.
 */

import type { SearchTarget } from "./target"

export const SORT_KEYS = ["relevance", "dateModified", "datePublished", "id"] as const

export type SortKey = typeof SORT_KEYS[number]

export function isSortKey(value: string | null): value is SortKey {
  return value !== null && (SORT_KEYS as readonly string[]).includes(value)
}

/**
 * The orderings on offer, and the one in force when nobody asked for one.
 *
 * **Only a full-text match carries a score**, so a query made of field
 * conditions alone has nothing to rank by and relevance is not among them. The
 * two listings fall back differently because a research is read by when it last
 * changed and a dataset by its identifier.
 */
export function sortOffer(ranked: boolean, target: SearchTarget): {
  offered: readonly SortKey[]
  fallback: SortKey
} {
  return {
    offered: ranked ? SORT_KEYS : SORT_KEYS.filter((key) => key !== "relevance"),
    fallback: ranked ? "relevance" : target === "research" ? "dateModified" : "id",
  }
}
