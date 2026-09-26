import { describe, expect, it } from "vitest"

import { affiliationOf, joinAffiliation, type StatedAffiliation } from "./affiliation"

function stated(values: Partial<StatedAffiliation>): StatedAffiliation {
  return { piLastEn: "Tanaka", divisionJa: "", institutionJa: "", divisionEn: "", institutionEn: "", ...values }
}

describe("joinAffiliation", () => {
  it.each([
    ["遺伝医学", "筑波大学", "遺伝医学, 筑波大学"],
    ["", "Kyoto University", "Kyoto University"],
    ["Graduate School of Medicine", "", "Graduate School of Medicine"],
    ["", "", ""],
    ["  Department of Urology ", " Juntendo University\n", "Department of Urology, Juntendo University"],
  ])("joins %j and %j as %j", (division, institution, joined) => {
    expect(joinAffiliation(division, institution)).toBe(joined)
  })

  it.each(["N/A", "n/a", "NA", " N/A ", "N/A,", "unknown", "missing", "(Filled by DDBJ)"])(
    "leaves out %j typed in place of the division",
    (placeholder) => {
      expect(joinAffiliation(placeholder, "Broad Institute of MIT and Harvard")).toBe("Broad Institute of MIT and Harvard")
    },
  )

  it("leaves out a placeholder typed in place of the institution", () => {
    expect(joinAffiliation("Department of Genetics", "N/A")).toBe("Department of Genetics")
  })

  it("does not double the comma a division ends with", () => {
    expect(joinAffiliation("Department of Epidemiology and Public Health, Graduate School of Medical Sciences,", "Kyushu University"))
      .toBe("Department of Epidemiology and Public Health, Graduate School of Medical Sciences, Kyushu University")
  })

  it("keeps a part that only starts like a placeholder", () => {
    expect(joinAffiliation("NAIST", "")).toBe("NAIST")
    expect(joinAffiliation("Unknown Diseases Unit", "")).toBe("Unknown Diseases Unit")
  })
})

describe("affiliationOf", () => {
  const initialJa = stated({ divisionJa: "周産期病態研究部", institutionJa: "国立成育医療研究センター" })

  it("keeps the initial application's two languages when the English is written", () => {
    const initial = stated({ divisionJa: "外科", institutionJa: "A 大学", divisionEn: "Surgery", institutionEn: "A University" })
    const other = stated({ divisionJa: "外科", institutionJa: "A 大学", divisionEn: "Dept. of Surgery", institutionEn: "A Univ." })
    expect(affiliationOf(initial, [other])).toEqual({ ja: "外科, A 大学", en: "Surgery, A University" })
  })

  it("uses the English of a submission with the same Japanese", () => {
    const moved = stated({ divisionJa: "新しい部署", institutionJa: "別の大学", divisionEn: "New Division", institutionEn: "Another University" })
    const same = stated({
      divisionJa: "周産期病態研究部",
      institutionJa: "国立成育医療研究センター",
      divisionEn: "Department of Maternal-Fetal Biology",
      institutionEn: "National Center for Child Health and Development",
    })
    expect(affiliationOf(initialJa, [moved, same])).toEqual({
      ja: "周産期病態研究部, 国立成育医療研究センター",
      en: "Department of Maternal-Fetal Biology, National Center for Child Health and Development",
    })
  })

  it("reads the Japanese as the same whatever spaces it was typed with", () => {
    const initial = stated({ divisionJa: "理工学研究科 情報科学専攻", institutionJa: "関西学院大学" })
    const other = stated({ divisionJa: "理工学研究科　情報科学専攻", institutionJa: "関西学院大学", divisionEn: "Informatics", institutionEn: "Kwansei Gakuin University" })
    expect(affiliationOf(initial, [other]).en).toBe("Informatics, Kwansei Gakuin University")
  })

  it("leaves the English empty when only a later affiliation has it", () => {
    const moved = stated({ divisionJa: "臨床統計学分野", institutionJa: "東京科学大学", divisionEn: "Clinical Biostatistics", institutionEn: "Institute of Science Tokyo" })
    expect(affiliationOf(initialJa, [moved])).toEqual({ ja: "周産期病態研究部, 国立成育医療研究センター", en: "" })
  })

  it("does not use a placeholder as an English affiliation", () => {
    const missing = stated({ divisionJa: "周産期病態研究部", institutionJa: "国立成育医療研究センター", divisionEn: "missing", institutionEn: "missing" })
    expect(affiliationOf(initialJa, [missing]).en).toBe("")
  })

  it("uses both languages of the newest submission when the initial one has neither", () => {
    const initial = stated({ piLastEn: "Kim" })
    const newest = stated({ piLastEn: "Kim", divisionEn: "Department of Molecular Biosciences", institutionEn: "University of Texas at Austin" })
    const older = stated({ piLastEn: "Kim", divisionEn: "Molecular Biosciences", institutionEn: "UT Austin" })
    expect(affiliationOf(initial, [newest, older])).toEqual({ ja: "", en: "Department of Molecular Biosciences, University of Texas at Austin" })
  })

  it("skips a newer submission that has no affiliation either", () => {
    const initial = stated({ piLastEn: "Gao" })
    const empty = stated({ piLastEn: "Gao" })
    const written = stated({ piLastEn: "Gao", institutionEn: "Cytox Ltd" })
    expect(affiliationOf(initial, [empty, written])).toEqual({ ja: "", en: "Cytox Ltd" })
  })

  it("uses nothing from a submission naming another investigator", () => {
    const successor = stated({ piLastEn: "Suzuki", divisionJa: "周産期病態研究部", institutionJa: "国立成育医療研究センター", divisionEn: "Maternal-Fetal Biology", institutionEn: "NCCHD" })
    expect(affiliationOf(initialJa, [successor]).en).toBe("")
    expect(affiliationOf(stated({}), [successor])).toEqual({ ja: "", en: "" })
  })

  it("reads the investigator's name without its case and spacing", () => {
    const other = stated({ piLastEn: " TANAKA ", divisionJa: "周産期病態研究部", institutionJa: "国立成育医療研究センター", divisionEn: "Maternal-Fetal Biology", institutionEn: "NCCHD" })
    expect(affiliationOf(initialJa, [other]).en).toBe("Maternal-Fetal Biology, NCCHD")
  })

  it("uses nothing when the initial application names no investigator in English", () => {
    const initial = stated({ piLastEn: "", divisionJa: "外科", institutionJa: "A 大学" })
    const other = stated({ piLastEn: "", divisionJa: "外科", institutionJa: "A 大学", divisionEn: "Surgery", institutionEn: "A University" })
    expect(affiliationOf(initial, [other]).en).toBe("")
  })
})
