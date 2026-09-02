import { describe, expect, it } from "vitest"

import { byHand, counts, numbersWithUnit, readCell, withHandReadings } from "./numbers"

const volume = numbersWithUnit(["KB", "MB", "GB", "TB"], { kB: "KB" })
const variants = counts(["SNVs", "variants", "indels"])

/** The rows a cell reads into, with the state each row is in. */
function rows(text: string, read: Parameters<typeof readCell>[1]) {
  const { read: got, declined } = readCell(text, read)
  return { got, declined }
}

describe("reading a number out of a v1 cell", () => {
  it("takes the label, the number, the unit and what qualifies it apart", () => {
    expect(rows("GWAS: 平均 123 MB(zip)", volume).got).toEqual([
      { label: "GWAS", value: 123, unit: "MB", note: "平均 zip" },
    ])
  })

  it("reads a line with no label as a number and nothing else", () => {
    expect(rows("1.32 TB", volume).got).toEqual([
      { label: null, value: 1.32, unit: "TB", note: null },
    ])
  })

  /** A value carries colons of its own, and `ref` is not a label. */
  it("does not read a colon inside brackets as a label", () => {
    expect(rows("1.32 TB(bam [ref: hg19])", volume).got[0]?.label).toBeNull()
  })

  it("keeps a comma between digits, which is not a separator between readings", () => {
    expect(rows("2,443,177 SNVs", variants).got).toEqual([
      { label: null, value: 2443177, unit: "SNVs", note: null },
    ])
  })

  it("reads a kanji multiplier as the number it stands for", () => {
    expect(rows("常染色体: 約600万 SNVs (hg19)", variants).got).toEqual([
      { label: "常染色体", value: 6_000_000, unit: "SNVs", note: "約 hg19" },
    ])
  })
})

describe("a line holding more than one reading", () => {
  it("splits two labelled facts sharing a line", () => {
    expect(rows("HiSeq: 31.8 GB、NovaSeq: 28.0 GB", volume).got.map((one) => one.label))
      .toEqual(["HiSeq", "NovaSeq"])
  })

  it("keeps a total and what it is made of, because both were written", () => {
    const said = "61,608,817 variants(常染色体: 59,387,070 variants、X染色体: 2,221,747 variants)"
    expect(rows(said, variants).got.map((one) => one.value))
      .toEqual([61_608_817, 59_387_070, 2_221_747])
  })

  /** A sum is the parts, added up by whoever wrote it down. */
  it("splits a sum into the rows it is a sum of", () => {
    expect(rows("73 TB(fastq)＋49 TB(bam)", volume).got.map((one) => one.value))
      .toEqual([73, 49])
  })

  it("lends the trailing unit to the parts that were written without one", () => {
    expect(rows("2.4＋1.4 TB", volume).got).toEqual([
      { label: null, value: 2.4, unit: "TB", note: null },
      { label: null, value: 1.4, unit: "TB", note: null },
    ])
  })

  /**
   * A range is one quantity known within bounds. Either end alone is a value
   * nobody wrote, and the middle is a value nobody wrote either.
   */
  it("declines a range rather than choosing a number out of it", () => {
    expect(rows("0.9-1.3 GB", volume).declined).toEqual(["0.9-1.3 GB"])
  })
})

describe("the part of the genome a count is over", () => {
  it("is spelled the one way, however the cell wrote it", () => {
    expect(rows("X-chromosome: 147,353 SNVs", variants).got[0]?.label).toBe("X染色体")
    expect(rows("X 染色体: 147,353 SNVs", variants).got[0]?.label).toBe("X染色体")
  })

  /** v1 writes the part before the number as a label or after it in brackets. */
  it("is taken out of the brackets when that is where the cell put it", () => {
    expect(rows("10,202,908 (常染色体)", variants).got[0]).toEqual({
      label: "常染色体", value: 10_202_908, unit: null, note: null,
    })
  })
})

describe("a unit written another way", () => {
  it("is stored under the spelling the key declares", () => {
    expect(rows("34.7 kB", volume).got[0]?.unit).toBe("KB")
    expect(rows("500 mb", volume).got[0]?.unit).toBe("MB")
  })
})

describe("what somebody read by hand", () => {
  const hand = byHand([
    { sourceKey: "Coverage", line: "98.21 depth", why: "", read: [{ label: null, value: 98.21, unit: "x", note: null }] },
    { sourceKey: "Coverage", line: "Mean ± Standard deviation", why: "見出し", read: [] },
  ])
  const reader = withHandReadings("Coverage", () => null, hand)

  it("wins over the rules, because somebody looked at the line", () => {
    expect(rows("98.21 depth", reader).got).toEqual([
      { label: null, value: 98.21, unit: "x", note: null },
    ])
  })

  /**
   * A line settled as holding no number is settled. Putting it back in the
   * residue would ask the same person the same question on every run.
   */
  it("keeps a line settled as holding no number out of the residue", () => {
    expect(rows("Mean ± Standard deviation", reader)).toEqual({ got: [], declined: [] })
  })

  it("leaves a line nobody has read to the rules", () => {
    expect(rows("何も読めない", reader).declined).toEqual(["何も読めない"])
  })
})
