/**
 * The orderings a search can be asked for.
 *
 * They live apart from the query itself because three places need to agree on
 * them and one of them is `app/api/endpoints.ts`, which `routes.ts` reads while
 * the route table is being built — nothing it pulls in may touch the database.
 */

export const SORT_KEYS = ["dateModified", "datePublished", "id"] as const

export type SortKey = typeof SORT_KEYS[number]

export function isSortKey(value: string | null): value is SortKey {
  return value !== null && (SORT_KEYS as readonly string[]).includes(value)
}

export const SORT_ORDERS = ["asc", "desc"] as const

export type SortOrder = typeof SORT_ORDERS[number]

export function isSortOrder(value: string | null): value is SortOrder {
  return value !== null && (SORT_ORDERS as readonly string[]).includes(value)
}

/**
 * The ordering in force when nobody asked for one.
 *
 * **Both listings open on what changed last.** A reader who arrives without a
 * question is looking for what is new, and one answer for both listings means
 * the two do not have to be learned apart.
 *
 * **Relevance is not among the orderings.** A score is only defined for a query
 * carrying a full-text term, so an ordering built on it appears and disappears
 * with the shape of the query — the offer would change under a reader who did
 * nothing but refine, and the ordering they were reading in would change with
 * it.
 */
export const DEFAULT_SORT: SortKey = "dateModified"

/**
 * Which way an ordering runs when nobody asked.
 *
 * **A date runs from the newest** — a listing opens on what changed last — and
 * **an identifier from the smallest**, which is the order the labels were
 * issued in. Turning either around is something a reader asks for, and the
 * request is carried apart from the key so that one spelling of a key does not
 * become two.
 */
export function defaultOrder(sort: SortKey): SortOrder {
  return sort === "id" ? "asc" : "desc"
}
