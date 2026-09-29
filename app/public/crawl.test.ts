import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { crawlRel, pageAlternates, robotsText, sitemapXml } from "./crawl"

const ORIGIN = "https://humandbs.example.org"

/**
 * Whether robots.txt keeps a crawler off a path, read the way RFC 9309 reads
 * it: the longest matching rule wins, a rule matches as a prefix, and `Allow`
 * wins a tie. The file this checks has no wildcards.
 */
function blocked(robots: string, path: string): boolean {
  const rules = robots.split("\n").flatMap((line) => {
    const [field, ...rest] = line.split(":")
    const value = rest.join(":").trim()
    if (field === "Allow") return [{ allow: true, path: value }]
    if (field === "Disallow" && value !== "") return [{ allow: false, path: value }]
    return []
  })
  const matching = rules.filter((rule) => path.startsWith(rule.path))
  const longest = Math.max(-1, ...matching.map((rule) => rule.path.length))
  const winners = matching.filter((rule) => rule.path.length === longest)
  return winners.length > 0 && !winners.some((rule) => rule.allow)
}

const LIST_OR_PAGE = fc.constantFrom("/research", "/dataset")
const PREFIX = fc.constantFrom("", "/en")
const LABEL = fc.stringMatching(/^(hum\d{4}|JGAD\d{6}|hum\d{4}\.v\d\.[a-z]{2,6}\.v\d)$/)
const QUERY = fc.webQueryParameters({ size: "small" }).filter((query) => query !== "")

describe("robotsText", () => {
  it("本番は条件の付いた一覧と書き出しを両方の言語で拒否し、sitemap の場所を示す", () => {
    expect(robotsText({ origin: ORIGIN, noindex: false })).toBe([
      "User-agent: *",
      "Disallow: /research?",
      "Disallow: /research/export",
      "Disallow: /dataset?",
      "Disallow: /dataset/export",
      "Disallow: /en/research?",
      "Disallow: /en/research/export",
      "Disallow: /en/dataset?",
      "Disallow: /en/dataset/export",
      "",
      `Sitemap: ${ORIGIN}/sitemap.xml`,
      "",
    ].join("\n"))
  })

  it("本番は条件の付いた一覧と書き出しを、どんな条件でも拒否する", () => {
    const robots = robotsText({ origin: ORIGIN, noindex: false })
    fc.assert(fc.property(PREFIX, LIST_OR_PAGE, QUERY, (prefix, list, query) => {
      expect(blocked(robots, `${prefix}${list}?${query}`)).toBe(true)
      expect(blocked(robots, `${prefix}${list}/export?${query}`)).toBe(true)
      expect(blocked(robots, `${prefix}${list}/export`)).toBe(true)
    }))
  })

  it("本番は条件の無い一覧、研究とデータセットのページ、記事、トップを拒否しない", () => {
    const robots = robotsText({ origin: ORIGIN, noindex: false })
    fc.assert(fc.property(PREFIX, LIST_OR_PAGE, LABEL, (prefix, list, label) => {
      expect(blocked(robots, `${prefix}${list}`)).toBe(false)
      expect(blocked(robots, `${prefix}${list}/${label}`)).toBe(false)
      expect(blocked(robots, `${prefix}${list}/${label}/v2`)).toBe(false)
    }))
    for (const path of ["/", "/en", "/guidelines", "/en/guidelines", "/hum0001", "/sitemap.xml", "/api/research?q=cancer"]) {
      expect(blocked(robots, path), path).toBe(false)
    }
  })

  it("検索エンジンに載せない配置は、API とその説明のページのほかをすべて拒否し、sitemap を示さない", () => {
    const text = robotsText({ origin: ORIGIN, noindex: true })
    expect(text).toBe("User-agent: *\nAllow: /api/\nAllow: /swagger-ui/\nDisallow: /\n")
    expect(text).not.toContain("Sitemap")
  })
})

