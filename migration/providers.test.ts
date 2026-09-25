import { describe, expect, it } from "vitest"

import type { EsResearchVersion } from "./es"
import { applyProviderSplits, type ProviderSplit } from "./providers"

const rich = (ja: string, en: string) => ({ ja: { text: ja, rawHtml: null }, en: { text: en, rawHtml: null } })
const version = (humId: string, name: string, organization: string | null): EsResearchVersion => ({
  humId,
  humVersionId: `${humId}-v1`,
  version: "v1",
  dataProvider: [{ name: rich(name, name), organization: organization === null ? null : { name: rich(organization, organization), address: null } }],
})
const person = (ja: string, en: string, organization?: { ja: string, en: string }) =>
  organization === undefined ? { name: { ja, en } } : { name: { ja, en }, organization }

describe("applyProviderSplits", () => {
  it("writes an entry out as the people it names, each with the affiliation the split gives", () => {
    const versions = [version("hum0225", "山岸 誠 / 山野 嘉久", "東京大学 / 聖マリアンナ医科大学")]
    applyProviderSplits(versions, [{
      hum: "hum0225",
      name: "山岸 誠 / 山野 嘉久",
      providers: [person("山岸 誠", "Makoto Yamagishi", { ja: "東京大学", en: "The University of Tokyo" }), person("山野 嘉久", "Yoshihisa Yamano", { ja: "聖マリアンナ医科大学", en: "St. Marianna University School of Medicine" })],
    }])

    expect(versions[0]?.dataProvider?.map((one) => [one.name?.ja?.text, one.organization?.name?.en?.text])).toEqual([
      ["山岸 誠", "The University of Tokyo"],
      ["山野 嘉久", "St. Marianna University School of Medicine"],
    ])
  })

  it("keeps the entry's affiliation for people the split gives none, in every version", () => {
    const versions = [version("hum0496", "前田 士郎／今村 美菜子", "琉球大学"), version("hum0496", "前田 士郎 / 今村 美菜子", "琉球大学大学院")]
    applyProviderSplits(versions, [{ hum: "hum0496", name: "前田 士郎/今村 美菜子", providers: [person("前田 士郎", "Shiro Maeda"), person("今村 美菜子", "Minako Imamura")] }])

    expect(versions.map((one) => one.dataProvider?.map((p) => p.organization?.name?.ja?.text))).toEqual([["琉球大学", "琉球大学"], ["琉球大学大学院", "琉球大学大学院"]])
  })

  it("leaves other entries and other research alone", () => {
    const versions = [version("hum0001", "山岸 誠 / 山野 嘉久", null), version("hum0225", "別の人", null)]
    const split: ProviderSplit = { hum: "hum0225", name: "山岸 誠 / 山野 嘉久", providers: [] }

    expect(() => {
      applyProviderSplits(versions, [split])
    }).toThrow(/found nothing/)
    expect(versions.map((one) => one.dataProvider?.[0]?.name?.ja?.text)).toEqual(["山岸 誠 / 山野 嘉久", "別の人"])
  })
})
