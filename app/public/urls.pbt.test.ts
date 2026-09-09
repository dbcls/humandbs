import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { LOCALES } from "~/i18n/locale"

import {
  href,
  legacyTarget,
  normalizeQuery,
  parseVersionSegment,
  readLocale,
  researchPath,
  researchVersionPath,
} from "./urls"

const locale = fc.constantFrom(...LOCALES)

/**
 * An internal path: what `href` prefixes and `readLocale` gives back.
 *
 * **It cannot end in `.data`.** That suffix is what a client navigation appends
 * to the address it asks for, and `readLocale` takes one off so that a loader
 * reading the request's own URL sees the address rather than the request. An
 * address that ends in it would come back one suffix shorter; none does, and a
 * document slug that did could not be reached by a link either.
 */
const internalPath = fc
  .array(
    fc.string({ minLength: 1 }).filter(
      (s) => !s.includes("/") && !LOCALES.includes(s as never) && !s.endsWith(".data"),
    ),
    { minLength: 1, maxLength: 4 },
  )
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

  /**
   * A link is followed by asking for the same address with `.data` on the end,
   * and what reaches a loader keeps it. **Reading a page through a link and
   * reading it by opening its address have to give the same answer** — the
   * front page came back in Japanese after pressing EN because `/en.data` has
   * no segment left that spells a locale.
   */
  it("is the same one a client navigation asks for", () => {
    fc.assert(fc.property(locale, internalPath, (wanted, path) => {
      const read = readLocale(`${href(wanted, path)}.data`)
      expect(read.locale).toBe(wanted)
      expect(read.path).toBe(path)
    }))
  })

  it("is read the same way from the front page of a language", () => {
    fc.assert(fc.property(locale, (wanted) => {
      const address = href(wanted, "/")
      expect(readLocale(address)).toEqual(readLocale(`${address}.data`))
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

/**
 * The characters a browser leaves in a query although they can be encoded, and
 * which the page is handed encoded when it is drawn on the server.
 */
const LOOSE = [",", ":", ";", "@", "$", "|", "(", ")", "!", "*", "'"]

/** The keys the site's own addresses use. */
const KEYS = ["q", "sort", "page", "facet", "find", "ids"] as const

/**
 * A value as it can arrive in an address. **`fc.string()` alone never produces
 * one of the loose characters**, which is the whole of what this is about, so
 * the alphabet is given.
 */
const queryValue = fc.oneof(
  fc.string({ unit: "grapheme" }),
  fc
    .array(fc.constantFrom(...LOOSE, " ", "+", "&", "=", "%", "a", "1", "あ"), {
      minLength: 1,
      maxLength: 8,
    })
    .map((characters) => characters.join("")),
)

const queryPairs = fc.array(fc.tuple(fc.constantFrom(...KEYS), queryValue), { maxLength: 4 })

/** The spelling a browser keeps: encoded, then the loose characters put back. */
function looseSpelling(pairs: [string, string][]): string {
  const written = pairs.map(([key, value]) => `${asLoose(key)}=${asLoose(value)}`).join("&")
  return written === "" ? "" : `?${written}`
}

function asLoose(text: string): string {
  return LOOSE.reduce(
    (written, character) => written.replaceAll(encodeURIComponent(character), character),
    encodeURIComponent(text),
  )
}

/** The spelling the page is handed when it is drawn on the server. */
function strictSpelling(pairs: [string, string][]): string {
  const written = new URLSearchParams(pairs).toString()
  return written === "" ? "" : `?${written}`
}

describe("the query of the address being read", () => {
  it("comes out the same whichever of the two spellings it arrived in", () => {
    fc.assert(fc.property(queryPairs, (pairs) => {
      expect(normalizeQuery(looseSpelling(pairs))).toBe(normalizeQuery(strictSpelling(pairs)))
    }))
  })

  it("carries the same pairs it was given", () => {
    fc.assert(fc.property(queryPairs, (pairs) => {
      expect([...new URLSearchParams(normalizeQuery(looseSpelling(pairs)))]).toEqual(pairs)
    }))
  })

  it("is already written when it is read a second time", () => {
    fc.assert(fc.property(queryPairs, (pairs) => {
      const once = normalizeQuery(looseSpelling(pairs))
      expect(normalizeQuery(once)).toBe(once)
    }))
  })
})
