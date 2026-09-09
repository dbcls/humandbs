import { existsSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { navigationPaths } from "~/public/navigation"
import { SCREEN_PATHS } from "~/public/urls"

import { buildAlerts, buildDocuments, buildNews, loadCms, SCREEN_SLUGS, type CmsDocument } from "./cms"

function document(slug: string, versions: CmsDocument["versions"]): CmsDocument {
  return { slug, versions }
}

function version(
  locale: string,
  versionNumber: number,
  overrides: Partial<CmsDocument["versions"][number]> = {},
): CmsDocument["versions"][number] {
  return {
    locale,
    versionNumber,
    status: "published",
    title: `${locale} v${versionNumber}`,
    content: "body",
    createdAt: "2020-01-01 00:00:00",
    publishedAt: null,
    ...overrides,
  }
}

describe("document の組み立て", () => {
  it("画面になった slug は document にならない", () => {
    const screens = SCREEN_SLUGS.map((slug) => document(slug, [version("ja", 1)]))
    expect(buildDocuments(screens).documents).toEqual([])
  })

  it("draft しか無い document は落ちる", () => {
    const { documents } = buildDocuments([document("x", [version("ja", 1, { status: "draft" })])])
    expect(documents).toEqual([])
  })

  it("draft は published の隣にあっても持ち込まれない", () => {
    const { documents: built } = buildDocuments([document("x", [
      version("ja", 1),
      version("ja", 1, { status: "draft", content: "draft body" }),
    ])])
    expect(built).toHaveLength(1)
    expect(built[0]?.contents).toHaveLength(1)
  })

  it("最新版も番号の slug を持ち、版なし slug は本文を持たない", () => {
    const { documents, series } = buildDocuments([document("guidelines/x", [
      version("ja", 1), version("ja", 2), version("ja", 3),
    ])])

    expect(documents.map((d) => d.slug)).toEqual([
      "guidelines/x/version/1",
      "guidelines/x/version/2",
      "guidelines/x/version/3",
    ])
    expect(series).toEqual([{ slug: "guidelines/x", currentSlug: "guidelines/x/version/3" }])
  })

  it("版が 1 つだけなら指し先を作らない", () => {
    const { documents, series } = buildDocuments([document("x", [
      version("ja", 1), version("en", 1),
    ])])
    expect(documents).toHaveLength(1)
    expect(documents[0]?.slug).toBe("x")
    expect(documents[0]?.contents.map((c) => c.locale).sort()).toEqual(["en", "ja"])
    expect(series).toEqual([])
  })

  it("片言語しか公開されていない版は片言語のまま入る", () => {
    const { documents: built } = buildDocuments([document("x", [
      version("ja", 1),
      version("en", 1, { status: "draft" }),
    ])])
    expect(built[0]?.contents.map((c) => c.locale)).toEqual(["ja"])
  })

  it("指し先は言語ごとではなく document 単位で決まる", () => {
    // English skipped a revision; the newest number is still the newest page.
    const { documents: built, series } = buildDocuments([document("x", [
      version("ja", 1), version("ja", 2), version("en", 2),
    ])])
    expect(series[0]?.currentSlug).toBe("x/version/2")
    expect(built.find((d) => d.slug === "x/version/2")?.contents.map((c) => c.locale).sort())
      .toEqual(["en", "ja"])
  })

  it("published_at が無い版は created_at の日付で公開される", () => {
    const { documents: built } = buildDocuments([document("x", [
      version("ja", 1, { createdAt: "2015-02-27 10:00:00", publishedAt: null }),
    ])])
    expect(built[0]?.contents[0]?.publishedAt).toBe("2015-02-27")
  })

  it("published_at があればそちらを採る", () => {
    const { documents: built } = buildDocuments([document("x", [
      version("ja", 1, { createdAt: "2026-07-20 10:00:00", publishedAt: "2024-04-01 09:00:00" }),
    ])])
    expect(built[0]?.contents[0]?.publishedAt).toBe("2024-04-01")
  })

  it("本文の HTML は markdown になり、/public-files/ は /files/common/ に移る", () => {
    const { documents: built } = buildDocuments([document("x", [
      version("ja", 1, { content: "<p><a href=\"/public-files/a.pdf\">x</a></p>" }),
    ])])
    expect(built[0]?.contents[0]?.content.body).toBe("[x](/files/common/a.pdf)")
  })
})

describe("news の組み立て", () => {
  it("公開日は日付だけになる", () => {
    const [item] = buildNews([{
      id: "1",
      publishedAt: "2025-09-24T09:00:00+09:00",
      translations: [{ locale: "ja", title: "t", content: "<p>b</p>" }],
    }])
    expect(item?.publishedAt).toBe("2025-09-24")
    expect(item?.contents[0]?.content.body).toBe("b")
  })

  it("公開日を持たない item も落ちない", () => {
    const [item] = buildNews([{ id: "1", publishedAt: null, translations: [] }])
    expect(item?.publishedAt).toBeNull()
    expect(item?.contents).toEqual([])
  })
})

describe("alert の組み立て", () => {
  const half = (enabled: boolean) => [{
    id: "1",
    enabled,
    translations: [{ locale: "ja", content: "<p>お知らせ</p>" }],
  }]

  it("翻訳が対にまとまる", () => {
    const [alert] = buildAlerts([{
      id: "1",
      enabled: true,
      translations: [
        { locale: "ja", content: "<p>お知らせ</p>" },
        { locale: "en", content: "<p>notice</p>" },
      ],
    }])
    expect(alert?.content.body).toEqual({ ja: "お知らせ", en: "notice" })
    expect(alert?.active).toBe(true)
  })

  it("立っていないものは、片方だけでもそのまま入る", () => {
    const [alert] = buildAlerts(half(false))
    expect(alert?.content.body).toEqual({ ja: "お知らせ", en: "" })
    expect(alert?.active).toBe(false)
  })

  it("手で書いた訳が、空いている側を埋める", () => {
    const [alert] = buildAlerts(half(true), [{ ja: "お知らせ", en: "notice", why: "" }])
    expect(alert?.content.body).toEqual({ ja: "お知らせ", en: "notice" })
  })

  it("引き当てるのは、持っている側の文そのもの", () => {
    expect(() => buildAlerts(half(true), [{ ja: "別のお知らせ", en: "notice", why: "" }]))
      .toThrow(/no en text/)
  })

  it("立っているのに訳が無ければ、移行が止まる", () => {
    expect(() => buildAlerts(half(true))).toThrow(/no en text/)
  })

  it("enabled が NULL のものは無効として入る", () => {
    expect(buildAlerts([{ id: "1", enabled: null, translations: [] }])[0]?.active).toBe(false)
  })
})

/**
 * The reachability of the navigation constants. It lives here because the set
 * of slugs is what this file decides, and it runs against the real dump — the
 * question is not whether the code is consistent but whether the entries still
 * match the corpus. Without the dump there is nothing to check against.
 */
const DUMP = join(process.cwd(), "migration", "input", "cms.json")

describe.skipIf(!existsSync(DUMP))("ナビの行き先", () => {
  it("route が持つ address か、この移行が作る slug のどちらかである", () => {
    const { documents, series } = buildDocuments(loadCms().documents)
    // A version-less slug answers through its pointer, so it counts as reachable.
    const slugs = new Set([...documents, ...series].map((d) => `/${d.slug}`))
    const screens: string[] = [...SCREEN_PATHS]
    expect(navigationPaths().filter((path) => !screens.includes(path) && !slugs.has(path)))
      .toEqual([])
    // Reading the whole dump and converting every document is seconds of real
    // work, which the default allowance leaves no room for on a busy machine.
  }, 30_000)
})
