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

/** Construct a minimal experiment.properties payload exposing SPOT_LENGTH. */
const withSpotLength = (
  spotLength: string | number,
): Pick<SraExperimentDetail, "properties"> => ({
  properties: {
    EXPERIMENT_SET: {
      EXPERIMENT: {
        DESIGN: {
          SPOT_DESCRIPTOR: {
            SPOT_DECODE_SPEC: { SPOT_LENGTH: String(spotLength) },
          },
        },
      },
    },
  },
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

  it("derives readLength = SPOT_LENGTH / 2 for paired-end", () => {
    // DRX000001 (real example): SPOT_LENGTH=72, paired -> 36 bp per read.
    const r = buildSearchableFromDrx(
      baseExperiment({ libraryLayout: "PAIRED", ...withSpotLength(72) }),
    )
    expect(r.readLength).toBe(36)
  })

  it("derives readLength = SPOT_LENGTH for single-end", () => {
    const r = buildSearchableFromDrx(
      baseExperiment({ libraryLayout: "SINGLE", ...withSpotLength(150) }),
    )
    expect(r.readLength).toBe(150)
  })

  it("leaves readLength null when SPOT_LENGTH is absent", () => {
    const r = buildSearchableFromDrx(
      baseExperiment({ libraryLayout: "PAIRED" }),
    )
    expect(r.readLength).toBeNull()
  })

  it("leaves readLength null when libraryLayout is unknown even if SPOT_LENGTH is present", () => {
    const r = buildSearchableFromDrx(
      baseExperiment({ libraryLayout: "UNKNOWN", ...withSpotLength(72) }),
    )
    expect(r.readLength).toBeNull()
  })

  it("leaves readLength null when SPOT_LENGTH parses to a non-positive integer", () => {
    const r = buildSearchableFromDrx(
      baseExperiment({ libraryLayout: "PAIRED", ...withSpotLength("0") }),
    )
    expect(r.readLength).toBeNull()
  })
})
