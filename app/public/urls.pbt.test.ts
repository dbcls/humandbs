import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { LOCALES } from "~/i18n/locale"

import {
  href,
  legacyTarget,
  parseVersionSegment,
  readLocale,
  researchPath,
  researchVersionPath,
} from "./urls"

const locale = fc.constantFrom(...LOCALES)

/** An internal path: what `href` prefixes and `readLocale` gives back. */
const internalPath = fc
  .array(fc.string({ minLength: 1 }).filter((s) => !s.includes("/") && !LOCALES.includes(s as never)), {
    minLength: 1,
    maxLength: 4,
  })
  .map((segments) => `/${segments.join("/")}`)

const humLabel = fc.integer({ min: 1, max: 9999 })
  .map((n) => `hum${String(n).padStart(4, "0")}`)

describe("the locale in an address", () => {
  it("survives being written and read back", () => {
    fc.assert(fc.property(locale, internalPath, (wanted, path) => {
      const read = readLocale(href(wanted, path))
      expect(read.locale).toBe(wanted)
      expect(read.path).toBe(path)
    }))
  })

  it("never leaves a redundant prefix on an address the site itself writes", () => {
    fc.assert(fc.property(locale, internalPath, (wanted, path) => {
      expect(readLocale(href(wanted, path)).redundantPrefix).toBe(false)
    }))
  })
})

describe("a version address", () => {
  it("holds the number it was built from", () => {
    fc.assert(fc.property(humLabel, fc.integer({ min: 1, max: 100000 }), (label, number) => {
      const segments = researchVersionPath(label, number).split("/")
      expect(parseVersionSegment(segments[segments.length - 1] ?? "")).toBe(number)
    }))
  })
})

describe("legacy resolution", () => {
  it("sends every address it claims to a research page of the label it names", () => {
    const suffix = fc.constantFrom("", "-latest", "-latest-release", "-v3", "-v3-release")
    fc.assert(fc.property(humLabel, suffix, (label, tail) => {
      const target = legacyTarget(`/${label}${tail}`)
      expect(target).not.toBeNull()
      expect(target?.startsWith(researchPath(label))).toBe(true)
    }))
  })

  it("never claims an address that already names a page of the site", () => {
    fc.assert(fc.property(humLabel, (label) => {
      expect(legacyTarget(researchPath(label))).toBeNull()
      expect(legacyTarget(researchVersionPath(label, 2))).toBeNull()
    }))
  })
})
