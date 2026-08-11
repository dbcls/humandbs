import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  localizedLinksArb,
  translatedRichTextArb,
  translatedTextArb,
} from "~/content/arbitraries/content"
import { isEmptyRichText } from "~/content/richtext"
import type { Slot } from "~/content/types"

import { LOCALES, type Locale, resolveLinks, resolveRichText, resolveText } from "./locale"

const localeArb = fc.constantFrom(...LOCALES)

function other(locale: Locale): Locale {
  return locale === "ja" ? "en" : "ja"
}

/** Written down here because the law is about it, not about the value inside. */
function isEmptyValue<T>(slot: Slot<T>, isEmpty: (value: T) => boolean): boolean {
  return slot.state === "value" && isEmpty(slot.value)
}

function isFilled<T>(slot: Slot<T>, isEmpty: (value: T) => boolean): boolean {
  return slot.state === "value" && !isEmpty(slot.value)
}

const emptyString = (value: string): boolean => value === ""

describe("resolveText", () => {
  it("returns one of the two languages it was given, never a mixture", () => {
    fc.assert(fc.property(translatedTextArb, localeArb, (text, locale) => {
      const resolved = resolveText(text, locale)
      if (resolved.state !== "value") return
      const held = [text.ja, text.en].flatMap((slot) =>
        slot.state === "value" ? [slot.value] : [])
      expect([...held, ""]).toContain(resolved.value)
    }))
  })

  it("reports untranslated exactly when one language holds a value and the other is empty", () => {
    fc.assert(fc.property(translatedTextArb, localeArb, (text, locale) => {
      const resolved = resolveText(text, locale)
      const expected = isEmptyValue(text[locale], emptyString)
        && isFilled(text[other(locale)], emptyString)
      expect(resolved.state === "value" && resolved.untranslated).toBe(expected)
    }))
  })

  it("answers not-applicable exactly when the wanted language is the one settled as such", () => {
    fc.assert(fc.property(translatedTextArb, localeArb, (text, locale) => {
      const expected = text[locale].state === "not-applicable"
      expect(resolveText(text, locale).state === "not-applicable").toBe(expected)
    }))
  })

  it("never fills an unsettled language from the other one", () => {
    fc.assert(fc.property(translatedTextArb, localeArb, (text, locale) => {
      if (text[locale].state !== "unknown") return
      expect(resolveText(text, locale)).toEqual({ state: "unsettled" })
    }))
  })
})

describe("resolveRichText", () => {
  it("returns one of the two languages it was given, never a mixture", () => {
    fc.assert(fc.property(translatedRichTextArb, localeArb, (text, locale) => {
      const resolved = resolveRichText(text, locale)
      if (resolved.state !== "value") return
      const held = [text.ja, text.en].flatMap((slot) =>
        slot.state === "value" ? [slot.value] : [])
      expect(held.includes(resolved.value) || resolved.value.length === 0).toBe(true)
    }))
  })

  it("reports untranslated exactly when one language holds a value and the other is empty", () => {
    fc.assert(fc.property(translatedRichTextArb, localeArb, (text, locale) => {
      const resolved = resolveRichText(text, locale)
      const expected = isEmptyValue(text[locale], isEmptyRichText)
        && isFilled(text[other(locale)], isEmptyRichText)
      expect(resolved.state === "value" && resolved.untranslated).toBe(expected)
    }))
  })

  it("answers not-applicable exactly when the wanted language is the one settled as such", () => {
    fc.assert(fc.property(translatedRichTextArb, localeArb, (text, locale) => {
      const expected = text[locale].state === "not-applicable"
      expect(resolveRichText(text, locale).state === "not-applicable").toBe(expected)
    }))
  })

  it("never fills an unsettled language from the other one", () => {
    fc.assert(fc.property(translatedRichTextArb, localeArb, (text, locale) => {
      if (text[locale].state !== "unknown") return
      expect(resolveRichText(text, locale)).toEqual({ state: "unsettled" })
    }))
  })
})

describe("resolveLinks", () => {
  it("never returns a link the wanted language does not have", () => {
    fc.assert(fc.property(localizedLinksArb, localeArb, (links, locale) => {
      const slot = links[locale]
      const resolved = resolveLinks(links, locale)
      expect(resolved.state === "value" ? resolved.value : []).toEqual(
        slot.state === "value" ? slot.value : [],
      )
    }))
  })

  it("carries the state of the wanted language out unchanged", () => {
    fc.assert(fc.property(localizedLinksArb, localeArb, (links, locale) => {
      const slot = links[locale]
      const resolved = resolveLinks(links, locale)
      expect(resolved.state).toBe(slot.state === "unknown" ? "unsettled" : slot.state)
    }))
  })
})
