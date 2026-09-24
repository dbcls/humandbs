import { describe, expect, it } from "vitest"

import { countryName } from "./country"

describe("countryName", () => {
  it.each([
    ["Japan", "Tokyo", "日本", "Japan"],
    ["USA", "MA", "アメリカ合衆国 (マサチューセッツ州)", "Massachusetts, United States"],
    ["USA", "California", "アメリカ合衆国 (カリフォルニア州)", "California, United States"],
    ["USA", "WISCONSIN", "アメリカ合衆国 (ウィスコンシン州)", "Wisconsin, United States"],
    ["USA", "ne", "アメリカ合衆国 (ネブラスカ州)", "Nebraska, United States"],
    ["USA", "Washington D.C.", "アメリカ合衆国 (コロンビア特別区)", "District of Columbia, United States"],
    ["USA", "DC", "アメリカ合衆国 (コロンビア特別区)", "District of Columbia, United States"],
    ["Canada", "Québec", "カナダ (ケベック州)", "Quebec, Canada"],
    ["Canada", "QC", "カナダ (ケベック州)", "Quebec, Canada"],
    ["Canada", "BC", "カナダ (ブリティッシュコロンビア州)", "British Columbia, Canada"],
    ["Australia", "VIC", "オーストラリア (ビクトリア州)", "Victoria, Australia"],
    ["Australia", "NSW", "オーストラリア (ニューサウスウェールズ州)", "New South Wales, Australia"],
    ["Korea", "Seoul", "韓国", "South Korea"],
    ["South Korea", "", "韓国", "South Korea"],
    ["HKG", "Hong Kong", "香港", "Hong Kong"],
    ["Hong Kong", "Choose One...", "香港", "Hong Kong"],
    ["Viet Nam", "Linh Trung Ward, Thu Duc City", "ベトナム", "Vietnam"],
    ["Turkey", "Kutahya", "トルコ", "Türkiye"],
    ["United Kingdom", "US and Canada only", "イギリス", "United Kingdom"],
  ])("names %s / %s as %s and %s", (country, region, ja, en) => {
    expect(countryName(country, region)).toEqual({ ja, en })
  })

  it("reads a two-letter state against the country it sits in", () => {
    expect(countryName("USA", "WA").en).toBe("Washington, United States")
    expect(countryName("Australia", "WA").en).toBe("Western Australia, Australia")
  })

  it("keeps Washington a state rather than the district", () => {
    expect(countryName("USA", "Washington").en).toBe("Washington, United States")
  })

  it("strips the words wrapped around a state's name", () => {
    expect(countryName("USA", "State of New York").en).toBe("New York, United States")
    expect(countryName("Canada", "Ontario Province").en).toBe("Ontario, Canada")
  })

  it.each(["State", "Default", "Choose One...", "--- Select a state ---", "-", "n/a"])(
    "drops a placeholder state line %j and keeps the country",
    (region) => {
      expect(countryName("USA", region)).toEqual({ ja: "アメリカ合衆国", en: "United States" })
    },
  )

  it("drops the state of a country whose states are not listed", () => {
    expect(countryName("China", "Guangdong")).toEqual({ ja: "中国", en: "China" })
    expect(countryName("Germany", "Berlin")).toEqual({ ja: "ドイツ", en: "Germany" })
  })

  it("shows a country it does not know as upstream wrote it, in both languages", () => {
    expect(countryName("  Atlantis ", "Poseidonia")).toEqual({ ja: "Atlantis", en: "Atlantis" })
  })

  it.each(["", "   ", "N/A", "n/a"])("gives nothing for the empty country %j", (country) => {
    expect(countryName(country, "MA")).toEqual({ ja: "", en: "" })
  })
})
