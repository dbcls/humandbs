import { describe, expect, it } from "vitest"

import {
  icd10Code,
  icd10CodesIn,
  icd10Parent,
  icd10Resolve,
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

describe("the codes an annotation names", () => {
  it("takes them however they are separated and leaves what is not a code", () => {
    expect(icd10CodesIn("C34.9, C50；E11 / dummy -")).toEqual(["C349", "C50", "E11"])
  })

  it("names each one once, in the order written", () => {
    expect(icd10CodesIn("C50 C34.9 c50")).toEqual(["C50", "C349"])
  })

  it("separates on the full-width comma the articles write", () => {
    expect(icd10CodesIn("C18.9、C20")).toEqual(["C189", "C20"])
    expect(icd10CodesIn("C480, C490, C492, C493")).toEqual(["C480", "C490", "C492", "C493"])
  })

  it("drops what a bracket holds", () => {
    // `C20 [NG80]` cites a guideline beside the code.
    expect(icd10CodesIn("C20 [NG80]")).toEqual(["C20"])
  })

  it("expands a range that names a disease", () => {
    expect(icd10CodesIn("C18-20")).toEqual(["C18", "C19", "C20"])
    expect(icd10CodesIn("C40-41")).toEqual(["C40", "C41"])
    expect(icd10CodesIn("F00-03")).toEqual(["F00", "F01", "F02", "F03"])
    expect(icd10CodesIn("F70-F79")).toEqual([])
  })

  it("drops a range wide enough to be a block heading", () => {
    // Expanding one would put a hundred codes on a single disease, and the
    // three-character codes are not consecutive, so it would also invent codes
    // the classification does not have.
    expect(icd10CodesIn("Q00-Q99")).toEqual([])
    expect(icd10CodesIn("P00-P96")).toEqual([])
  })

  it("drops a range that crosses letters or runs backwards", () => {
    expect(icd10CodesIn("C00-D48")).toEqual([])
    expect(icd10CodesIn("C20-18")).toEqual([])
  })
})

describe("resolving a code against the dictionary", () => {
  const known = (code: string) => ["C34", "C349", "C56", "K758", "M069", "G471"].includes(code)

  it("keeps a code the dictionary holds", () => {
    expect(icd10Resolve("C349", known)).toBe("C349")
    expect(icd10Resolve("c34.9", known)).toBe("C349")
  })

  it("drops the tail until the dictionary answers", () => {
    // The five-character codes in the data are ICD-10-CM: `K75.81` is NASH,
    // which WHO's ICD-10 cannot write.
    expect(icd10Resolve("K75.81", known)).toBe("K758")
    expect(icd10Resolve("M0690", known)).toBe("M069")
    expect(icd10Resolve("G47.11", known)).toBe("G471")
  })

  it("falls all the way to the root when nothing between it and the code is held", () => {
    // C56 carries no subdivision, so the ovarian histologies written as
    // `C56.12` and `C56.14` land on it.
    expect(icd10Resolve("C56.12", known)).toBe("C56")
  })

  it("gives nothing when even the root is unknown", () => {
    // Z15 is ICD-10-CM only, and F74 does not exist between F73 and F78.
    expect(icd10Resolve("Z15.09", known)).toBeNull()
    expect(icd10Resolve("F74", known)).toBeNull()
  })

  it("gives nothing for what is not shaped like a code", () => {
    expect(icd10Resolve("肺がん", known)).toBeNull()
    expect(icd10Resolve("", known)).toBeNull()
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
