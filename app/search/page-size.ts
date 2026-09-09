/**
 * How many rows a page of a listing holds.
 *
 * Apart from the query for the same reason the orderings are (`./sort.ts`):
 * the screen offers the choice and the server answers it, so the two would
 * otherwise have to agree through a module that reaches the database.
 *
 * **The first of these is the size unless something asks for another, and it is
 * the only size the JSON API answers in** (`docs/public-api.md`). What that API
 * promises is the shape of an answer; a reader who wants everything at once has
 * the bulk address. A screen carries the choice in its address, the way it
 * carries the sort and the page.
 *
 * Three sizes rather than a number to type: what the choice is for is a page
 * tall enough to scan without paging, and the difference between 50 and 60 is
 * nobody's.
 */

export const PAGE_SIZES = [20, 50, 100] as const

export type PageSize = typeof PAGE_SIZES[number]

export const PAGE_SIZE: PageSize = PAGE_SIZES[0]

export function isPageSize(value: number): value is PageSize {
  return (PAGE_SIZES as readonly number[]).includes(value)
}
