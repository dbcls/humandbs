import { describe, expect, it } from "vitest"

import { isLocale, resolveLinks, resolveText } from "./locale"

describe("resolveText", () => {
  it("returns the wanted language when it has a value", () => {
    expect(resolveText({ ja: "日本語", en: "English" }, "ja"))
      .toEqual({ text: "日本語", untranslated: false })
    expect(resolveText({ ja: "日本語", en: "English" }, "en"))
      .toEqual({ text: "English", untranslated: false })
  })

  it("falls back to the other language and says so", () => {
    expect(resolveText({ ja: "日本語", en: "" }, "en"))
      .toEqual({ text: "日本語", untranslated: true })
    expect(resolveText({ ja: "", en: "English" }, "ja"))
      .toEqual({ text: "English", untranslated: true })
  })

  it("calls a pair nobody has filled in untranslated in neither language", () => {
    expect(resolveText({ ja: "", en: "" }, "ja"))
      .toEqual({ text: "", untranslated: false })
    expect(resolveText({ ja: "", en: "" }, "en"))
      .toEqual({ text: "", untranslated: false })
  })
})

describe("resolveLinks", () => {
  const ja = [{ id: "l1", url: "https://example.jp/", text: "研究室" }]

  it("returns the links of the wanted language", () => {
    expect(resolveLinks({ ja, en: [] }, "ja")).toEqual(ja)
  })

  it("returns nothing rather than the other language's destinations", () => {
    expect(resolveLinks({ ja, en: [] }, "en")).toEqual([])
  })
})

describe("isLocale", () => {
  it("accepts the two locales and nothing else", () => {
    expect(isLocale("ja")).toBe(true)
    expect(isLocale("en")).toBe(true)
    expect(isLocale("ja-JP")).toBe(false)
    expect(isLocale("")).toBe(false)
    expect(isLocale(null)).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})
