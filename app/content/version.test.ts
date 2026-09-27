import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { researchContentArb } from "./arbitraries/content"
import type { ResearchContent } from "./types"
import { withoutDatasets } from "./version"

/** Every dataset identity the content names: the order and what each publication names. */
function named(content: ResearchContent): string[] {
  return [
    ...content.datasetIds,
    ...content.relatedPublications.flatMap((publication) =>
      publication.datasetIds.state === "value" ? publication.datasetIds.value : []),
  ]
}

describe("withoutDatasets", () => {
  const gone = (content: ResearchContent) =>
    fc.subarray([...new Set(named(content))]).map((ids) => new Set(ids))
  const withGone = researchContentArb.chain((content) => gone(content).map((ids) => ({ content, ids })))

  it("names none of the datasets taken out, anywhere in the content", () => {
    fc.assert(fc.property(withGone, ({ content, ids }) => {
      const kept = withoutDatasets(content, (id) => !ids.has(id))
      expect(named(kept).filter((id) => ids.has(id))).toEqual([])
    }))
  })

  it("keeps every other dataset where it was, in its order", () => {
    fc.assert(fc.property(withGone, ({ content, ids }) => {
      const kept = withoutDatasets(content, (id) => !ids.has(id))
      expect(named(kept)).toEqual(named(content).filter((id) => !ids.has(id)))
    }))
  })

  it("leaves everything else as it was, the state of each publication's column and its typed IDs included", () => {
    fc.assert(fc.property(withGone, ({ content, ids }) => {
      const kept = withoutDatasets(content, (id) => !ids.has(id))
      const strip = (one: ResearchContent) => ({
        ...one,
        datasetIds: [],
        relatedPublications: one.relatedPublications.map((publication) => ({
          ...publication,
          datasetIds: publication.datasetIds.state === "value" ? { state: "value", value: [] } : publication.datasetIds,
        })),
      })
      expect(strip(kept)).toEqual(strip(content))
    }))
  })

  it("changes nothing when every dataset is kept", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      expect(withoutDatasets(content, () => true)).toEqual(content)
    }))
  })
})
