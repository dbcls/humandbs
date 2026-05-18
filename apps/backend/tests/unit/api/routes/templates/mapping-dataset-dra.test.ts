import { describe, expect, it } from "bun:test"

import type { SraExperimentDetail } from "@/api/external/ddbj-search/entries"
import { buildSearchableFromDrx } from "@/api/routes/templates/mapping-dataset-dra"

const baseExperiment = (
  overrides: Partial<SraExperimentDetail> = {},
): SraExperimentDetail => ({
  identifier: "DRX000001",
  title: null,
  description: null,
  ...overrides,
})

describe("buildSearchableFromDrx", () => {
  it("fills assayType from libraryStrategy", () => {
    const r = buildSearchableFromDrx(
      baseExperiment({ libraryStrategy: ["WGS", "RNA-Seq"] }),
    )
    expect(r.assayType).toEqual(["WGS", "RNA-Seq"])
  })

  it("maps libraryLayout PAIRED -> 'paired-end'", () => {
    const r = buildSearchableFromDrx(
      baseExperiment({ libraryLayout: "PAIRED" }),
    )
    expect(r.readType).toBe("paired-end")
  })

  it("maps libraryLayout SINGLE -> 'single-end'", () => {
    const r = buildSearchableFromDrx(
      baseExperiment({ libraryLayout: "SINGLE" }),
    )
    expect(r.readType).toBe("single-end")
  })

  it("treats unknown libraryLayout as null", () => {
    const r = buildSearchableFromDrx(
      baseExperiment({ libraryLayout: "UNKNOWN" }),
    )
    expect(r.readType).toBeNull()
  })

  it("emits one platform per instrumentModel with shared vendor", () => {
    const r = buildSearchableFromDrx(
      baseExperiment({
        platform: "ILLUMINA",
        instrumentModel: ["Illumina Genome Analyzer II", "HiSeq 2000"],
      }),
    )
    expect(r.platforms).toEqual([
      { vendor: "ILLUMINA", model: "Illumina Genome Analyzer II" },
      { vendor: "ILLUMINA", model: "HiSeq 2000" },
    ])
  })

  it("emits a vendor-only platform when instrumentModel is empty", () => {
    const r = buildSearchableFromDrx(
      baseExperiment({ platform: "ILLUMINA", instrumentModel: [] }),
    )
    expect(r.platforms).toEqual([{ vendor: "ILLUMINA", model: null }])
  })

  it("leaves platforms empty when neither vendor nor model is present", () => {
    const r = buildSearchableFromDrx(baseExperiment({}))
    expect(r.platforms).toEqual([])
  })

  it("keeps subject / disease / tissue fields at empty defaults (no inference)", () => {
    const r = buildSearchableFromDrx(
      baseExperiment({
        libraryStrategy: ["WGS"],
        libraryLayout: "PAIRED",
        platform: "ILLUMINA",
        instrumentModel: ["HiSeq"],
      }),
    )
    expect(r.subjectCount).toBeNull()
    expect(r.subjectCountType).toBeNull()
    expect(r.healthStatus).toBeNull()
    expect(r.diseases).toEqual([])
    expect(r.tissues).toEqual([])
    expect(r.isTumor).toBeNull()
    expect(r.cellLine).toEqual([])
    expect(r.population).toEqual([])
    expect(r.sex).toBeNull()
    expect(r.ageGroup).toBeNull()
  })

  it("filters whitespace-only entries from libraryStrategy / instrumentModel", () => {
    const r = buildSearchableFromDrx(
      baseExperiment({
        libraryStrategy: ["WGS", "  ", ""],
        platform: "ILLUMINA",
        instrumentModel: ["HiSeq", "   "],
      }),
    )
    expect(r.assayType).toEqual(["WGS"])
    expect(r.platforms).toEqual([{ vendor: "ILLUMINA", model: "HiSeq" }])
  })
})
