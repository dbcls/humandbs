import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { FILE_FORMATS, sortFormats } from "./formats"
import { datasetFileSummary, formatsOfAll } from "./summary"

const LISTING = [
  { name: "hum0014.v8.ALT.zip", size: 1_000 },
  { name: "hum0014.v5.AF.v1.txt.zip", size: 250 },
  { name: "readme.html", size: 3 },
]

describe("datasetFileSummary", () => {
  it("選択したファイルの大きさはどれも 1 回ずつ足し、選択の並びと重なりに左右されない", () => {
    const names = LISTING.map((file) => file.name)
    fc.assert(fc.property(fc.array(fc.constantFrom(...names, "absent.bam")), (selection) => {
      const summary = datasetFileSummary({ label: "NHA000002", selection, listing: LISTING, archive: null })
      const expected = LISTING.filter((file) => selection.includes(file.name)).reduce((total, file) => total + file.size, 0)
      expect(summary.byteCount).toBe(expected === 0 ? null : expected)
      expect(summary).toEqual(datasetFileSummary({ label: "NHA000002", selection: selection.toReversed(), listing: LISTING, archive: null }))
    }))
  })
})

describe("formatsOfAll", () => {
  it("データセットの形式を重ねずに一覧の順に並べる", () => {
    const codes = FILE_FORMATS.map((one) => one.code)
    fc.assert(fc.property(fc.array(fc.array(fc.constantFrom(...codes))), (datasets) => {
      const all = formatsOfAll(datasets)
      expect(new Set(all)).toEqual(new Set(datasets.flat()))
      expect(all).toEqual(sortFormats(all))
      expect(new Set(all).size).toBe(all.length)
    }))
  })
})
