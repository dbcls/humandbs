import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { researchContentArb } from "~/content/arbitraries/content"
import type { ResearchContent } from "~/content/types"

import { researchListRowView, type CatalogView, type ResearchListRowView } from "./view.server"

/**
 * The listing's columns for methods, the type of data and the participants are
 * written by an admin into `listingSummary` and never derived from the
 * research's own detail fields (`summary.aims` / `summary.methods` /
 * `summary.targets` and the rest). Two research contents that agree on
 * `listingSummary` alone still have to draw the same row, however much else
 * about them differs.
 */

const NO_CATALOG: CatalogView = { keyById: new Map(), keyByCode: new Map(), termById: new Map() }

function row(content: ResearchContent): ResearchListRowView {
  return researchListRowView({
    humLabel: "hum0001",
    content,
    datasetLabels: [],
    accessTermIds: [],
    platformTermIds: [],
    datePublished: null,
    dateModified: null,
  }, "en", NO_CATALOG)
}

describe("a research's row in the listing (researchListRowView)", () => {
  it("holds methods, typeOfData and targets to listingSummary alone, whatever else the content holds", () => {
    fc.assert(fc.property(researchContentArb, researchContentArb, (base, other) => {
      const sharedListing: ResearchContent = { ...other, listingSummary: base.listingSummary }

      const fromBase = row(base)
      const fromShared = row(sharedListing)

      expect(fromShared.methods).toEqual(fromBase.methods)
      expect(fromShared.typeOfData).toEqual(fromBase.typeOfData)
      expect(fromShared.targets).toEqual(fromBase.targets)
    }))
  })
})
