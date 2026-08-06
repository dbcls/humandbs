import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  localizedLinksArb,
  translatedRichTextArb,
  translatedTextArb,
} from "~/content/arbitraries/content"
import { isEmptyRichText } from "~/content/richtext"

import { LOCALES, resolveLinks, resolveRichText, resolveText } from "./locale"

const localeArb = fc.constantFrom(...LOCALES)

describe("resolveText", () => {
  it("returns one of the two languages it was given, never a mixture", () => {
    fc.assert(fc.property(translatedTextArb, localeArb, (text, locale) => {
      expect([text.ja, text.en, ""]).toContain(resolveText(text, locale).text)
    }))
  })

  it("reports untranslated exactly when the wanted language is empty and the other is not", () => {
    fc.assert(fc.property(translatedTextArb, localeArb, (text, locale) => {
      const other = locale === "ja" ? text.en : text.ja
      const expected = text[locale] === "" && other !== ""
      expect(resolveText(text, locale).untranslated).toBe(expected)
    }))
  })

  it("returns empty text only when both languages are empty", () => {
    fc.assert(fc.property(translatedTextArb, localeArb, (text, locale) => {
      const resolved = resolveText(text, locale)
      if (text.ja !== "" || text.en !== "") expect(resolved.text).not.toBe("")
    }))
  })
})

describe("resolveRichText", () => {
  it("reports untranslated exactly when the wanted language is empty and the other is not", () => {
    fc.assert(fc.property(translatedRichTextArb, localeArb, (text, locale) => {
      const other = locale === "ja" ? text.en : text.ja
      const expected = isEmptyRichText(text[locale]) && !isEmptyRichText(other)
      expect(resolveRichText(text, locale).untranslated).toBe(expected)
    }))
  })

  it("returns one of the two languages it was given, never a mixture", () => {
    fc.assert(fc.property(translatedRichTextArb, localeArb, (text, locale) => {
      const resolved = resolveRichText(text, locale).text
      expect(resolved === text.ja || resolved === text.en || resolved.length === 0).toBe(true)
    }))
  })
})

describe("resolveLinks", () => {
  it("never returns a link the wanted language does not have", () => {
    fc.assert(fc.property(localizedLinksArb, localeArb, (links, locale) => {
      expect(resolveLinks(links, locale)).toEqual(links[locale])
    }))
  })
})
