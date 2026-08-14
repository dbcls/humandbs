import { describe, expect, it } from "vitest"

import {
  datasetPath,
  href,
  legacyTarget,
  normalizeQuery,
  parseVersionSegment,
  readLocale,
  researchPath,
  researchVersionPath,
  researchVersionsPath,
} from "./urls"

describe("readLocale", () => {
  it("reads Japanese from an address with no prefix", () => {
    expect(readLocale("/research/hum0001")).toEqual({
      locale: "ja",
      path: "/research/hum0001",
      redundantPrefix: false,
    })
  })

  it("reads English from the /en prefix and strips it", () => {
    expect(readLocale("/en/research/hum0001")).toEqual({
      locale: "en",
      path: "/research/hum0001",
      redundantPrefix: false,
    })
  })

  it("marks the /ja prefix redundant so the shorter address stays the only one", () => {
    expect(readLocale("/ja/research/hum0001")).toEqual({
      locale: "ja",
      path: "/research/hum0001",
      redundantPrefix: true,
    })
  })

  it("does not read a locale from a segment that merely starts with one", () => {
    expect(readLocale("/enzyme")).toEqual({
      locale: "ja",
      path: "/enzyme",
      redundantPrefix: false,
    })
  })

  it("reads a bare hum label as a path rather than a language", () => {
    expect(readLocale("/hum0001").locale).toBe("ja")
    expect(readLocale("/hum0001").path).toBe("/hum0001")
  })

  it("treats a bare prefix as the front page of that language", () => {
    expect(readLocale("/en")).toEqual({ locale: "en", path: "/", redundantPrefix: false })
  })
})

describe("href", () => {
  it("leaves a Japanese address unprefixed", () => {
    expect(href("ja", "/research/hum0001")).toBe("/research/hum0001")
  })

  it("prefixes an English address", () => {
    expect(href("en", "/research/hum0001")).toBe("/en/research/hum0001")
  })

  it("does not leave a trailing slash on the English front page", () => {
    expect(href("en", "/")).toBe("/en")
    expect(href("ja", "/")).toBe("/")
  })
})

describe("page paths", () => {
  it("addresses a research by its hum label", () => {
    expect(researchPath("hum0001")).toBe("/research/hum0001")
  })

  it("addresses a version by the v-prefixed number, as the outside already links to it", () => {
    expect(researchVersionPath("hum0001", 12)).toBe("/research/hum0001/v12")
    expect(researchVersionsPath("hum0001")).toBe("/research/hum0001/versions")
  })

  it("escapes a dataset label so a slash in one cannot open another path", () => {
    expect(datasetPath("JGAD000009")).toBe("/dataset/JGAD000009")
    expect(datasetPath("a/b")).toBe("/dataset/a%2Fb")
  })
})

describe("parseVersionSegment", () => {
  it("reads the number out of a v-prefixed segment", () => {
    expect(parseVersionSegment("v1")).toBe(1)
    expect(parseVersionSegment("v137")).toBe(137)
  })

  it("rejects a padded number so one version keeps one address", () => {
    expect(parseVersionSegment("v01")).toBeNull()
  })

  it("rejects everything that is not a version number", () => {
    expect(parseVersionSegment("v0")).toBeNull()
    expect(parseVersionSegment("versions")).toBeNull()
    expect(parseVersionSegment("1")).toBeNull()
    expect(parseVersionSegment("v-1")).toBeNull()
    expect(parseVersionSegment("v1.5")).toBeNull()
    expect(parseVersionSegment("")).toBeNull()
  })
})

describe("legacyTarget", () => {
  it("resolves the bare hum label DDBJ Search links to", () => {
    expect(legacyTarget("/hum0001")).toBe("/research/hum0001")
  })

  it("resolves the addresses the old site published", () => {
    expect(legacyTarget("/hum0001-v2")).toBe("/research/hum0001/v2")
    expect(legacyTarget("/hum0001-latest")).toBe("/research/hum0001")
    expect(legacyTarget("/hum0001-v2-release")).toBe("/research/hum0001/versions")
    expect(legacyTarget("/hum0001-latest-release")).toBe("/research/hum0001/versions")
  })

  it("lowercases the label, because the old addresses were case insensitive", () => {
    expect(legacyTarget("/HUM0001")).toBe("/research/hum0001")
    expect(legacyTarget("/Hum0001-V2")).toBe("/research/hum0001/v2")
  })

  it("does not claim an address that is not one of these", () => {
    expect(legacyTarget("/")).toBeNull()
    expect(legacyTarget("/guidelines/data-sharing-guidelines")).toBeNull()
    expect(legacyTarget("/hum0001/v2")).toBeNull()
    expect(legacyTarget("/humbug")).toBeNull()
    expect(legacyTarget("/hum0001-v2-notrelease")).toBeNull()
  })
})

describe("normalizeQuery", () => {
  it("writes the characters a browser leaves alone the way the server is handed them", () => {
    expect(normalizeQuery("?q=a,b")).toBe("?q=a%2Cb")
    expect(normalizeQuery("?q=a:b")).toBe("?q=a%3Ab")
    expect(normalizeQuery("?q=NGS(Exome)")).toBe("?q=NGS%28Exome%29")
    expect(normalizeQuery("?q=a|b")).toBe("?q=a%7Cb")
    expect(normalizeQuery("?ids=JGAD000290,JGAD000363")).toBe("?ids=JGAD000290%2CJGAD000363")
  })

  it("leaves an address that is already written that way alone", () => {
    expect(normalizeQuery("?q=a%2Cb")).toBe("?q=a%2Cb")
    expect(normalizeQuery("?q=%E7%B3%96%E5%B0%BF%E7%97%85")).toBe("?q=%E7%B3%96%E5%B0%BF%E7%97%85")
    expect(normalizeQuery("?page=2")).toBe("?page=2")
  })

  it("does not leave a bare question mark on an address with no query", () => {
    expect(normalizeQuery("")).toBe("")
    expect(normalizeQuery("?")).toBe("")
  })

  it("keeps every pair, in the order they were written", () => {
    expect(normalizeQuery("?q=a&sort=id&page=2")).toBe("?q=a&sort=id&page=2")
  })
})
