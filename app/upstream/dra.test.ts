import { describe, expect, it } from "vitest"

import type { SraEntry } from "./ddbj-search.server"
import { experimentOf, groupByStrategy, readLengthOf } from "./dra"

function entry(fields: Partial<SraEntry> & { spotLength?: string }): SraEntry {
  const { spotLength, ...rest } = fields
  return {
    ...rest,
    properties: spotLength === undefined
      ? {}
      : {
          EXPERIMENT_SET: {
            EXPERIMENT: { DESIGN: { SPOT_DESCRIPTOR: { SPOT_DECODE_SPEC: { SPOT_LENGTH: spotLength } } } },
          },
        },
  }
}

describe("the length of one read", () => {
  it("halves the spot of a paired library, because a spot spans both reads", () => {
    expect(readLengthOf(entry({ spotLength: "300" }), "PAIRED")).toBe(150)
  })

  it("takes the spot of a single library as it stands", () => {
    expect(readLengthOf(entry({ spotLength: "150" }), "SINGLE")).toBe(150)
  })

  it("answers nothing for a layout that is neither, rather than guessing", () => {
    expect(readLengthOf(entry({ spotLength: "300" }), null)).toBeNull()
  })

  it("answers nothing when no spot length is stated", () => {
    expect(readLengthOf(entry({}), "SINGLE")).toBeNull()
  })

  it("refuses a spot of one on a paired library, which cannot be two reads", () => {
    expect(readLengthOf(entry({ spotLength: "1" }), "PAIRED")).toBeNull()
  })

  it("refuses a spot length that is not a positive number", () => {
    expect(readLengthOf(entry({ spotLength: "0" }), "SINGLE")).toBeNull()
    expect(readLengthOf(entry({ spotLength: "unknown" }), "SINGLE")).toBeNull()
  })
})

describe("reading one experiment", () => {
  it("keeps the strategy upstream spells rather than a translation of it", () => {
    const read = experimentOf(entry({ libraryStrategy: ["WXS"], libraryLayout: "PAIRED" }))

    expect(read.strategy).toBe("WXS")
  })

  it("takes no layout from a word that is neither paired nor single", () => {
    expect(experimentOf(entry({ libraryLayout: "OTHER" })).layout).toBeNull()
  })

  it("leaves the strategy empty when upstream states none", () => {
    expect(experimentOf(entry({ libraryStrategy: [] })).strategy).toBe("")
  })

  it("drops instrument models that are blank rather than carrying them", () => {
    const read = experimentOf(entry({ instrumentModel: ["Illumina HiSeq 2500", "  ", ""] }))

    expect(read.instrumentModels).toEqual(["Illumina HiSeq 2500"])
  })
})

describe("folding a submission's libraries into experiments", () => {
  const paired = (strategy: string, model: string, readLength: number | null) => ({
    strategy,
    instrumentModels: [model],
    layout: "PAIRED",
    readLength,
  })

  it("makes one experiment per strategy, not one per library", () => {
    const groups = groupByStrategy([
      paired("WGS", "Illumina HiSeq 2500", 150),
      paired("WGS", "Illumina HiSeq 2500", 150),
      paired("RNA-Seq", "Illumina NovaSeq 6000", 100),
    ])

    expect(groups.map((group) => group.strategy)).toEqual(["WGS", "RNA-Seq"])
  })

  it("keeps every instrument model of a strategy, because that key takes several", () => {
    const groups = groupByStrategy([
      paired("WGS", "Illumina HiSeq 2500", 150),
      paired("WGS", "Illumina NovaSeq 6000", 150),
    ])

    expect(groups[0]?.instrumentModels).toEqual(["Illumina HiSeq 2500", "Illumina NovaSeq 6000"])
  })

  it("drops a read length the libraries disagree about, rather than taking the first", () => {
    const groups = groupByStrategy([
      paired("WGS", "Illumina HiSeq 2500", 150),
      paired("WGS", "Illumina HiSeq 2500", 100),
    ])

    expect(groups[0]?.readLength).toBeNull()
  })

  it("keeps a value the libraries that state one agree about, ignoring the silent ones", () => {
    const groups = groupByStrategy([
      paired("WGS", "Illumina HiSeq 2500", 150),
      paired("WGS", "Illumina HiSeq 2500", null),
    ])

    expect(groups[0]?.readLength).toBe(150)
  })

  it("drops a layout the libraries disagree about", () => {
    const groups = groupByStrategy([
      { strategy: "WGS", instrumentModels: [], layout: "PAIRED", readLength: null },
      { strategy: "WGS", instrumentModels: [], layout: "SINGLE", readLength: null },
    ])

    expect(groups[0]?.layout).toBeNull()
  })

  it("makes nothing out of nothing", () => {
    expect(groupByStrategy([])).toEqual([])
  })
})
