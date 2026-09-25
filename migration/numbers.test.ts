import { describe, expect, it } from "vitest"

import {
  bilingualOf,
  byHand,
  counts,
  labelTranslations,
  numbersWithUnit,
  readCell,
  storedNumber,
  withHandReadings,
} from "./numbers"

const volume = numbersWithUnit(["KB", "MB", "GB", "TB"], { kB: "KB" })
const variants = counts(["SNVs", "variants", "indels"])
const readLength = numbersWithUnit(["bp", "kbp"], { kb: "kbp" })
/** A count with no unit of its own — the shape `subject-count` reads with. */
const bareCount = counts()
const depth = numbersWithUnit(["x", "×", "X", "倍", "depth"], { "×": "x", "X": "x", "倍": "x", "depth": "x" })
const breadth = numbersWithUnit(["%"])

/** The rows a cell reads into, with the state each row is in. */
function rows(text: string, read: Parameters<typeof readCell>[1]) {
  const { read: got, declined } = readCell(text, read)
  return { got, declined }
}

describe("reading a number out of a v1 cell", () => {
  it("takes the label, the number, the unit and what qualifies it apart", () => {
    expect(rows("GWAS: 平均 123 MB(zip)", volume).got).toEqual([
      { label: "GWAS", value: 123, unit: "MB", high: null, note: "平均 zip" },
    ])
  })

  it("reads a line with no label as a number and nothing else", () => {
    expect(rows("1.32 TB", volume).got).toEqual([
      { label: null, value: 1.32, unit: "TB", high: null, note: null },
    ])
  })

  /** A value has colons of its own, and `ref` is not a label. */
  it("does not read a colon inside brackets as a label", () => {
    expect(rows("1.32 TB(bam [ref: hg19])", volume).got[0]?.label).toBeNull()
  })

  it("keeps a comma between digits, which is not a separator between readings", () => {
    expect(rows("2,443,177 SNVs", variants).got).toEqual([
      { label: null, value: 2443177, unit: "SNVs", high: null, note: null },
    ])
  })

  it("reads a kanji multiplier as the number it stands for", () => {
    expect(rows("常染色体: 約600万 SNVs (hg19)", variants).got).toEqual([
      { label: "常染色体", value: 6_000_000, unit: "SNVs", high: null, note: "約 hg19" },
    ])
  })

  /** `2×150bp` names one read length, not a count of two. */
  it("reads the number beside the unit rather than a factor written before it", () => {
    expect(rows("2×150bp", readLength).got.map((one) => one.value)).toEqual([150])
  })
})

describe("a line holding more than one reading", () => {
  it("splits two labelled facts sharing a line", () => {
    expect(rows("HiSeq: 31.8 GB、NovaSeq: 28.0 GB", volume).got.map((one) => one.label))
      .toEqual(["HiSeq", "NovaSeq"])
  })

  /** `100, 150` is two values, not a width — a comma enumerates, a dash spans. */
  it("splits values enumerated by a comma into two readings", () => {
    expect(rows("100, 150", bareCount).got.map((one) => one.value)).toEqual([100, 150])
  })

  it("keeps a total and what it is made of, because both were written", () => {
    const said = "61,608,817 variants(常染色体: 59,387,070 variants、X染色体: 2,221,747 variants)"
    expect(rows(said, variants).got.map((one) => one.value))
      .toEqual([61_608_817, 59_387_070, 2_221_747])
  })

  /**
   * A sum is arithmetic somebody already did, and neither addend is a value
   * anybody wrote — the line is left to a person rather than guessed at.
   */
  it("declines a bare sum rather than picking one addend or splitting it in two", () => {
    expect(rows("73 TB＋49 TB", volume)).toEqual({ got: [], declined: ["73 TB＋49 TB"] })
  })

  it("declines a sum whose parts are also bracketed rather than reading them as separate facts", () => {
    expect(rows("73 TB(fastq)＋49 TB(bam)", volume).got).toEqual([])
    expect(rows("2.4＋1.4 TB", volume).got).toEqual([])
  })

  /**
   * A width is one quantity known within bounds, read as a single value with an
   * upper end rather than declined or split into two.
   */
  it("reads a width as a value with an upper end, in the unit written once", () => {
    expect(rows("0.9-1.3 GB", volume).got).toEqual([
      { label: null, value: 0.9, unit: "GB", high: 1.3, note: null },
    ])
    expect(rows("85〜120 GB", volume).got).toEqual([
      { label: null, value: 85, unit: "GB", high: 120, note: null },
    ])
  })

  it("declines a width whose ends are not ordered low to high", () => {
    expect(rows("1.3-0.9 GB", volume)).toEqual({ got: [], declined: ["1.3-0.9 GB"] })
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
      label: "常染色体", value: 10_202_908, unit: null, high: null, note: null,
    })
  })
})

