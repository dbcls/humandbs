import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { fileLabelRows, type FileLabelEntry } from "./file-labels"

const RESEARCH = new Map([["hum0015", "r-15"], ["hum0197", "r-197"]])
const researchIdOf = (hum: string) => RESEARCH.get(hum)
const STORED = new Set(["hum0015/metadata.zip", "hum0197/Dictfile_BBJ.html"])
const stored = (hum: string, name: string) => STORED.has(`${hum}/${name}`)

const entry = (over: Partial<FileLabelEntry> = {}): FileLabelEntry => ({ hum: "hum0015", name: "metadata.zip", ja: "metadata", en: "metadata", ...over })

describe("fileLabelRows", () => {
  it("keys each label by the research identity and the name, without the spaces around the words", () => {
    expect(fileLabelRows([entry({ ja: " SNVアレル頻度（常染色体） ", en: "Allele frequencies of SNVs (autosomes)\n" })], researchIdOf, stored))
      .toEqual([{ researchId: "r-15", fileName: "metadata.zip", labelJa: "SNVアレル頻度（常染色体）", labelEn: "Allele frequencies of SNVs (autosomes)" }])
  })

  it("keeps a label with one language empty", () => {
    expect(fileLabelRows([entry({ ja: "", en: "List of metabolites" })], researchIdOf, stored)[0])
      .toMatchObject({ labelJa: "", labelEn: "List of metabolites" })
  })

  it("stops on a label with no words, for no research, for a file the store will not hold, or given twice", () => {
    expect(() => fileLabelRows([entry({ ja: " ", en: "" })], researchIdOf, stored)).toThrow(/no words/)
    expect(() => fileLabelRows([entry({ hum: "hum9999" })], researchIdOf, stored)).toThrow(/hum9999 is not a research/)
    expect(() => fileLabelRows([entry({ name: "gone.zip" })], researchIdOf, stored)).toThrow(/will not hold/)
    expect(() => fileLabelRows([entry(), entry({ ja: "other" })], researchIdOf, stored)).toThrow(/twice/)
  })

  it("stops on a name with a directory in it, which no prefix holds", () => {
    expect(() => fileLabelRows([entry({ name: "hum0197.v26/readme.txt" })], researchIdOf, () => true)).toThrow(/not a name/)
    expect(() => fileLabelRows([entry({ name: "" })], researchIdOf, () => true)).toThrow(/not a name/)
  })

  it("gives every entry exactly one row, in the order given, when each names a stored file once", () => {
    const names = fc.uniqueArray(fc.stringMatching(/^[a-z0-9._-]{1,12}$/), { maxLength: 8 })
    const words = fc.string({ maxLength: 10 }).filter((one) => one.trim() !== "")
    fc.assert(fc.property(names, words, (list, text) => {
      const entries = list.map((name) => ({ hum: "hum0197", name, ja: text, en: "" }))
      const rows = fileLabelRows(entries, researchIdOf, () => true)
      expect(rows.map((row) => row.fileName)).toEqual(list)
      expect(rows.every((row) => row.researchId === "r-197" && row.labelJa === text.trim())).toBe(true)
    }))
  })
})
