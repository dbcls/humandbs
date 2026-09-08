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
