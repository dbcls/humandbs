import { describe, expect, it } from "vitest"

import { catalogLabel } from "./catalog-label"

describe("catalogLabel", () => {
  it("shows labelJa in ja", () => {
    expect(catalogLabel({ labelJa: "日本語", labelEn: "English" }, "ja")).toBe("日本語")
  })

  it("shows labelEn in en", () => {
    expect(catalogLabel({ labelJa: "日本語", labelEn: "English" }, "en")).toBe("English")
  })

  it("falls back to labelEn in ja when labelJa is absent", () => {
    expect(catalogLabel({ labelJa: null, labelEn: "English" }, "ja")).toBe("English")
  })

  it("never falls back on the English side, even when labelEn is empty", () => {
    expect(catalogLabel({ labelJa: "日本語", labelEn: "" }, "en")).toBe("")
  })
})
