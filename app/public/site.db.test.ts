import { sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { activeAlerts, documentPage, findDocument, newsItemPage, newsList } from "./site.server"

/**
 * The site-content pages against the development database. What is checked here
 * is the negative side: an unpublished locale is a 404 rather than a fallback,
 * and nothing unpublished reaches a list.
 */
const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

function only<T>(rows: T[]): T {
  const [row] = rows
  if (row === undefined) throw new Error("expected exactly one row")
  return row
}

interface Side {
  locale: "ja" | "en"
  title?: string
  body?: string
  published?: boolean
}

async function createDocument(slug: string, sides: Side[]): Promise<string> {
  const { id } = only(await db.insert(s.document).values({ slug }).returning({ id: s.document.id }))
  for (const side of sides) {
    await db.insert(s.documentContent).values({
      documentId: id,
      locale: side.locale,
      content: { title: side.title ?? slug, body: side.body ?? "body" },
      published: side.published ?? true,
    })
  }
  return id
}

async function createNews(
  publishedAt: string | null,
  sides: Side[],
): Promise<string> {
  const { id } = only(await db.insert(s.news).values({ publishedAt }).returning({ id: s.news.id }))
  for (const side of sides) {
    await db.insert(s.newsContent).values({
      newsId: id,
      locale: side.locale,
      content: { title: side.title ?? "title", body: side.body ?? "body" },
      published: side.published ?? true,
    })
  }
  return id
}

async function status(load: Promise<unknown>): Promise<number> {
  try {
    await load
    return 200
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.status
    throw thrown
  }
}

describe("document の公開", () => {
  it("公開されている locale だけが応答する", async () => {
    await createDocument("faq", [
      { locale: "ja" },
      { locale: "en", published: false },
    ])

    expect(await status(documentPage("faq", "ja"))).toBe(200)
    expect(await status(documentPage("faq", "en"))).toBe(404)
  })

  it("片言語しか無い document は、もう一方の言語にフォールバックせずに 404 になる", async () => {
    await createDocument("aim", [{ locale: "ja" }])
    expect(await status(documentPage("aim", "en"))).toBe(404)
  })

  it("存在しない slug と公開されていない document は同じ 404 を返す", async () => {
    await createDocument("secret", [{ locale: "ja", published: false }])
    expect(await status(documentPage("secret", "ja"))).toBe(404)
    expect(await status(documentPage("no-such-slug", "ja"))).toBe(404)
  })

  it("階層を持つ slug がそのまま引ける", async () => {
    await createDocument("guidelines/data-sharing-guidelines/version/3", [{ locale: "ja" }])
    const page = await documentPage("guidelines/data-sharing-guidelines/version/3", "ja")
    expect(page.title).toBe("guidelines/data-sharing-guidelines/version/3")
  })

  it("本文は markdown から HTML になって返る", async () => {
    await createDocument("x", [{ locale: "ja", body: "**a** [b](/faq)" }])
    const page = await documentPage("x", "ja")
    expect(page.html).toContain("<strong>a</strong>")
    expect(page.html).toContain("href=\"/faq\"")
  })

  it("findDocument は無いものを 404 にせず null で返す", async () => {
    expect(await findDocument("home", "ja")).toBeNull()
  })
})

describe("バージョンなし slug", () => {
  async function series(slug: string, currentSlug: string, sides: Side[]): Promise<void> {
    const currentId = await createDocument(currentSlug, sides)
    await db.insert(s.documentSeries).values({ slug, currentId })
  }

  it("**本文が無く、いまのバージョンの本文を 200 で返す**", async () => {
    await series("guidelines/sharing", "guidelines/sharing/version/9", [
      { locale: "ja", body: "第 9 バージョンの本文" },
    ])

    const page = await documentPage("guidelines/sharing", "ja")
    expect(page.html).toContain("第 9 バージョンの本文")
    // The revision keeps its own address as well: both answer, neither
    // redirects, the same as a research's newest version.
    expect((await documentPage("guidelines/sharing/version/9", "ja")).html)
      .toContain("第 9 バージョンの本文")
  })

  it("公開状態は指し先のものになる", async () => {
    await series("guidelines/sharing", "guidelines/sharing/version/9", [
      { locale: "ja" },
      { locale: "en", published: false },
    ])

    expect(await status(documentPage("guidelines/sharing", "ja"))).toBe(200)
    expect(await status(documentPage("guidelines/sharing", "en"))).toBe(404)
  })

  it("同じ slug の document があれば、そちらが優先される", async () => {
    // The save path refuses to create this; the resolution is settled anyway so
    // that one address cannot resolve to two pages.
    await series("x", "x/version/1", [{ locale: "ja", body: "バージョンの本文" }])
    await createDocument("x", [{ locale: "ja", body: "document の本文" }])

    expect((await documentPage("x", "ja")).html).toContain("document の本文")
  })
})

describe("news の一覧", () => {
  it("公開されていない翻訳は一覧にも個別にも出てこない", async () => {
    const id = await createNews("2026-01-01", [{ locale: "ja", published: false }])
    expect((await newsList("ja", 1)).items).toHaveLength(0)
    expect(await status(newsItemPage(id, "ja"))).toBe(404)
  })

  it("公開日の新しい順に並ぶ", async () => {
    await createNews("2026-01-01", [{ locale: "ja", title: "古い" }])
    await createNews("2026-03-01", [{ locale: "ja", title: "新しい" }])
    await createNews("2026-02-01", [{ locale: "ja", title: "中" }])

    expect((await newsList("ja", 1)).items.map((item) => item.title))
      .toEqual(["新しい", "中", "古い"])
  })

  it("同じ日の 2 件は、時刻の遅いほうが先に出る", async () => {
    await createNews("2026-03-01 09:00:00", [{ locale: "ja", title: "朝" }])
    await createNews("2026-03-01 15:00:00", [{ locale: "ja", title: "夕方" }])

    expect((await newsList("ja", 1)).items.map((item) => item.title)).toEqual(["夕方", "朝"])
  })

  it("公開日時がまだ来ていないものは、一覧にも個別にも出てこない", async () => {
    const id = await createNews("2099-01-01 09:00:00", [{ locale: "ja", title: "予約" }])

    expect((await newsList("ja", 1)).items).toHaveLength(0)
    expect(await status(newsItemPage(id, "ja"))).toBe(404)
  })

  it("日時が過ぎていれば出る", async () => {
    await createNews("2020-01-01 09:00:00", [{ locale: "ja", title: "済み" }])

    expect((await newsList("ja", 1)).items.map((item) => item.title)).toEqual(["済み"])
  })

  it("公開日時の無いものは、公開に設定してあっても表示されない", async () => {
    // 日時の無い news は書きかけで、一覧が日付で並べる以上そこに居場所が無い。
    const id = await createNews(null, [{ locale: "ja", title: "書きかけ" }])

    expect((await newsList("ja", 1)).items).toHaveLength(0)
    expect(await status(newsItemPage(id, "ja"))).toBe(404)
  })

  it("検索で当てても、まだ来ていない日時のものは出てこない", async () => {
    await createNews("2099-01-01 09:00:00", [{ locale: "ja", title: "hum0103 の予約" }])
    await createNews("2020-01-01 09:00:00", [{ locale: "ja", title: "hum0103 の済み" }])

    expect((await newsList("ja", 1, 20, "hum0103")).items.map((item) => item.title))
      .toEqual(["hum0103 の済み"])
  })

  it("その言語の翻訳を持つものだけが並ぶ", async () => {
    await createNews("2026-01-01", [{ locale: "ja" }, { locale: "en" }])
    await createNews("2026-01-02", [{ locale: "ja" }])

    expect((await newsList("ja", 1)).items).toHaveLength(2)
    expect((await newsList("en", 1)).items).toHaveLength(1)
  })

  it("そのページの行と、一覧全体の件数の両方を返す", async () => {
    for (let i = 0; i < 5; i += 1) await createNews(`2026-01-0${i + 1}`, [{ locale: "ja" }])

    const first = await newsList("ja", 1, 2)
    expect(first.items).toHaveLength(2)
    expect(first.total).toBe(5)
    expect(first.pageCount).toBe(3)

    const last = await newsList("ja", 3, 2)
    expect(last.items).toHaveLength(1)
    expect(last.total).toBe(5)
  })

  it("そのページが一覧全体のどこからどこまでかを返す", async () => {
    for (let i = 0; i < 5; i += 1) await createNews(`2026-01-0${i + 1}`, [{ locale: "ja" }])

    const first = await newsList("ja", 1, 2)
    expect([first.rangeFrom, first.rangeTo]).toEqual([1, 2])

    // 端数のページは、そこに実際にある行までしか返さない。
    const last = await newsList("ja", 3, 2)
    expect([last.rangeFrom, last.rangeTo]).toEqual([5, 5])
  })

  it("一覧の外のページを求められたら、いちばん近い実在のページを返す", async () => {
    for (let i = 0; i < 5; i += 1) await createNews(`2026-01-0${i + 1}`, [{ locale: "ja" }])

    // 空のページを返すと、件数だけが出て行が 1 つも無い画面になる。
    const far = await newsList("ja", 999, 2)
    expect(far.page).toBe(3)
    expect(far.items).toHaveLength(1)
    expect(far.total).toBe(5)
    // 範囲も丸めた先のページのもので、求められたページのものではない。
    expect([far.rangeFrom, far.rangeTo]).toEqual([5, 5])
  })

  it("1 件も無いときもページは 1 つある", async () => {
    const empty = await newsList("ja", 1)
    expect(empty.total).toBe(0)
    expect(empty.pageCount).toBe(1)
    // 1 件も無いところに 1 件目は無いので、範囲は 0 から始まる。
    expect([empty.rangeFrom, empty.rangeTo]).toEqual([0, 0])
  })

  it("id の形が uuid でなくてもエラーにならずに 404 になる", async () => {
    expect(await status(newsItemPage("not-a-uuid", "ja"))).toBe(404)
  })
})

describe("news の検索", () => {
  it("タイトルからも本文からも引ける", async () => {
    await createNews("2026-01-01", [{ locale: "ja", title: "hum0103 を公開", body: "本文" }])
    await createNews("2026-01-02", [{ locale: "ja", title: "別の告知", body: "hum0103 の続き" }])
    await createNews("2026-01-03", [{ locale: "ja", title: "無関係", body: "無関係" }])

    expect((await newsList("ja", 1, 20, "hum0103")).items).toHaveLength(2)
  })

  it("大文字と小文字を区別しない", async () => {
    await createNews("2026-01-01", [{ locale: "ja", title: "JGAD000117 を公開" }])
    expect((await newsList("ja", 1, 20, "jgad000117")).items).toHaveLength(1)
  })

  it("その言語の翻訳の中だけを見る", async () => {
    await createNews("2026-01-01", [
      { locale: "ja", title: "日本語だけの語" },
      { locale: "en", title: "english only" },
    ])

    expect((await newsList("ja", 1, 20, "english")).items).toHaveLength(0)
    expect((await newsList("en", 1, 20, "english")).items).toHaveLength(1)
  })

  it("公開されていない翻訳は検索でも出てこない", async () => {
    await createNews("2026-01-01", [{ locale: "ja", title: "下書きの語", published: false }])
    expect((await newsList("ja", 1, 20, "下書き")).items).toHaveLength(0)
  })

  // **The one that matters**: without escaping, `%` matches every row, so a
  // reader who typed a percent sign would be told that every announcement
  // contains it.
  it("LIKE のワイルドカードを入力しても全件にならない", async () => {
    await createNews("2026-01-01", [{ locale: "ja", title: "ふつうの告知" }])
    await createNews("2026-01-02", [{ locale: "ja", title: "50% 完了" }])

    expect((await newsList("ja", 1, 20, "%")).items.map((item) => item.title))
      .toEqual(["50% 完了"])
    expect((await newsList("ja", 1, 20, "_")).items).toHaveLength(0)
  })

  it("前後の空白は語の一部にしない", async () => {
    await createNews("2026-01-01", [{ locale: "ja", title: "hum0103" }])
    expect((await newsList("ja", 1, 20, "  hum0103  ")).items).toHaveLength(1)
  })

  it("空の検索は絞り込みをしない", async () => {
    await createNews("2026-01-01", [{ locale: "ja" }])
    await createNews("2026-01-02", [{ locale: "ja" }])
    expect((await newsList("ja", 1, 20, "   ")).items).toHaveLength(2)
  })
})

describe("alert", () => {
  it("有効なものだけが出る", async () => {
    await db.insert(s.alert).values([
      { content: { body: { ja: "出る", en: "shown" } }, active: true },
      { content: { body: { ja: "出ない", en: "hidden" } }, active: false },
    ])

    const shown = await activeAlerts("ja")
    expect(shown).toHaveLength(1)
    expect(shown[0]?.html).toContain("出る")
    expect(shown[0]?.untranslated).toBe(false)
  })

  it("片言語しか無ければもう一方の言語が出て、そうであるとマークが付く", async () => {
    await db.insert(s.alert).values({ content: { body: { ja: "日本語だけ", en: "" } }, active: true })
    const shown = await activeAlerts("en")
    expect(shown[0]?.html).toContain("日本語だけ")
    // 読者の言語では無いことを画面が示せるように、マークが応答に乗る
    expect(shown[0]?.untranslated).toBe(true)
  })

  it("両方空なら何も出ない", async () => {
    await db.insert(s.alert).values({ content: { body: { ja: "", en: "" } }, active: true })
    expect(await activeAlerts("ja")).toHaveLength(0)
  })

  describe("表示期間", () => {
    /** Now in JST, moved by an interval, the clock the period is written in. */
    const jst = (by: string) => sql`(now() at time zone 'Asia/Tokyo') + ${by}::interval`
    const shownOf = async () => (await activeAlerts("ja")).map((one) => one.html.replace(/<[^>]+>/g, "").trim())

    it("開始が来ていないもの・終了を過ぎたものは出ず、期間の中と端の無いものは出る", async () => {
      await db.insert(s.alert).values([
        { content: { body: { ja: "開始前", en: "a" } }, active: true, displayFrom: jst("1 hour") },
        { content: { body: { ja: "終了後", en: "b" } }, active: true, displayUntil: jst("-1 hour") },
        { content: { body: { ja: "期間中", en: "c" } }, active: true, displayFrom: jst("-1 hour"), displayUntil: jst("1 hour") },
        { content: { body: { ja: "開始だけ過ぎた", en: "d" } }, active: true, displayFrom: jst("-1 day") },
        { content: { body: { ja: "終了だけ先", en: "e" } }, active: true, displayUntil: jst("1 day") },
        { content: { body: { ja: "期間中でも非表示", en: "f" } }, active: false, displayFrom: jst("-1 hour"), displayUntil: jst("1 hour") },
      ])

      expect(await shownOf()).toEqual(["期間中", "開始だけ過ぎた", "終了だけ先"])
    })

    it("終了が開始と同じか前の行は DB が拒否する", async () => {
      await expect(db.insert(s.alert).values({
        content: { body: { ja: "逆", en: "x" } },
        active: true,
        displayFrom: "2026-10-01 12:00:00",
        displayUntil: "2026-10-01 12:00:00",
      })).rejects.toThrow()
    })
  })
})
