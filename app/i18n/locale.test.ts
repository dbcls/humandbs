import { describe, expect, it } from "vitest"

import { filled } from "~/content/empty"
import type { Slot } from "~/content/types"

import {
  isLocale,
  resolveBilingual,
  resolveLinks,
  resolveOptionalBilingual,
  resolveRichText,
  resolveText,
} from "./locale"

const UNKNOWN: Slot<never> = { state: "unknown" }
const NOT_APPLICABLE: Slot<never> = { state: "not-applicable" }

describe("resolveText", () => {
  it("returns the wanted language when it has a value", () => {
    const pair = { ja: filled("日本語"), en: filled("English") }
    expect(resolveText(pair, "ja")).toEqual({ state: "value", value: "日本語", untranslated: false })
    expect(resolveText(pair, "en")).toEqual({ state: "value", value: "English", untranslated: false })
  })

  it("falls back to the other language and reports it", () => {
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

  it("responds unsettled rather than filling that language from the other one", () => {
    expect(resolveText({ ja: filled("日本語"), en: UNKNOWN }, "en"))
      .toEqual({ state: "unsettled" })
  })

  it("responds not-applicable in the language it is settled in and leaves the other alone", () => {
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

  it("falls back to the other language and reports it", () => {
    expect(resolveRichText({ ja: filled(ja), en: filled([]) }, "en"))
      .toEqual({ state: "value", value: ja, untranslated: true })
  })

  it("reads lines that have no text as nothing to fall back from", () => {
    expect(resolveRichText({ ja: filled([[]]), en: filled([[{ text: "" }]]) }, "ja"))
      .toEqual({ state: "value", value: [], untranslated: false })
  })

  it("responds unsettled rather than filling that language from the other one", () => {
    expect(resolveRichText({ ja: filled(ja), en: UNKNOWN }, "en"))
      .toEqual({ state: "unsettled" })
  })
})

describe("resolveLinks", () => {
  const ja = [{ id: "l1", url: "https://example.jp/", text: "研究室" }]

  it("returns the links of the wanted language", () => {
    expect(resolveLinks({ ja: filled(ja), en: filled([]) }, "ja"))
      .toEqual({ state: "value", value: ja, untranslated: false })
  })

  it("returns nothing rather than the other language's destinations", () => {
    expect(resolveLinks({ ja: filled(ja), en: filled([]) }, "en"))
      .toEqual({ state: "value", value: [], untranslated: false })
  })

  it("passes the state of the wanted language through rather than emptying it", () => {
    expect(resolveLinks({ ja: filled(ja), en: UNKNOWN }, "en")).toEqual({ state: "unsettled" })
    expect(resolveLinks({ ja: filled(ja), en: NOT_APPLICABLE }, "en"))
      .toEqual({ state: "not-applicable" })
  })
})

describe("resolveBilingual", () => {
  it("shows the other language rather than nothing, and never shows untranslated", () => {
    expect(resolveBilingual({ ja: "", en: "Upstream" }, "ja")).toBe("Upstream")
    expect(resolveBilingual({ ja: "上流", en: "" }, "en")).toBe("上流")
    expect(resolveBilingual({ ja: "", en: "" }, "ja")).toBe("")
  })
})

describe("resolveOptionalBilingual", () => {
  it("returns null for a field nobody gave a label to", () => {
    expect(resolveOptionalBilingual(null, "ja")).toBeNull()
    expect(resolveOptionalBilingual(null, "en")).toBeNull()
  })

  it("returns the wanted language when it has a value", () => {
    const pair = { ja: "日本語", en: "English" }
    expect(resolveOptionalBilingual(pair, "ja")).toEqual({ text: "日本語", untranslated: false })
    expect(resolveOptionalBilingual(pair, "en")).toEqual({ text: "English", untranslated: false })
  })

  it("falls back to the other language and reports it", () => {
    expect(resolveOptionalBilingual({ ja: "日本語", en: "" }, "en"))
      .toEqual({ text: "日本語", untranslated: true })
    expect(resolveOptionalBilingual({ ja: "", en: "English" }, "ja"))
      .toEqual({ text: "English", untranslated: true })
  })

  it("treats both sides empty as no label at all, the same as null", () => {
    expect(resolveOptionalBilingual({ ja: "", en: "" }, "ja")).toBeNull()
    expect(resolveOptionalBilingual({ ja: "", en: "" }, "en")).toBeNull()
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
