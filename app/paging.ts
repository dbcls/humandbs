/**
 * Where a page of rows sits inside the whole result.
 *
 * **Every listing says it the same way** — "1–20 / 675 件" — so the arithmetic
 * behind that line is one function rather than one per listing. It was written
 * out six times before, and the management screens were where the copies had
 * drifted: two of them said nothing at all and one counted a whole vocabulary
 * while the rows on screen were a search within it.
 *
 * The bounds are 1-based and inclusive, and both are zero when nothing matched:
 * there is no first row to be at.
 */
export interface PageRange {
  rangeFrom: number
  rangeTo: number
}

export function pageRange(page: number, perPage: number, total: number): PageRange {
  if (total === 0) return { rangeFrom: 0, rangeTo: 0 }
  return { rangeFrom: (page - 1) * perPage + 1, rangeTo: Math.min(page * perPage, total) }
}

/**
 * The largest page an address may ask for. Nine digits is past any listing
 * the site has and far inside a safe integer, so the page answered is the page
 * asked for.
 */
export const MAX_PAGE = 999_999_999

/**
 * A page number as an address writes it: plain decimal, no leading zero, from
 * 1 to `MAX_PAGE`. Absent is the first page. **Anything else is null** — a
 * caller that must say why refuses it, and one that must not falls back to the
 * first page. `Number()` would read `0x10` as page 16 and a twenty-digit value
 * as a float the answer could not echo back.
 */
export function parsePageNumber(value: string | null): number | null {
  if (value === null) return 1
  if (!/^[1-9][0-9]{0,8}$/.test(value)) return null
  return Number(value)
}
