import { describe, expect, it } from "vitest"

import { filled } from "~/content/empty"
import type { Slot } from "~/content/types"

import { isLocale, resolveBilingual, resolveLinks, resolveRichText, resolveText } from "./locale"

const UNKNOWN: Slot<never> = { state: "unknown" }
const NOT_APPLICABLE: Slot<never> = { state: "not-applicable" }

describe("resolveText", () => {
  it("returns the wanted language when it has a value", () => {
    const pair = { ja: filled("日本語"), en: filled("English") }
    expect(resolveText(pair, "ja")).toEqual({ state: "value", value: "日本語", untranslated: false })
    expect(resolveText(pair, "en")).toEqual({ state: "value", value: "English", untranslated: false })
  })

  it("falls back to the other language and says so", () => {
    expect(resolveText({ ja: filled("日本語"), en: filled("") }, "en"))
      .toEqual({ state: "value", value: "日本語", untranslated: true })
    expect(resolveText({ ja: filled(""), en: filled("English") }, "ja"))
      .toEqual({ state: "value", value: "English", untranslated: true })
  })

  it("calls a pair nobody has filled in untranslated in neither language", () => {
    const pair = { ja: filled(""), en: filled("") }
    expect(resolveText(pair, "ja")).toEqual({ state: "value", value: "", untranslated: false })
    expect(resolveText(pair, "en")).toEqual({ state: "value", value: "", untranslated: false })
  })

  it("answers unsettled rather than filling that language from the other one", () => {
    expect(resolveText({ ja: filled("日本語"), en: UNKNOWN }, "en"))
      .toEqual({ state: "unsettled" })
  })

  it("answers not-applicable in the language it is settled in and leaves the other alone", () => {
    const pair = { ja: NOT_APPLICABLE, en: filled("English") }
    expect(resolveText(pair, "ja")).toEqual({ state: "not-applicable" })
    expect(resolveText(pair, "en")).toEqual({ state: "value", value: "English", untranslated: false })
  })
})

describe("resolveRichText", () => {
  const ja = [[{ text: "日本語" }]]
  const en = [[{ text: "English" }]]

  it("returns the wanted language when it has a value", () => {
    const pair = { ja: filled(ja), en: filled(en) }
    expect(resolveRichText(pair, "ja")).toEqual({ state: "value", value: ja, untranslated: false })
    expect(resolveRichText(pair, "en")).toEqual({ state: "value", value: en, untranslated: false })
  })

  it("falls back to the other language and says so", () => {
    expect(resolveRichText({ ja: filled(ja), en: filled([]) }, "en"))
      .toEqual({ state: "value", value: ja, untranslated: true })
  })

  it("reads lines that carry no text as nothing to fall back from", () => {
    expect(resolveRichText({ ja: filled([[]]), en: filled([[{ text: "" }]]) }, "ja"))
      .toEqual({ state: "value", value: [], untranslated: false })
  })

  it("answers unsettled rather than filling that language from the other one", () => {
    expect(resolveRichText({ ja: filled(ja), en: UNKNOWN }, "en"))
      .toEqual({ state: "unsettled" })
  })
})

describe("resolveLinks", () => {
  const ja = [{ id: "l1", url: "https://example.jp/", text: "研究室" }]

  it("returns the links of the wanted language", () => {
    expect(resolveLinks({ ja: filled(ja), en: filled([]) }, "ja")).toEqual(ja)
  })

  it("returns nothing rather than the other language's destinations", () => {
    expect(resolveLinks({ ja: filled(ja), en: filled([]) }, "en")).toEqual([])
    expect(resolveLinks({ ja: filled(ja), en: UNKNOWN }, "en")).toEqual([])
  })
})

describe("resolveBilingual", () => {
  it("shows the other language rather than nothing, and never says untranslated", () => {
    expect(resolveBilingual({ ja: "", en: "Upstream" }, "ja")).toBe("Upstream")
    expect(resolveBilingual({ ja: "上流", en: "" }, "en")).toBe("上流")
    expect(resolveBilingual({ ja: "", en: "" }, "ja")).toBe("")
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
