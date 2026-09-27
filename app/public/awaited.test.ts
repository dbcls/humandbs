import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { awaitedItems } from "./awaited"

const NOTHING = {
  dataVolume: null,
  fileFormats: [],
  datePublished: null,
  dateModified: null,
  studyAccession: null,
}

const EVERYTHING = {
  dataVolume: 6627294298,
  fileFormats: ["CEL"],
  datePublished: "2023-01-10",
  dateModified: "2024-02-01",
  studyAccession: "JGAS000500",
}

describe("awaitedItems", () => {
  it("awaits all five for a JGA dataset the archive has not published", () => {
    expect(awaitedItems({ label: "JGAD000999", ...NOTHING }))
      .toEqual(["dataVolume", "fileFormats", "datePublished", "dateModified", "studyAccession"])
  })

  it("awaits no study for the archives that file datasets under none", () => {
    for (const label of ["DRA020399", "E-GEAD-1076", "MTBKS213"]) {
      expect(awaitedItems({ label, ...NOTHING })).toEqual(["dataVolume", "fileFormats", "datePublished", "dateModified"])
    }
  })

  it("awaits only the dates for a dataset the portal issued, whose size and formats come from its linked files", () => {
    expect(awaitedItems({ label: "NHA000001", ...NOTHING })).toEqual(["datePublished", "dateModified"])
    expect(awaitedItems({ label: "hum0014.v1.freq.v1", ...NOTHING })).toEqual(["datePublished", "dateModified"])
  })

  it("awaits what a dataset with no ID yet has not got, except a study", () => {
    expect(awaitedItems({ label: "", ...NOTHING })).toEqual(["dataVolume", "fileFormats", "datePublished", "dateModified"])
  })

  it("awaits nothing that is already there", () => {
    expect(awaitedItems({ label: "JGAD000626", ...EVERYTHING })).toEqual([])
  })

  it("never awaits an item that has a value, whatever the dataset", () => {
    const labels = fc.constantFrom("JGAD000001", "DRA000001", "E-GEAD-1", "MTBKS1", "NHA000001", "hum0001.v1", "")
    fc.assert(fc.property(labels, fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean(), (label, v, f, p, m, s) => {
      const view = {
        label,
        dataVolume: v ? 1 : null,
        fileFormats: f ? ["TXT"] : [],
        datePublished: p ? "2020-01-01" : null,
        dateModified: m ? "2020-01-01" : null,
        studyAccession: s ? "JGAS000001" : null,
      }
      const awaited = new Set(awaitedItems(view))
      if (v) expect(awaited.has("dataVolume")).toBe(false)
      if (f) expect(awaited.has("fileFormats")).toBe(false)
      if (p) expect(awaited.has("datePublished")).toBe(false)
      if (m) expect(awaited.has("dateModified")).toBe(false)
      if (s) expect(awaited.has("studyAccession")).toBe(false)
    }))
  })
})
