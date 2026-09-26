/**
 * How many rows a page of a listing holds.
 *
 * Apart from the query for the same reason the orderings are (`./sort.ts`):
 * the screen offers the choice and the server responds to it, so the two would
 * otherwise have to agree through a module that reaches the database.
 *
 * **The first of these is the size unless something requests another, and it is
 * the only size the JSON API responds in.** What that API promises is the shape
 * of an answer; a reader who wants everything at once has the bulk address. A
 * screen has the choice in its address, the way it has the sort and
 * the page.
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

/**
 * Every row on one page. **A listing offers it and a table of files does not**:
 * a listing holds a few hundred rows to a thousand or so, where a research's
 * files run to ten thousand and the whole of them is one download away (the
 * list of addresses). It is read from the address as `size=all`.
 */
export const ALL_ROWS = "all"

export type ListingSize = PageSize | typeof ALL_ROWS

export const LISTING_SIZES: readonly ListingSize[] = [...PAGE_SIZES, ALL_ROWS]

/**
 * A listing's size as its address writes it, or the first size where it
 * writes none the listing offers — an address from somewhere else is served
 * rather than refused.
 */
export function readListingSize(value: string | null): ListingSize {
  if (value === ALL_ROWS) return ALL_ROWS
  const asked = Number(value ?? "")
  return isPageSize(asked) ? asked : PAGE_SIZE
}

/** How many rows a page holds at `size`, of a result `total` rows long: all of them on one page for `ALL_ROWS`. */
export function rowsPerPage(size: ListingSize, total: number): number {
  return size === ALL_ROWS ? Math.max(total, 1) : size
}
