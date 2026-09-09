import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { pageRange } from "./paging"

/**
 * The line every listing shows. What it has to hold is that the bounds name
 * rows that exist and that the pages of a result cover it exactly once — which
 * is what a hand-written copy of this arithmetic gets wrong at the last page.
 */
const listing = fc.record({
  perPage: fc.integer({ min: 1, max: 100 }),
  total: fc.integer({ min: 1, max: 5_000 }),
}).chain(({ perPage, total }) => fc.record({
  perPage: fc.constant(perPage),
  total: fc.constant(total),
  page: fc.integer({ min: 1, max: Math.max(1, Math.ceil(total / perPage)) }),
}))

describe("一覧の範囲", () => {
  it("何も一致しなければ 0 件で、始まりも終わりも持たない", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 50 }),
      (perPage, page) => {
        expect(pageRange(page, perPage, 0)).toEqual({ rangeFrom: 0, rangeTo: 0 })
      }))
  })

  it("範囲は必ず存在する行を指す", () => {
    fc.assert(fc.property(listing, ({ page, perPage, total }) => {
      const { rangeFrom: from, rangeTo: to } = pageRange(page, perPage, total)
      expect(from).toBeGreaterThanOrEqual(1)
      expect(from).toBeLessThanOrEqual(to)
      expect(to).toBeLessThanOrEqual(total)
    }))
  })

  it("1 ページに載る行は上限を超えない", () => {
    fc.assert(fc.property(listing, ({ page, perPage, total }) => {
      const { rangeFrom: from, rangeTo: to } = pageRange(page, perPage, total)
      expect(to - from + 1).toBeLessThanOrEqual(perPage)
    }))
  })

  /** 継ぎ目が空くと読者は行を見落とし、重なると同じ行を二度読む。 */
  it("すべてのページを繋ぐと、全体を過不足なく覆う", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 40 }),
      fc.integer({ min: 1, max: 400 }),
      (perPage, total) => {
        const pageCount = Math.ceil(total / perPage)
        const covered: number[] = []
        for (let page = 1; page <= pageCount; page++) {
          const { rangeFrom: from, rangeTo: to } = pageRange(page, perPage, total)
          for (let row = from; row <= to; row++) covered.push(row)
        }
        expect(covered).toEqual(Array.from({ length: total }, (_, index) => index + 1))
      },
    ))
  })

  /** 最後のページだけが端数を持つ。 */
  it("最後のページは総数で終わる", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 40 }),
      fc.integer({ min: 1, max: 400 }),
      (perPage, total) => {
        expect(pageRange(Math.ceil(total / perPage), perPage, total).rangeTo).toBe(total)
      },
    ))
  })
})
