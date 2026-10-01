import { describe, expect, it } from "vitest"

import {
  icd10Code,
  icd10CodesIn,
  icd10InRange,
  icd10NamedByWho,
  icd10Parent,
  icd10Order,
  icd10Range,
  icd10Resolve,
  icd10Spans,
  icd10WhoUrl,
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

  it("expands a range that identifies a disease", () => {
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

describe("a range typed as two ends", () => {
  it("reads each end as a code is read, with or without the point", () => {
    expect(icd10Range("c34.0", "C34.9")).toEqual({ state: "range", lower: "C340", upper: "C349" })
    expect(icd10Range(" C00 ", "C80")).toEqual({ state: "range", lower: "C00", upper: "C80" })
  })

  it("is a range across letters, and a range of one code when the ends are the same", () => {
    expect(icd10Range("C00", "D48")).toEqual({ state: "range", lower: "C00", upper: "D48" })
    expect(icd10Range("C34", "C34")).toEqual({ state: "range", lower: "C34", upper: "C34" })
  })

  it("is not a range when the ends differ in length", () => {
    expect(icd10Range("C34", "C35.9")).toEqual({ state: "problem", problem: "lengths-differ" })
    expect(icd10Range("C34.0", "C35")).toEqual({ state: "problem", problem: "lengths-differ" })
  })

  it("is not a range when an end is not a three- or four-character code", () => {
    for (const [lower, upper] of [["", "C80"], ["C00", ""], ["C3", "C80"], ["C00", "肺がん"], ["K75.81", "K75.89"]]) {
      expect(icd10Range(lower ?? "", upper ?? "")).toEqual({ state: "problem", problem: "not-code" })
    }
  })

  it("is not a range when the ends are the wrong way round", () => {
    expect(icd10Range("C80", "C00")).toEqual({ state: "problem", problem: "reversed" })
    expect(icd10Range("C34.9", "C34.0")).toEqual({ state: "problem", problem: "reversed" })
  })

  it("names the codes between its ends that are as long as its ends", () => {
    const classification = ["C25", "C26", "C30", "C34", "C340", "C349", "D00"]
    const range = { lower: "C26", upper: "C34" }
    expect(classification.filter((code) => icd10InRange(code, range))).toEqual(["C26", "C30", "C34"])
  })
})

describe("codes as a disease's chip shows them", () => {
  const order = icd10Order([
    "C18", "C19", "C20", "C21", "C25", "C26", "C30", "C34",
    "C340", "C341", "C342", "C343", "C348", "C349",
  ])

  it("writes three or more consecutive codes as their two ends", () => {
    expect(icd10Spans(["C18", "C19", "C20"], order)).toEqual(["C18-C20"])
    expect(icd10Spans(["C340", "C341", "C342", "C343", "C348", "C349"], order)).toEqual(["C340-C349"])
  })

  it("leaves two consecutive codes as two", () => {
    expect(icd10Spans(["C18", "C19"], order)).toEqual(["C18", "C19"])
    // There is no C27 to C29, so C26 and C30 are consecutive.
    expect(icd10Spans(["C26", "C30"], order)).toEqual(["C26", "C30"])
  })

  it("runs over the codes the classification does not have", () => {
    expect(icd10Spans(["C25", "C26", "C30"], order)).toEqual(["C25-C30"])
  })

  it("leaves codes with one missing between them apart", () => {
    expect(icd10Spans(["C18", "C20", "C21"], order)).toEqual(["C18", "C20", "C21"])
  })

  it("runs three-character and four-character codes separately, and puts them in code order", () => {
    expect(icd10Spans(["C349", "C34", "C348", "C18", "C343"], order)).toEqual(["C18", "C34", "C343-C349"])
  })

  it("shows a code the classification does not have on its own, and each code once", () => {
    expect(icd10Spans(["X99", "C19", "C18", "C19"], order)).toEqual(["C18", "C19", "X99"])
  })

  it("shows nothing for no codes", () => {
    expect(icd10Spans([], order)).toEqual([])
  })
})

describe("a code in WHO's classification", () => {
  it("opens WHO's browser at the code, written with its point", () => {
    expect(icd10WhoUrl("C34")).toBe("https://icd.who.int/browse10/2019/en#/C34")
    expect(icd10WhoUrl("C349")).toBe("https://icd.who.int/browse10/2019/en#/C34.9")
  })

  it("is one with an English title of its own", () => {
    expect(icd10NamedByWho({ code: "C34", labelEn: "Malignant neoplasm of bronchus and lung", labelJa: "気管支及び肺の悪性新生物" })).toBe(true)
    expect(icd10NamedByWho({ code: "U07", labelEn: "Emergency use of U07", labelJa: null })).toBe(true)
  })

  it("is not one whose English column holds the Japanese title or the code", () => {
    expect(icd10NamedByWho({ code: "A90", labelEn: "デング熱［古典デング］", labelJa: "デング熱［古典デング］" })).toBe(false)
    expect(icd10NamedByWho({ code: "X99", labelEn: "X99", labelJa: null })).toBe(false)
  })
})

describe("resolving a code against the dictionary", () => {
  const known = (code: string) => ["C34", "C349", "C56", "K758", "M069", "G471"].includes(code)

  it("keeps a code the dictionary holds", () => {
    expect(icd10Resolve("C349", known)).toBe("C349")
    expect(icd10Resolve("c34.9", known)).toBe("C349")
  })

  it("drops the tail until the dictionary has a match", () => {
    // The five-character codes in the data are ICD-10-CM: `K75.81` is NASH,
    // which WHO's ICD-10 cannot write.
    expect(icd10Resolve("K75.81", known)).toBe("K758")
    expect(icd10Resolve("M0690", known)).toBe("M069")
    expect(icd10Resolve("G47.11", known)).toBe("G471")
  })

  it("falls all the way to the root when nothing between it and the code is held", () => {
    // C56 has no subdivision, so the ovarian histologies written as
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

  it("reads a code the export marks with a dagger or an asterisk as that code", () => {
    // The marks say which half of a dual-coded condition the row is, not which
    // code it is. Dropping the row would leave the code named in English only.
    const held = parseEstatCsv([
      "\"E14.2†\",\"詳細不明の糖尿病，腎合併症を伴うもの\"",
      "\"F00*\",\"アルツハイマー＜Alzheimer＞病の認知症\"",
    ].join("\n"))

    expect(held).toEqual([
      { code: "E142", titleEn: null, titleJa: "詳細不明の糖尿病，腎合併症を伴うもの" },
      { code: "F00", titleEn: null, titleJa: "アルツハイマー＜Alzheimer＞病の認知症" },
    ])
  })

  it("still leaves a block alone when it is marked, since it is not a code", () => {
    expect(parseEstatCsv("\"A00-A09*\",\"腸管感染症\"")).toEqual([])
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
