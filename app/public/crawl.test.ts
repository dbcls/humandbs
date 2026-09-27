import { describe, expect, it } from "vitest"

import { pageAlternates, robotsText, sitemapXml } from "./crawl"

const ORIGIN = "https://humandbs.example.org"

describe("robotsText", () => {
  it("何も拒否せず、sitemap の場所を示す", () => {
    expect(robotsText({ origin: ORIGIN, noindex: false })).toBe(
      `User-agent: *\nDisallow:\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
    )
  })

  it("検索エンジンに載せない配置は、API とその説明のページのほかをすべて拒否し、sitemap を示さない", () => {
    const text = robotsText({ origin: ORIGIN, noindex: true })
    expect(text).toBe("User-agent: *\nAllow: /api/\nAllow: /swagger-ui/\nDisallow: /\n")
    expect(text).not.toContain("Sitemap")
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
