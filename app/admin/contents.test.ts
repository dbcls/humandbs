import { describe, expect, it } from "vitest"

import {
  nextVersionNumber,
  parseVersionNumber,
  siteTree,
  slugProblem,
  unansweredLocales,
  versionNumberIn,
  type DocumentRow,
  type SeriesRow,
} from "./contents"

function states(published: { ja?: boolean, en?: boolean } = {}) {
  return {
    ja: { published: published.ja ?? true, hasDraft: false },
    en: { published: published.en ?? true, hasDraft: false },
  }
}

function document(id: string, slug: string, published?: { ja?: boolean, en?: boolean }): DocumentRow {
  return { id, slug, title: slug, states: states(published) }
}

describe("slug の検査", () => {
  it("英小文字・数字・ハイフン・スラッシュだけを通す", () => {
    expect(slugProblem("guidelines/data-sharing-guidelines")).toBeNull()
    expect(slugProblem("hum0197-v18-microbiome")).toBeNull()
    expect(slugProblem("Faq")).toBe("malformed-slug")
    expect(slugProblem("a b")).toBe("malformed-slug")
    expect(slugProblem("")).toBe("malformed-slug")
    expect(slugProblem("/faq")).toBe("malformed-slug")
    expect(slugProblem("faq/")).toBe("malformed-slug")
  })

  it("route が持つ先頭の語は取れない", () => {
    for (const slug of ["news", "research", "dataset", "admin", "api", "files", "private"]) {
      expect(slugProblem(slug)).toBe("reserved-slug")
    }
  })

  it("**先頭の語が取られているかを見る** ので、その下も取れない", () => {
    // `/news/{id}` is a route, so `news/2026` would never reach the catch-all.
    expect(slugProblem("news/2026")).toBe("reserved-slug")
    expect(slugProblem("research/hum0001")).toBe("reserved-slug")
  })

  it("言語 prefix も取れない", () => {
    // `readLocale` strips these before a slug is looked up at all.
    expect(slugProblem("en/faq")).toBe("reserved-slug")
    expect(slugProblem("ja")).toBe("reserved-slug")
  })

  it("先頭の語が違えば似た綴りは通る", () => {
    expect(slugProblem("newsletter")).toBeNull()
    expect(slugProblem("api-terms")).toBeNull()
  })
})

describe("版の slug", () => {
  it("その base の版だけを数える", () => {
    expect(versionNumberIn("x", "x/version/3")).toBe(3)
    expect(versionNumberIn("x", "y/version/3")).toBeNull()
    expect(versionNumberIn("x", "x")).toBeNull()
    expect(versionNumberIn("x", "x/version/0")).toBeNull()
  })

  it("提案される次の版は、いちばん大きい番号の次になる", () => {
    expect(nextVersionNumber("x", [])).toBe(1)
    expect(nextVersionNumber("x", ["x/version/1", "x/version/2"])).toBe(3)
  })

  it("**番号は再利用しない** ので、抜けがあっても詰めない", () => {
    expect(nextVersionNumber("x", ["x/version/1", "x/version/9"])).toBe(10)
  })

  it("他の slug の版は数に入らない", () => {
    expect(nextVersionNumber("x", ["y/version/7"])).toBe(1)
  })

  it("**版番号として通るのは 1 以上の整数だけ**", () => {
    expect(parseVersionNumber("1")).toBe(1)
    expect(parseVersionNumber(" 12 ")).toBe(12)
    expect(parseVersionNumber("0")).toBeNull()
    expect(parseVersionNumber("")).toBeNull()
    expect(parseVersionNumber("1.5")).toBeNull()
    expect(parseVersionNumber("-3")).toBeNull()
    expect(parseVersionNumber("1e3")).toBeNull()
    expect(parseVersionNumber("ⅴ")).toBeNull()
  })
})

describe("木", () => {
  const guidelines = document("g", "guidelines")
  const sharing = document("s", "guidelines/sharing")
  const v1 = document("v1", "guidelines/sharing/version/1")
  const v2 = document("v2", "guidelines/sharing/version/2")
  const faq = document("f", "faq")
  const series: SeriesRow = {
    id: "series",
    slug: "guidelines/sharing",
    currentId: "v2",
    revisions: [v2, v1],
  }

  it("版は series の下に畳まれ、行としては並ばない", () => {
    const tree = siteTree([guidelines, v1, v2, faq], [series])
    expect(tree.map((entry) => entry.kind === "series" ? entry.series.slug : entry.document.slug))
      .toEqual(["faq", "guidelines", "guidelines/sharing"])
  })

  it("深さは slug の prefix から出る", () => {
    const tree = siteTree([guidelines, v1, v2, faq], [series])
    expect(tree.map((entry) => entry.depth)).toEqual([0, 0, 1])
  })

  it("prefix の document が無ければ深くならない", () => {
    const tree = siteTree([sharing], [])
    expect(tree.map((entry) => entry.depth)).toEqual([0])
  })

  it("series はいまの指し先を伴う", () => {
    const [entry] = siteTree([v1, v2], [series])
    expect(entry?.kind === "series" && entry.current?.slug).toBe("guidelines/sharing/version/2")
  })

  it("指し先が版の中に無ければ null になる", () => {
    const [entry] = siteTree([v1], [{ ...series, currentId: "gone" }])
    expect(entry?.kind === "series" && entry.current).toBeNull()
  })
})

describe("版なし slug が応答しない言語", () => {
  it("指し先が公開されていない言語を挙げる", () => {
    const current = document("v", "x/version/1", { ja: true, en: false })
    expect(unansweredLocales(current, ["ja", "en"])).toEqual(["en"])
  })

  it("両方公開されていれば何も挙げない", () => {
    expect(unansweredLocales(document("v", "x/version/1"), ["ja", "en"])).toEqual([])
  })

  it("指し先そのものが無ければ全部の言語を挙げる", () => {
    expect(unansweredLocales(null, ["ja", "en"])).toEqual(["ja", "en"])
  })
})
