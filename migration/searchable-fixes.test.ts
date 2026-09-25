import { describe, expect, it } from "vitest"

import type { EsDataset } from "./es"
import { applySearchableFixes, type SearchableFix } from "./searchable-fixes"

const experiment = (header: string, assayType: string[]) => ({
  header: { ja: { text: header, rawHtml: null }, en: { text: header, rawHtml: null } },
  searchable: { assayType },
})
const doc = (version: string): EsDataset => ({
  datasetId: "JGAD000492", version, humId: "hum0201",
  experiments: [experiment("WES", ["RNA-seq"]), experiment("RNA-seq", ["ChIP-seq"])],
})

describe("applySearchableFixes", () => {
  it("replaces the reading of the experiment the fix names, in that version only", () => {
    const docs = [doc("v3"), doc("v2")]
    applySearchableFixes(docs, [{ datasetId: "JGAD000492", version: "v3", header: "WES", searchable: { assayType: ["WES"] } }])

    expect(docs[0]?.experiments?.map((one) => one.searchable?.assayType)).toEqual([["WES"], ["ChIP-seq"]])
    expect(docs[1]?.experiments?.[0]?.searchable?.assayType).toEqual(["RNA-seq"])
  })

  it("gives each experiment its own copy of the reading", () => {
    const docs = [doc("v3")]
    const fix: SearchableFix = { datasetId: "JGAD000492", version: "v3", header: "WES", searchable: { assayType: ["WES"] } }
    applySearchableFixes(docs, [fix])
    fix.searchable.assayType?.push("x")

    expect(docs[0]?.experiments?.[0]?.searchable?.assayType).toEqual(["WES"])
  })

  it("stops when a fix names an experiment that is not there", () => {
    expect(() => {
      applySearchableFixes([doc("v3")], [
        { datasetId: "JGAD000492", version: "v3", header: "ATAC-seq", searchable: {} },
      ])
    }).toThrow(/found nothing/)
  })
})
