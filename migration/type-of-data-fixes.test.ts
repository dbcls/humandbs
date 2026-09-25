import { describe, expect, it } from "vitest"

import type { EsDataset } from "./es"
import { applyTypeOfDataFixes } from "./type-of-data-fixes"

const doc = (version: string): EsDataset => ({
  datasetId: "JGAD000770", version, humId: "hum0358",
  typeOfData: { ja: "NGS (Exome、RNA-seq)", en: "NGS (Exome, RNA-seq)" },
})

describe("applyTypeOfDataFixes", () => {
  it("writes the type of data into the version the fix names, in that language only", () => {
    const docs = [doc("v3"), doc("v2")]
    applyTypeOfDataFixes(docs, [{ datasetId: "JGAD000770", version: "v3", lang: "ja", typeOfData: "NGS（RNA-seq、scRNA-seq）" }])

    expect(docs[0]?.typeOfData).toEqual({ ja: "NGS（RNA-seq、scRNA-seq）", en: "NGS (Exome, RNA-seq)" })
    expect(docs[1]?.typeOfData?.ja).toBe("NGS (Exome、RNA-seq)")
  })

  it("fills a language v1 left empty", () => {
    const docs: EsDataset[] = [{ datasetId: "DRA000908", version: "v1", humId: "hum0003", typeOfData: { ja: "NGS", en: null } }]
    applyTypeOfDataFixes(docs, [{ datasetId: "DRA000908", version: "v1", lang: "en", typeOfData: "HLA 6-loci sequencing" }])

    expect(docs[0]?.typeOfData).toEqual({ ja: "NGS", en: "HLA 6-loci sequencing" })
  })

  it("gives a document with no type of data one", () => {
    const docs: EsDataset[] = [{ datasetId: "DRA000908", version: "v1", humId: "hum0003" }]
    applyTypeOfDataFixes(docs, [{ datasetId: "DRA000908", version: "v1", lang: "en", typeOfData: "HLA 6-loci sequencing" }])

    expect(docs[0]?.typeOfData).toEqual({ en: "HLA 6-loci sequencing" })
  })

  it("stops when a fix names a document that is not there", () => {
    expect(() => {
      applyTypeOfDataFixes([doc("v3")], [{ datasetId: "JGAD000770", version: "v9", lang: "ja", typeOfData: "x" }])
    }).toThrow(/found nothing/)
  })
})
