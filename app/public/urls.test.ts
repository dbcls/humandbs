import { describe, expect, it } from "vitest"

import { DOCS_PATH } from "~/api/endpoints"

import {
  apiDocsPath,
  applicationFormUrl,
  applicationUrl,
  askedPath,
  datasetPath,
  ddbjSearchEntryUrl,
  href,
  legacyTarget,
  normalizeQuery,
  parseVersionSegment,
  readLocale,
  researchPath,
  researchVersionPath,
  researchVersionsPath,
} from "./urls"

describe("askedPath", () => {
  it("takes off the suffix a client navigation appends, and only at the end", () => {
    expect(askedPath("/preview/abc.data")).toBe("/preview/abc")
    expect(askedPath("/.data")).toBe("/")
    expect(askedPath("/research/hum0001")).toBe("/research/hum0001")
    expect(askedPath("/data-use")).toBe("/data-use")
    expect(askedPath("/dataset/a.data/b")).toBe("/dataset/a.data/b")
    expect(askedPath("/dataset/JGAD000001.database")).toBe("/dataset/JGAD000001.database")
  })

  it("takes it off once, so a path that really ends in it survives one strip", () => {
    expect(askedPath("/files/x.data.data")).toBe("/files/x.data")
  })
})

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

  /**
   * A client navigation requests `<path>.data`, and the request's own URL keeps
   * the suffix even though the router strips it before it matches. The English
   * front page is the address that hides the whole prefix behind it.
   */
  it("reads the language through the suffix a client navigation appends", () => {
    expect(readLocale("/en.data")).toEqual({ locale: "en", path: "/", redundantPrefix: false })
  })

  it("leaves that suffix out of the path it hands back", () => {
    expect(readLocale("/en/research/hum0001.data")).toEqual({
      locale: "en",
      path: "/research/hum0001",
      redundantPrefix: false,
    })
    expect(readLocale("/research/hum0001.data").path).toBe("/research/hum0001")
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

  it("points the header's API link at the address the API's own page is routed at", () => {
    expect(apiDocsPath()).toBe(`/${DOCS_PATH}`)
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

  it("sends the old site's listing of every research to the research listing", () => {
    expect(legacyTarget("/data-use/all-researches")).toBe("/research")
    expect(legacyTarget("/data-use/all-researches/")).toBe("/research")
    expect(legacyTarget("/Data-Use/All-Researches")).toBe("/research")
  })

  it("sends the old site's news listing and every one of its items to the news listing", () => {
    for (const path of [
      "/all-news",
      "/all-news2",
      "/all-news2/3362-2025-08-01-1",
      "/component/content/article/19-cat-ja/cat-whats-new/3322-2025-07-04",
      "/component/content/article/21-cat-en/cat-whats-new/2734-2024-03-08",
    ]) {
      expect(legacyTarget(path), path).toBe("/news")
    }
  })

  it("does not take an address near the news listing's for one", () => {
    expect(legacyTarget("/all-news2/a/b")).toBeNull()
    expect(legacyTarget("/all-newsletter")).toBeNull()
    expect(legacyTarget("/component/content/article/19-cat-ja/cat-other/1")).toBeNull()
    expect(legacyTarget("/component/search")).toBeNull()
  })

  it("sends a guideline's old page to the revision with the same text, whose number may differ", () => {
    const guideline = (base: string, number: number) => `/guidelines/${base}/version/${number}`
    expect(legacyTarget("/data-sharing-guidelines-v1")).toBe(guideline("data-sharing-guidelines", 1))
    expect(legacyTarget("/data-sharing-guidelines-v3")).toBe(guideline("data-sharing-guidelines", 3))
    expect(legacyTarget("/data-sharing-guidelines-v3-1")).toBe(guideline("data-sharing-guidelines", 4))
    expect(legacyTarget("/data-sharing-guidelines-v4")).toBe(guideline("data-sharing-guidelines", 5))
    expect(legacyTarget("/data-sharing-guidelines-v8")).toBe(guideline("data-sharing-guidelines", 9))
    expect(legacyTarget("/security-guidelines-for-dbcenters-v3")).toBe(guideline("security-guidelines-for-dbcenters", 3))
    expect(legacyTarget("/security-guidelines-for-dbcenters-v3-2")).toBe(guideline("security-guidelines-for-dbcenters", 4))
    expect(legacyTarget("/security-guidelines-for-dbcenters-v4")).toBe(guideline("security-guidelines-for-dbcenters", 4))
    expect(legacyTarget("/security-guidelines-for-submitters-v3")).toBe(guideline("security-guidelines-for-submitters", 3))
    expect(legacyTarget("/security-guidelines-for-users-v7")).toBe(guideline("security-guidelines-for-users", 7))
    expect(legacyTarget("/guideline-revision2")).toBe(guideline("revision", 2))
    expect(legacyTarget("/guideline-revision7")).toBe(guideline("revision", 7))
    expect(legacyTarget("/guideline-revision")).toBe(guideline("revision", 7))
    expect(legacyTarget("/guideline-revision-2")).toBe(guideline("revision", 6))
    expect(legacyTarget("/guideline-revision-3")).toBe(guideline("revision", 7))
    expect(legacyTarget("/Data-Sharing-Guidelines-V8/")).toBe(guideline("data-sharing-guidelines", 9))
  })

  it("does not invent a revision the old site did not have", () => {
    expect(legacyTarget("/data-sharing-guidelines-v9")).toBeNull()
    expect(legacyTarget("/data-sharing-guidelines-v0")).toBeNull()
    expect(legacyTarget("/data-sharing-guidelines")).toBeNull()
    expect(legacyTarget("/data-sharing-guidelines-v3-2")).toBeNull()
    expect(legacyTarget("/security-guidelines-for-users-v8")).toBeNull()
    expect(legacyTarget("/guideline-revision1")).toBeNull()
    expect(legacyTarget("/guideline-revision8")).toBeNull()
    expect(legacyTarget("/guideline-revision-4")).toBeNull()
  })

  it("leaves the old site's list of a research's files alone", () => {
    expect(legacyTarget("/hum0197-v18-microbiome")).toBeNull()
    expect(legacyTarget("/hum0181-v1-st1")).toBeNull()
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

describe("applicationUrl", () => {
  it("asks the application system for English on an English page and for nothing on a Japanese one", () => {
    expect(applicationUrl("en")).toBe("https://humandbs.ddbj.nig.ac.jp/nbdc/application/?lang=en")
    expect(applicationUrl("ja")).toBe("https://humandbs.ddbj.nig.ac.jp/nbdc/application/")
  })
})

describe("applicationFormUrl", () => {
  it("asks the form a cart hands its datasets to for English on an English page, as the system's front does", () => {
    expect(applicationFormUrl("en")).toBe("https://humandbs.ddbj.nig.ac.jp/nbdc/application/dataset_import?lang=en")
    expect(applicationFormUrl("ja")).toBe("https://humandbs.ddbj.nig.ac.jp/nbdc/application/dataset_import")
  })
})

describe("ddbjSearchEntryUrl", () => {
  it("leads a dataset of each archive to its entry in the resource its dates are read from", () => {
    expect(ddbjSearchEntryUrl("JGAD000461")).toBe("https://ddbj.nig.ac.jp/search/entry/jga-dataset/JGAD000461/")
    expect(ddbjSearchEntryUrl("DRA000908")).toBe("https://ddbj.nig.ac.jp/search/entry/sra-submission/DRA000908/")
    expect(ddbjSearchEntryUrl("E-GEAD-1107")).toBe("https://ddbj.nig.ac.jp/search/entry/gea/E-GEAD-1107/")
    expect(ddbjSearchEntryUrl("MTBKS213")).toBe("https://ddbj.nig.ac.jp/search/entry/metabobank/MTBKS213/")
    expect(ddbjSearchEntryUrl("PRJDB10000")).toBe("https://ddbj.nig.ac.jp/search/entry/bioproject/PRJDB10000/")
  })

  it("has no entry for the portal's own ids, a label not pinned yet, or a prefix it does not know", () => {
    expect(ddbjSearchEntryUrl("NHA000061")).toBeNull()
    expect(ddbjSearchEntryUrl("")).toBeNull()
    expect(ddbjSearchEntryUrl("hum0014.v1.freq.v1")).toBeNull()
    expect(ddbjSearchEntryUrl("jgad000461")).toBeNull()
    expect(ddbjSearchEntryUrl("E-GEOD-1")).toBeNull()
  })
})
