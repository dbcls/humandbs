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

  it("片言語しか無い document は、もう一方の言語に倒れずに 404 になる", async () => {
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

  it("その言語の翻訳を持つものだけが並ぶ", async () => {
    await createNews("2026-01-01", [{ locale: "ja" }, { locale: "en" }])
    await createNews("2026-01-02", [{ locale: "ja" }])

    expect((await newsList("ja", 1)).items).toHaveLength(2)
    expect((await newsList("en", 1)).items).toHaveLength(1)
  })

  it("次のページがあるかどうかを、件数を数えずに返す", async () => {
    for (let i = 0; i < 5; i += 1) await createNews(`2026-01-0${i + 1}`, [{ locale: "ja" }])

    const first = await newsList("ja", 1, 2)
    expect(first.items).toHaveLength(2)
    expect(first.hasNext).toBe(true)

    const last = await newsList("ja", 3, 2)
    expect(last.items).toHaveLength(1)
    expect(last.hasNext).toBe(false)
  })

  it("id の形が uuid でなくても落ちずに 404 になる", async () => {
    expect(await status(newsItemPage("not-a-uuid", "ja"))).toBe(404)
  })

  it("公開日を持たない item も並ぶ", async () => {
    await createNews(null, [{ locale: "ja", title: "日付なし" }])
    const { items } = await newsList("ja", 1)
    expect(items.map((item) => item.publishedAt)).toEqual([null])
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
    expect(shown[0]).toContain("出る")
  })

  it("片言語しか無ければもう一方の言語が出る", async () => {
    await db.insert(s.alert).values({ content: { body: { ja: "日本語だけ", en: "" } }, active: true })
    expect((await activeAlerts("en"))[0]).toContain("日本語だけ")
  })

  it("両方空なら何も出ない", async () => {
    await db.insert(s.alert).values({ content: { body: { ja: "", en: "" } }, active: true })
    expect(await activeAlerts("ja")).toHaveLength(0)
  })
})