describe("crawlRel", () => {
  it("本番の robots.txt が拒否するアドレスへのリンクにだけ nofollow を付ける", () => {
    const robots = robotsText({ origin: ORIGIN, noindex: false })
    const path = fc.oneof(
      fc.tuple(PREFIX, LIST_OR_PAGE, QUERY).map(([prefix, list, query]) => `${prefix}${list}?${query}`),
      fc.tuple(PREFIX, LIST_OR_PAGE, QUERY).map(([prefix, list, query]) => `${prefix}${list}/export?${query}`),
      fc.tuple(PREFIX, LIST_OR_PAGE).map(([prefix, list]) => `${prefix}${list}`),
      fc.tuple(PREFIX, LIST_OR_PAGE, LABEL).map(([prefix, list, label]) => `${prefix}${list}/${label}`),
      fc.tuple(PREFIX, QUERY).map(([prefix, query]) => `${prefix}/news?${query}`),
      fc.tuple(LABEL, QUERY).map(([label, query]) => `/research/${label}?${query}`),
    )
    fc.assert(fc.property(path, (to) => {
      expect(crawlRel(to)).toBe(blocked(robots, to) ? "nofollow" : undefined)
    }))
  })

  it("条件の付いた一覧と書き出しは nofollow、条件の無い一覧と研究のページのファイルのページ送りは付けない", () => {
    expect(crawlRel("/research?q=cancer")).toBe("nofollow")
    expect(crawlRel("/en/dataset?page=2")).toBe("nofollow")
    expect(crawlRel("/dataset/export?q=disease%3AC53")).toBe("nofollow")
    expect(crawlRel("/research")).toBeUndefined()
    expect(crawlRel("/en/research")).toBeUndefined()
    expect(crawlRel("/research/hum0001?files=2")).toBeUndefined()
  })
})

describe("sitemapXml", () => {
  it("両方の言語で公開したページは言語ごとに並べ、どちらにも両方の言語と既定の日本語を添える", () => {
    const xml = sitemapXml([{ path: "/research/hum0001", locales: ["en", "ja"], lastModified: "2026-09-27" }], ORIGIN)
    const alternates = [
      `    <xhtml:link rel="alternate" hreflang="ja" href="${ORIGIN}/research/hum0001"/>`,
      `    <xhtml:link rel="alternate" hreflang="en" href="${ORIGIN}/en/research/hum0001"/>`,
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/research/hum0001"/>`,
    ]
    expect(xml).toContain([
      "  <url>",
      `    <loc>${ORIGIN}/research/hum0001</loc>`,
      "    <lastmod>2026-09-27</lastmod>",
      ...alternates,
      "  </url>",
      "  <url>",
      `    <loc>${ORIGIN}/en/research/hum0001</loc>`,
      "    <lastmod>2026-09-27</lastmod>",
      ...alternates,
      "  </url>",
    ].join("\n"))
  })

  it("片方の言語だけで公開したページは、その言語の 1 行だけで、別の言語を添えない", () => {
    const xml = sitemapXml([{ path: "/news/n1", locales: ["en"], lastModified: null }], ORIGIN)
    expect(xml).toContain(`<loc>${ORIGIN}/en/news/n1</loc>`)
    expect(xml).not.toContain(`<loc>${ORIGIN}/news/n1</loc>`)
    expect(xml).not.toContain("xhtml:link")
    expect(xml).not.toContain("lastmod")
  })

  it("トップは言語の prefix だけのアドレスになる", () => {
    const xml = sitemapXml([{ path: "/", locales: ["ja", "en"], lastModified: null }], ORIGIN)
    expect(xml).toContain(`<loc>${ORIGIN}/</loc>`)
    expect(xml).toContain(`<loc>${ORIGIN}/en</loc>`)
  })

  it("アドレスの & などは XML の記法にならない", () => {
    const xml = sitemapXml([{ path: "/a&b<c>", locales: ["ja"], lastModified: null }], ORIGIN)
    expect(xml).toContain(`<loc>${ORIGIN}/a&amp;b&lt;c&gt;</loc>`)
  })

  it("言語の無いページは並べず、何も無くても XML として閉じる", () => {
    expect(sitemapXml([{ path: "/x", locales: [], lastModified: null }], ORIGIN)).toBe([
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
      "</urlset>",
      "",
    ].join("\n"))
  })
})

describe("pageAlternates", () => {
  it("日本語・英語・既定の日本語のアドレスを、クエリを付けたまま並べる", () => {
    expect(pageAlternates(ORIGIN, "/dataset", "?q=file-type:bam")).toEqual([
      { hrefLang: "ja", href: `${ORIGIN}/dataset?q=file-type:bam` },
      { hrefLang: "en", href: `${ORIGIN}/en/dataset?q=file-type:bam` },
      { hrefLang: "x-default", href: `${ORIGIN}/dataset?q=file-type:bam` },
    ])
  })

  it("トップの英語は prefix だけのアドレスになる", () => {
    expect(pageAlternates(ORIGIN, "/", "").map((one) => one.href)).toEqual([`${ORIGIN}/`, `${ORIGIN}/en`, `${ORIGIN}/`])
  })
})
