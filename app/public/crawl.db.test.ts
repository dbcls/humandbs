import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedDataset, seedResearch, seedVersion } from "~/db/seed"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { sitemapPages } from "./crawl.server"

const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

const ARTICLE = { title: "t", body: "" }

async function article(slug: string, locales: { locale: "ja" | "en", published: boolean }[]): Promise<string> {
  const [row] = await db.insert(s.document).values({ slug }).returning({ id: s.document.id })
  if (row === undefined) throw new Error("no document")
  for (const one of locales) {
    await db.insert(s.documentContent).values({ documentId: row.id, locale: one.locale, content: ARTICLE, published: one.published })
  }
  return row.id
}

async function announcement(publishedAt: string | null, locales: ("ja" | "en")[]): Promise<string> {
  const [row] = await db.insert(s.news).values({ publishedAt }).returning({ id: s.news.id })
  if (row === undefined) throw new Error("no news")
  for (const locale of locales) {
    await db.insert(s.newsContent).values({ newsId: row.id, locale, content: ARTICLE, published: true })
  }
  return row.id
}

describe("sitemapPages", () => {
  it("並べるのはトップ・一覧・公開中の研究とデータセットで、どれも両方の言語", async () => {
    const research = await seedResearch(db, "hum0001")
    const dataset = await seedDataset(db, research, "JGAD000001")
    await seedVersion(db, { researchId: research, number: 1, releaseDate: "2026-09-01", datasets: [{ datasetId: dataset }] })
    // Pinned but never published: its page is a 404 and is not listed.
    await seedDataset(db, await seedResearch(db, "hum0002"), "JGAD000002")
    await rebuildSearchDocs(db)

    const pages = await sitemapPages(db)

    expect(pages.map((page) => page.path)).toEqual(["/", "/research", "/dataset", "/news", "/research/hum0001", "/dataset/JGAD000001"])
    for (const page of pages) expect(page.locales, page.path).toEqual(["ja", "en"])
    expect(pages.find((page) => page.path === "/research/hum0001")?.lastModified).toBe("2026-09-01")
  })

  it("記事は公開している言語だけで並べ、どの言語でも公開していない記事は並べない", async () => {
    await article("guidelines", [{ locale: "ja", published: true }, { locale: "en", published: false }])
    await article("draft-only", [{ locale: "ja", published: false }])

    const pages = await sitemapPages(db)

    expect(pages.filter((page) => page.path === "/guidelines").map((page) => page.locales)).toEqual([["ja"]])
    expect(pages.map((page) => page.path)).not.toContain("/draft-only")
  })

  it("シリーズの slug は、今のバージョンが公開している言語で並べる", async () => {
    const current = await article("guidelines/data-sharing-guidelines/version/2", [{ locale: "ja", published: true }, { locale: "en", published: true }])
    await db.insert(s.documentSeries).values({ slug: "guidelines/data-sharing-guidelines", currentId: current })

    const pages = await sitemapPages(db)

    expect(pages.find((page) => page.path === "/guidelines/data-sharing-guidelines")?.locales).toEqual(["ja", "en"])
  })

  it("お知らせは公開日時が過ぎたものだけを、公開している言語で並べる", async () => {
    const past = await announcement("2020-01-01T00:00:00", ["en"])
    const future = await announcement("2999-01-01T00:00:00", ["ja", "en"])
    const unscheduled = await announcement(null, ["ja"])

    const paths = (await sitemapPages(db)).filter((page) => page.path.startsWith("/news/"))

    expect(paths).toEqual([{ path: `/news/${past}`, locales: ["en"], lastModified: expect.any(String) as string }])
    expect(paths.map((page) => page.path)).not.toContain(`/news/${future}`)
    expect(paths.map((page) => page.path)).not.toContain(`/news/${unscheduled}`)
  })
})
