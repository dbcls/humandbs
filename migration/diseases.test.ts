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

  it("drops what comes before the name but is not part of it", () => {
    expect(mentionsIn("【JGAS000009】神経筋変性疾患(ICD10: G12)")[0]?.name).toBe("神経筋変性疾患")
    expect(mentionsIn("HNC1: 声門上がん(ICD10: C32.1)")[0]?.name).toBe("声門上がん")
    expect(mentionsIn("・大腸がん(ICD10: C18)")[0]?.name).toBe("大腸がん")
    expect(mentionsIn("[JGAS000393] Sporadic ALS (ICD10: G12.21)")[0]?.name).toBe("Sporadic ALS")
    expect(mentionsIn("① 膵がん（ICD10：C25.9）：17症例")[0]?.name).toBe("膵がん")
    expect(mentionsIn("1. Pancreatic cancer (ICD10: C25.9): 17 cases")[0]?.name).toBe("Pancreatic cancer")
  })

  it("takes the name after the bracket a group of diseases opens", () => {
    expect(mentionsIn("疾患群：自己免疫疾患 [関節リウマチ（ICD10：M05）、バセドウ病（ICD10：E050）]").map((one) => one.name))
      .toEqual(["関節リウマチ", "バセドウ病"])
    expect(mentionsIn("【自殺者 （ICD10：X83） vs. 非自殺者】")[0]?.name).toBe("自殺者")
    expect(mentionsIn("（肝がん（ICD10：C220）を併発している患者を含む）")).toEqual([{ codes: ["C220"], name: "肝がん" }])
  })

  it("drops the word joining a disease to the one before", () => {
    expect(mentionsIn("[including liver cancer (ICD10: C220) patients]")[0]?.name).toBe("liver cancer")
    expect(mentionsIn("breast (ICD10: C50), and prostate (ICD10: C61) cancer").map((one) => one.name))
      .toEqual(["breast", "prostate"])
  })

  it("drops the count of patients, which the free text keeps", () => {
    expect(mentionsIn("1,005 pancreatic cancer patients (ICD10: C25)")[0]?.name).toBe("pancreatic cancer patients")
    expect(mentionsIn("30 + 1 high-risk neuroblastoma patients (ICD10: C749)")[0]?.name).toBe("high-risk neuroblastoma patients")
    expect(mentionsIn("CRC without liver metastasis: 16 cases (ICD10: C18)")[0]?.name).toBe("CRC without liver metastasis")
    expect(mentionsIn("運動ニューロン病（MND） 9症例（ICD10：G122）")[0]?.name).toBe("運動ニューロン病（MND）")
  })

  it("keeps a number that is part of the name", () => {
    expect(mentionsIn("18トリソミー（ICD10：Q913）")[0]?.name).toBe("18トリソミー")
    expect(mentionsIn("trisomy 18 (ICD10: Q913)")[0]?.name).toBe("trisomy 18")
    expect(mentionsIn("endometrial hyperplasia from 31 cases (ICD10: N85.0)")[0]?.name).toBe("endometrial hyperplasia from 31 cases")
  })

  it("keeps a number's thousands separator from ending the disease before it", () => {
    expect(mentionsIn("心房細動、12,503 colorectal cancer patients (ICD10: C18)")[0]?.name).toBe("colorectal cancer patients")
  })

  it("still splits at a comma that is not inside a number", () => {
    expect(mentionsIn("asthma (ICD10: J45), 3 cases, atopic dermatitis (ICD10: L20)").map((one) => one.name))
      .toEqual(["asthma", "atopic dermatitis"])
    expect(mentionsIn("Type 2,diabetes (ICD10: E11)")[0]?.name).toBe("diabetes")
  })

  it("does not split a name at what separates the parts of a bracket", () => {
    expect(mentionsIn("t(9;17)(q34;q23)転座を有するT-LBL（ICD10：C83.5）")[0]?.name).toBe("t(9;17)(q34;q23)転座を有するT-LBL")
  })

  it("drops a closing bracket at the end that closes nothing", () => {
    expect(mentionsIn("1 non-syndromic hearing loss patient) (ICD10: H90)")[0]?.name).toBe("non-syndromic hearing loss patient")
  })

  it("keeps a disease that has no code, and one that has no name", () => {
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

  it("reads the codes under an announcement that sits on its own line", () => {
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

  it("keeps a disease whose annotation states there is no code", () => {
    expect(mentionsIn("【JGAS000331】舞踏症(ICD10: N/A)")).toEqual([{ codes: [], name: "舞踏症" }])
  })

  it("reads an annotation inside the brackets of something else", () => {
    const held = mentionsIn("胎盤（細胞性栄養膜細胞 [正常、胎児発育不全（ICD10：P059）、妊娠高血圧症候群（ICD10：O149）]、栄養膜幹細胞）")
    expect(held).toEqual([
      { codes: ["P059"], name: "胎児発育不全" },
      { codes: ["O149"], name: "妊娠高血圧症候群" },
    ])
  })

  it("reads an annotation in square brackets", () => {
    expect(mentionsIn("固形がん（舌がん [ICD10：C02.9]、大腸がん [ICD10：C18.9]）：14症例")).toEqual([
      { codes: ["C029"], name: "舌がん" },
      { codes: ["C189"], name: "大腸がん" },
    ])
  })

  it("reads the codes under an annotation that names nothing but the classification", () => {
    const held = mentionsIn([
      "肉腫が疑われた小児（ICD10）：47症例",
      "横紋筋肉腫（C499）19例、Ewing肉腫（C419）8例、炎症性筋線維芽細胞性腫瘍（-）、神経芽腫（C749）各1例",
    ].join("\n"))
    expect(held).toEqual([
      { codes: ["C499"], name: "横紋筋肉腫" },
      { codes: ["C419"], name: "Ewing肉腫" },
      { codes: ["C749"], name: "神経芽腫" },
    ])
  })

  it("gives a code written without its letter the letter of the code before it", () => {
    expect(mentionsIn("MSI-H CRC (ICD10: C18, 19, 20)")[0]?.codes).toEqual(["C18", "C19", "C20"])
    expect(mentionsIn("biliary tract (ICD10: C22.1, 23-24)")[0]?.codes).toEqual(["C221", "C23", "C24"])
    expect(mentionsIn("がん患者（ICD10：C169, C18（180, 182）, C20）")[0]?.codes).toEqual(["C169", "C18", "C180", "C182", "C20"])
  })

  it("reads no code without a letter to give it", () => {
    expect(mentionsIn("Endometrial cancer (ICD10: 549)")).toEqual([{ codes: [], name: "Endometrial cancer" }])
  })

  it("stops an annotation the article never closed at the count after it", () => {
    expect(mentionsIn("ANCA-associated Vasculitis (ICD10: M318: 24 cases (24 samples)")).toEqual([
      { codes: ["M318"], name: "ANCA-associated Vasculitis" },
    ])
    expect(mentionsIn("breast (ICD10: C509, cervical (ICD10: C53)")).toEqual([
      { codes: ["C509"], name: "breast" },
      { codes: ["C53"], name: "" },
    ])
  })

  it("expands no range that names a block rather than a disease", () => {
    expect(mentionsIn("がん（ICD10：C00-C97）")).toEqual([{ codes: [], name: "がん" }])
    expect(mentionsIn("精神遅滞(ICD10: F70-F79)")).toEqual([{ codes: [], name: "精神遅滞" }])
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
    // The counts differ, but they are kept in the free text and not here.
    const held = diseasesIn(
      "肝硬変(ICD10: K746): 1症例\n肝硬変(ICD10: K746): 9症例",
      "Liver cirrhosis (ICD10: K746): 1 case\nLiver cirrhosis (ICD10: K746): 9 cases",
    )
    expect(held).toEqual([{ codes: ["K746"], nameJa: "肝硬変", nameEn: "Liver cirrhosis" }])
  })

  it("pairs the same codes written in another order", () => {
    const held = diseasesIn("筋炎（ICD10：M339、M332）", "Myositis (ICD10: M332, M339)")
    expect(held).toEqual([{ codes: ["M339", "M332"], nameJa: "筋炎", nameEn: "Myositis" }])
  })

  it("pairs codes one language wrote more exactly, and keeps the exact ones", () => {
    expect(diseasesIn("胃がん（ICD10：C161）", "Stomach adenocarcinoma (ICD10: C16)"))
      .toEqual([{ codes: ["C161"], nameJa: "胃がん", nameEn: "Stomach adenocarcinoma" }])
    expect(diseasesIn("乳がん（ICD10：C50）", "breast (ICD10: C509)"))
      .toEqual([{ codes: ["C509"], nameJa: "乳がん", nameEn: "breast" }])
  })

  it("does not pair codes of which one language has more than the other", () => {
    const held = diseasesIn("一過性骨髄増殖症（ICD10：D477）", "TAM (ICD10: D477, Q909)")
    expect(held).toEqual([
      { codes: ["D477"], nameJa: "一過性骨髄増殖症", nameEn: null },
      { codes: ["D477", "Q909"], nameJa: null, nameEn: "TAM" },
    ])
  })

  it("prefers the same codes to related ones", () => {
    const held = diseasesIn("胃がん（ICD10：C16）\n噴門がん（ICD10：C160）", "cardia cancer (ICD10: C160)\ngastric cancer (ICD10: C16)")
    expect(held).toEqual([
      { codes: ["C16"], nameJa: "胃がん", nameEn: "gastric cancer" },
      { codes: ["C160"], nameJa: "噴門がん", nameEn: "cardia cancer" },
    ])
  })

  it("pairs codeless diseases in the order they were written", () => {
    const held = diseasesIn("舞踏病(ICD10: -)", "Chorea (ICD10: -)")
    expect(held).toEqual([{ codes: [], nameJa: "舞踏病", nameEn: "Chorea" }])
  })
})
