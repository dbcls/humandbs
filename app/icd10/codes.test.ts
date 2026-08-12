import { describe, expect, it } from "vitest"

import {
  icd10Code,
  icd10CodesIn,
  icd10Parent,
  mergeEntries,
  parseEstatCsv,
  parseWhoMeta,
} from "./codes"

describe("an ICD10 code", () => {
  it("is read with or without its point, in either case", () => {
    expect(icd10Code("C34.9")).toBe("C349")
    expect(icd10Code("c349")).toBe("C349")
    expect(icd10Code(" C34 ")).toBe("C34")
  })

  it("is not a chapter, a block, or anything else that shares the column", () => {
    expect(icd10Code("II")).toBeNull()
    expect(icd10Code("A00-A09")).toBeNull()
    expect(icd10Code("肺がん")).toBeNull()
    expect(icd10Code("")).toBeNull()
    expect(icd10Code("C3")).toBeNull()
    expect(icd10Code("C349999")).toBeNull()
  })

  it("hangs under the three-character code it starts with, and a root under none", () => {
    expect(icd10Parent("C349")).toBe("C34")
    expect(icd10Parent("B1819")).toBe("B18")
    expect(icd10Parent("C34")).toBeNull()
  })
})

describe("the codes a free-text field names", () => {
  it("takes them however they are separated and leaves what is not a code", () => {
    expect(icd10CodesIn("C34.9, C50；E11 / dummy -")).toEqual(["C349", "C50", "E11"])
  })

  it("names each one once, in the order written", () => {
    expect(icd10CodesIn("C50 C34.9 c50")).toEqual(["C50", "C349"])
  })
})

describe("WHO's meta distribution", () => {
  const line = (fields: string[]) => fields.join(";")
  const cholera = line([
    "4", "T", "X", "01", "A00", "A00.0", "A00.0", "A000",
    "Cholera due to Vibrio cholerae 01, biovar cholerae", "Cholera", "rest", "", "001",
  ])

  it("takes the undotted code and the full title, not the ancestors' titles", () => {
    expect(parseWhoMeta(cholera)).toEqual([
      { code: "A000", titleEn: "Cholera due to Vibrio cholerae 01, biovar cholerae", titleJa: null },
    ])
  })

  it("reads the file as it arrives, with carriage returns and a trailing newline", () => {
    expect(parseWhoMeta(`${cholera}\r\n`)).toHaveLength(1)
  })

  it("skips a line that is not a code rather than reading a shifted one", () => {
    expect(parseWhoMeta("garbage;line\nA;B;C;D;E;F;G;H;I")).toEqual([])
  })
})

describe("the Japanese statistical classification", () => {
  const csv = [
    "\"疾病、傷害及び死因の統計分類（基本分類）(ICD-10(2013年版))\"",
    "\"分類コード\",\"項目名\"",
    "\"I\",\"感染症及び寄生虫症（A00－B99）\"",
    "\"A00-A09\",\"腸管感染症（A00－A09）\"",
    "\"A00\",\"コレラ\"",
    "\"A00.0\",\"コレラ菌によるコレラ\"",
  ].join("\n")

  it("takes the codes and leaves the chapters, the blocks and its own heading", () => {
    expect(parseEstatCsv(csv)).toEqual([
      { code: "A00", titleEn: null, titleJa: "コレラ" },
      { code: "A000", titleEn: null, titleJa: "コレラ菌によるコレラ" },
    ])
  })

  it("keeps a comma inside a quoted field", () => {
    const held = parseEstatCsv("\"code\",\"name\"\n\"C34.9\",\"気管支，肺\"")
    expect(held).toEqual([{ code: "C349", titleEn: null, titleJa: "気管支，肺" }])
  })
})

describe("merging the two distributions", () => {
  const who = [{ code: "C34", titleEn: "Bronchus and lung", titleJa: null }]
  const estat = [
    { code: "C34", titleEn: null, titleJa: "気管支及び肺" },
    { code: "A085A", titleEn: null, titleJa: "伝染性下痢症" },
  ]

  it("puts the two titles of one code on one row", () => {
    expect(mergeEntries(who, estat)).toContainEqual({
      code: "C34",
      titleEn: "Bronchus and lung",
      titleJa: "気管支及び肺",
    })
  })

  it("keeps a code only one of them holds, with the title it has", () => {
    // The versions differ, so a row with one side missing is expected rather
    // than a sign that something went wrong.
    expect(mergeEntries(who, estat)).toContainEqual({
      code: "A085A",
      titleEn: null,
      titleJa: "伝染性下痢症",
    })
  })

  it("lets the first distribution name a code both of them hold", () => {
    const other = [{ code: "C34", titleEn: "Something else", titleJa: null }]
    expect(mergeEntries(who, other)[0]?.titleEn).toBe("Bronchus and lung")
  })

  it("orders by code, so that a root comes before what rolls up into it", () => {
    const held = mergeEntries([
      { code: "C349", titleEn: "a", titleJa: null },
      { code: "C34", titleEn: "b", titleJa: null },
    ])
    expect(held.map((entry) => entry.code)).toEqual(["C34", "C349"])
  })
})