describe("a unit written another way", () => {
  it("is stored under the spelling the key declares", () => {
    expect(rows("34.7 kB", volume).got[0]?.unit).toBe("KB")
    expect(rows("500 mb", volume).got[0]?.unit).toBe("MB")
  })
})

/**
 * Coverage is two quantities, not one: a depth (`x`) and a breadth (`%`). Each
 * reads its own unit out of the same cell and declines the other's.
 */
describe("depth and breadth, read separately out of the same cell", () => {
  it("reads a depth line and declines a breadth line", () => {
    expect(rows("31.8x", depth).got).toEqual([
      { label: null, value: 31.8, unit: "x", high: null, note: null },
    ])
    expect(rows("98%", depth).declined).toEqual(["98%"])
  })

  it("reads a breadth line and declines a depth line", () => {
    expect(rows("98%", breadth).got).toEqual([
      { label: null, value: 98, unit: "%", high: null, note: null },
    ])
    expect(rows("31.8x", breadth).declined).toEqual(["31.8x"])
  })
})

describe("what somebody read by hand", () => {
  const hand = byHand([
    { sourceKey: "Coverage", line: "98.21 depth", why: "", read: [{ label: null, value: 98.21, unit: "x", high: null, note: null }] },
    { sourceKey: "Coverage", line: "Mean ± Standard deviation", why: "見出し", read: [] },
  ])
  const reader = withHandReadings("Coverage", () => null, hand)

  it("wins over the rules, because somebody looked at the line", () => {
    expect(rows("98.21 depth", reader).got).toEqual([
      { label: null, value: 98.21, unit: "x", high: null, note: null },
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

describe("sorting a v1 label or note to the side of its own language", () => {
  const NO_TABLE = labelTranslations({})

  it("puts a string with kana or kanji in ja and leaves en empty", () => {
    expect(bilingualOf("常染色体", NO_TABLE)).toEqual({ ja: "常染色体", en: "" })
    expect(bilingualOf("平均", NO_TABLE)).toEqual({ ja: "平均", en: "" })
  })

  it("puts a string with no Japanese script in en and leaves ja empty", () => {
    expect(bilingualOf("GWAS", NO_TABLE)).toEqual({ ja: "", en: "GWAS" })
    expect(bilingualOf("", NO_TABLE)).toEqual({ ja: "", en: "" })
  })

  it("takes both sides from the table when the exact string is on record", () => {
    const table = labelTranslations({ 常染色体: { ja: "常染色体", en: "Autosome" } })
    expect(bilingualOf("常染色体", table)).toEqual({ ja: "常染色体", en: "Autosome" })
  })

  it("falls back to the script rule for a string the table does not hold", () => {
    const table = labelTranslations({ 常染色体: { ja: "常染色体", en: "Autosome" } })
    expect(bilingualOf("GWAS", table)).toEqual({ ja: "", en: "GWAS" })
  })
})

describe("storedNumber", () => {
  const READ = { label: "常染色体", value: 6_000_000, unit: "SNVs", high: null, note: "約 hg19" }

  it("sorts the label and the note by script when there is no translation table", () => {
    const stored = storedNumber(READ, 6_000_000, "SNVs")
    expect(stored.label).toEqual({ ja: "常染色体", en: "" })
    expect(stored.note).toEqual({ ja: "約 hg19", en: "" })
  })

  it("takes both sides from the table when it is given one", () => {
    const table = labelTranslations({ 常染色体: { ja: "常染色体", en: "Autosome" } })
    const stored = storedNumber(READ, 6_000_000, "SNVs", null, table)
    expect(stored.label).toEqual({ ja: "常染色体", en: "Autosome" })
  })

  it("leaves the label and the note null when the line read neither", () => {
    const stored = storedNumber({ label: null, value: 1, unit: null, high: null, note: null }, 1, null)
    expect(stored.label).toBeNull()
    expect(stored.note).toBeNull()
  })
})
