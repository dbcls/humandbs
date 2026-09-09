import { describe, expect, it } from "vitest"

import { diseasesIn, mentionsIn } from "./diseases"

describe("the diseases a line names", () => {
  it("takes the name written in front of the code", () => {
    expect(mentionsIn("肝硬変(ICD10: K746): 1症例(10検体)")).toEqual([
      { codes: ["K746"], name: "肝硬変" },
    ])
  })

  it("gives each disease of a line its own name, not the ones before it", () => {
    const held = mentionsIn("疾患群: 胆道がん(ICD10: C221)、乳がん(ICD10: C50)、大腸がん(ICD10: C18-20)")
    expect(held).toEqual([
      { codes: ["C221"], name: "胆道がん" },
      { codes: ["C50"], name: "乳がん" },
      { codes: ["C18", "C19", "C20"], name: "大腸がん" },
    ])
  })

  it("reads the three spellings of the annotation", () => {
    for (const written of ["(ICD10: C50)", "(ICD-10: C50)", "(ICD 10：C50)", "（ICD10:C50）"]) {
      expect(mentionsIn(`乳がん${written}`)[0]?.codes).toEqual(["C50"])
    }
  })

  it("drops what stands in front of the name but is not part of it", () => {
    expect(mentionsIn("【JGAS000009】神経筋変性疾患(ICD10: G12)")[0]?.name).toBe("神経筋変性疾患")
    expect(mentionsIn("HNC1: 声門上がん(ICD10: C32.1)")[0]?.name).toBe("声門上がん")
    expect(mentionsIn("・大腸がん(ICD10: C18)")[0]?.name).toBe("大腸がん")
  })

  it("keeps a disease that carries no code, and one that carries no name", () => {
    expect(mentionsIn("Chorea(ICD10: )")).toEqual([{ codes: [], name: "Chorea" }])
    expect(mentionsIn("(ICD10: C50)")).toEqual([{ codes: ["C50"], name: "" }])
  })

  it("takes nothing from an annotation that only announces the codes", () => {
    // `42疾患` is a heading over the list that follows, not a disease.
    expect(mentionsIn("42疾患(ICD10 code) 不整脈(I499)、気管支喘息(J459)")).toEqual([
      { codes: ["I499"], name: "不整脈" },
      { codes: ["J459"], name: "気管支喘息" },
    ])
    expect(mentionsIn("42 disease (ICD10 code)")).toEqual([])
  })

  it("reads the codes under an announcement that stands on its own line", () => {
    const held = mentionsIn([
      "40疾患(ICD10 code)",
      "不整脈(I499)、気管支喘息(J459)、",
      "胆嚢・胆管がん(C23, C240)、",
      "対照者: 24,315名",
    ].join("\n"))
    expect(held).toEqual([
      { codes: ["I499"], name: "不整脈" },
      { codes: ["J459"], name: "気管支喘息" },
      { codes: ["C23", "C240"], name: "胆嚢・胆管がん" },
    ])
  })

  it("keeps a disease whose annotation says there is no code", () => {
    expect(mentionsIn("【JGAS000331】舞踏症(ICD10: N/A)")).toEqual([{ codes: [], name: "舞踏症" }])
  })

  it("takes nothing from a line without an annotation", () => {
    expect(mentionsIn("健常者: 7名")).toEqual([])
  })
})

describe("pairing the two languages", () => {
  it("pairs by code, whatever order the languages wrote them in", () => {
    const held = diseasesIn(
      "肝硬変(ICD10: K746)\n肝がん(ICD10: C220)",
      "Hepatocellular carcinoma (ICD10: C220)\nLiver cirrhosis (ICD10: K746)",
    )
    expect(held).toEqual([
      { codes: ["K746"], nameJa: "肝硬変", nameEn: "Liver cirrhosis" },
      { codes: ["C220"], nameJa: "肝がん", nameEn: "Hepatocellular carcinoma" },
    ])
  })

  it("keeps a disease only one language names, with the one name it has", () => {
    const held = diseasesIn("肝硬変(ICD10: K746)", "Lung cancer (ICD10: C34)")
    expect(held).toEqual([
      { codes: ["K746"], nameJa: "肝硬変", nameEn: null },
      { codes: ["C34"], nameJa: null, nameEn: "Lung cancer" },
    ])
  })

  it("makes one value of a disease an article split over lines", () => {
    // The counts differ, but they live in the free text and not here.
    const held = diseasesIn(
      "肝硬変(ICD10: K746): 1症例\n肝硬変(ICD10: K746): 9症例",
      "Liver cirrhosis (ICD10: K746): 1 case\nLiver cirrhosis (ICD10: K746): 9 cases",
    )
    expect(held).toEqual([{ codes: ["K746"], nameJa: "肝硬変", nameEn: "Liver cirrhosis" }])
  })

  it("pairs codeless diseases in the order they were written", () => {
    const held = diseasesIn("舞踏病(ICD10: -)", "Chorea (ICD10: -)")
    expect(held).toEqual([{ codes: [], nameJa: "舞踏病", nameEn: "Chorea" }])
  })
})
