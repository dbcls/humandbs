import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { oldDates, type DatedArticle } from "./old-dates"

const page = (title: string, created: string, modified: string): DatedArticle => ({ title, catid: 10, state: 1, introtext: "", created, modified })

describe("oldDates", () => {
  it("never dates a draft's last edit before its first page", () => {
    const stamp = fc.date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2030-12-31T23:59:59Z"), noInvalidDate: true })
      .map((date) => date.toISOString().replace("T", " ").replace(/\.\d+Z$/, ".000000"))
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 1, max: 5 }), stamp, stamp), { minLength: 1 }), (pages) => {
      const written = oldDates(pages.map(([version, created, modified]) => page(`hum0001.v${String(version)}`, created, modified))).draftWritten("hum0001", 0)
      expect(written?.updated.getTime()).toBeGreaterThanOrEqual(written?.created.getTime() ?? Infinity)
    }))
  })
})
