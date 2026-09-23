import { describe, expect, it } from "vitest"

import {
  entryNames,
  filterEntries,
  filterNewsRows,
  matchingEntries,
  nextVersionNumber,
  parseVersionNumber,
  siteTree,
  slugProblem,
  unansweredLocales,
  versionNumberIn,
  type ContentsFilter,
  type DocumentRow,
  type NewsFilter,
  type NewsRow,
  type SeriesRow,
} from "./contents"

function states(published: { ja?: boolean, en?: boolean } = {}) {
  return {
    ja: { published: published.ja ?? true },
    en: { published: published.en ?? true },
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

  it("深さは slug の段の数から出る", () => {
    const tree = siteTree([guidelines, v1, v2, faq], [series])
    expect(tree.map((entry) => entry.depth)).toEqual([0, 0, 1])
  })

  it("親が並んでいなくても深さは変わらない", () => {
    const tree = siteTree([sharing], [])
    expect(tree.map((entry) => entry.depth)).toEqual([1])
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

describe("一覧の絞り込み", () => {
  const faq = { ...document("f", "faq"), title: "よくあるご質問 (FAQ)" }
  const policy = { ...document("p", "nbdc-policy"), title: "NBDC データ共有ポリシー" }
  const v2 = { ...document("v2", "guidelines/sharing/version/2"), title: "共有ガイドライン ver. 8.0" }
  const series: SeriesRow = {
    id: "series",
    slug: "guidelines/sharing",
    currentId: "v2",
    revisions: [v2],
  }
  const tree = siteTree([faq, policy, v2], [series])

  function found(words: string) {
    return matchingEntries(tree, words).map((entry) => entryNames(entry).slug)
  }

  it("slug の一部で引ける", () => {
    expect(found("policy")).toEqual(["nbdc-policy"])
  })

  it("タイトルの一部で引ける", () => {
    expect(found("共有")).toEqual(["guidelines/sharing", "nbdc-policy"])
  })

  it("series は指し先のタイトルで引ける", () => {
    expect(found("ver. 8.0")).toEqual(["guidelines/sharing"])
  })

  it("大文字小文字と前後の空白は問わない", () => {
    expect(found("  FAQ  ")).toEqual(["faq"])
    expect(found("NBDC-POLICY")).toEqual(["nbdc-policy"])
  })

  it("空の語も空白だけの語も全件を返す", () => {
    expect(found("")).toEqual(["faq", "guidelines/sharing", "nbdc-policy"])
    expect(found("   ")).toEqual(["faq", "guidelines/sharing", "nbdc-policy"])
  })

  it("行として並んでいない版は引けない", () => {
    expect(found("version/2")).toEqual([])
  })

  it("指し先を失った series はタイトルを持たず、slug だけで引ける", () => {
    const orphan = siteTree([], [{ ...series, currentId: "gone" }])
    expect(matchingEntries(orphan, "共有")).toEqual([])
    expect(matchingEntries(orphan, "sharing")).toHaveLength(1)
  })
})

describe("一覧の軸", () => {
  const faq = document("f", "faq", { ja: true, en: true })
  const neither = document("d", "draft-only", { ja: false, en: false })
  const jaOnly = document("j", "ja-only", { ja: true, en: false })
  const v1 = document("v1", "guidelines/sharing/version/1", { ja: true, en: false })
  const series: SeriesRow = {
    id: "s",
    slug: "guidelines/sharing",
    currentId: "v1",
    revisions: [v1],
  }
  const tree = siteTree([faq, neither, jaOnly, v1], [series])

  function found(filter: Partial<ContentsFilter>): string[] {
    return filterEntries(tree, { keyword: "", versioning: [], ja: [], en: [], ...filter })
      .map((entry) => entryNames(entry).slug)
  }

  it("何も選ばなければ全件が残る", () => {
    expect(found({})).toEqual(["draft-only", "faq", "guidelines/sharing", "ja-only"])
  })

  it("バージョンの有無で分かれる", () => {
    expect(found({ versioning: ["versioned"] })).toEqual(["guidelines/sharing"])
    expect(found({ versioning: ["plain"] })).toEqual(["draft-only", "faq", "ja-only"])
  })

  it("軸の中は OR なので、両方選ぶと絞られない", () => {
    expect(found({ versioning: ["versioned", "plain"] })).toHaveLength(4)
    expect(found({ ja: ["published", "unpublished"] })).toHaveLength(4)
  })

  it("series は指し先の公開状態で絞られる", () => {
    expect(found({ ja: ["published"] })).toEqual(["faq", "guidelines/sharing", "ja-only"])
    expect(found({ en: ["published"] })).toEqual(["faq"])
  })

  it("軸どうしは AND", () => {
    expect(found({ ja: ["published"], en: ["unpublished"] }))
      .toEqual(["guidelines/sharing", "ja-only"])
  })

  it("窓と軸も AND", () => {
    expect(found({ keyword: "ja", ja: ["published"] })).toEqual(["ja-only"])
    expect(found({ keyword: "ja", ja: ["unpublished"] })).toEqual([])
  })

  it("指し先を失った series は、どちらの言語でも未公開として扱われる", () => {
    const orphan = siteTree([], [{ ...series, currentId: "gone" }])
    const bare = { keyword: "", versioning: [] }
    expect(filterEntries(orphan, { ...bare, ja: ["unpublished"], en: ["unpublished"] }))
      .toHaveLength(1)
    expect(filterEntries(orphan, { ...bare, ja: ["published"], en: [] })).toEqual([])
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

describe("お知らせの一覧の絞り込み", () => {
  function news(
    id: string,
    publishedAt: string | null,
    title: string,
    published?: { ja?: boolean, en?: boolean },
  ): NewsRow {
    // Narrowing never reads it — whether a date has arrived is the database's
    // answer, and these rows are built by hand.
    return { id, publishedAt, title, scheduled: false, states: states(published) }
  }

  const june = news("a", "2026-06-23", "hum0556 の制限公開データを公開しました")
  const may = news("b", "2026-05-20", "産婦人科学教室からの制限公開データ", { en: false })
  const writing = news("c", null, "書きかけのお知らせ", { ja: false, en: false })
  const rows = [writing, june, may]

  function found(filter: Partial<NewsFilter>): string[] {
    return filterNewsRows(rows, { keyword: "", dating: [], ja: [], en: [], ...filter })
      .map((row) => row.id)
  }

  it("条件が無ければ渡された順のまま全件を返す", () => {
    expect(found({})).toEqual(["c", "a", "b"])
  })

  it("公開日の一部で、その月のものだけを引ける", () => {
    expect(found({ keyword: "2026-06" })).toEqual(["a"])
  })

  it("タイトルの一部でも引ける", () => {
    expect(found({ keyword: "産婦人科" })).toEqual(["b"])
  })

  it("公開日とタイトルをまたぐ語では引けない", () => {
    expect(found({ keyword: "23 hum0556" })).toEqual([])
  })

  it("日付を持たない行は日付の語では引けず、タイトルでは引ける", () => {
    expect(found({ keyword: "2026" })).toEqual(["a", "b"])
    expect(found({ keyword: "書きかけ" })).toEqual(["c"])
  })

  it("大文字小文字と前後の空白は問わない", () => {
    expect(found({ keyword: "  HUM0556  " })).toEqual(["a"])
  })

  it("日付の軸は、日付を持つ行と持たない行を分ける", () => {
    expect(found({ dating: ["undated"] })).toEqual(["c"])
    expect(found({ dating: ["dated"] })).toEqual(["a", "b"])
  })

  it("軸の値をすべて選ぶことは、その軸に触れていないことと同じ", () => {
    expect(found({ dating: ["dated", "undated"] })).toEqual(["c", "a", "b"])
  })

  it("言語の軸どうしは AND", () => {
    expect(found({ ja: ["published"], en: ["unpublished"] })).toEqual(["b"])
    expect(found({ ja: ["unpublished"], en: ["published"] })).toEqual([])
  })

  it("窓と軸も AND", () => {
    expect(found({ keyword: "制限公開", ja: ["published"] })).toEqual(["a", "b"])
    expect(found({ keyword: "制限公開", ja: ["unpublished"] })).toEqual([])
  })
})
