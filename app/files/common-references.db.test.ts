import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedDataset, seedResearch, seedVersion } from "~/db/seed"

import { referencedCommonFiles } from "./common-references.server"

/**
 * Every kind of stored body a `common/` link can be written in is read.
 *
 * One file per kind, so a kind the query stops reading is the one name missing
 * from the list rather than a count that is one short.
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

function linked(name: string) {
  return filled([[{ text: name, href: `/files/common/${name}` }]])
}

describe("referencedCommonFiles", () => {
  it("reads the documents, the news, the alert, the versions, the drafts and their datasets", async () => {
    const { id: documentId } = only(await db.insert(s.document).values({ slug: "about" })
      .returning({ id: s.document.id }))
    await db.insert(s.documentContent).values({
      documentId,
      locale: "ja",
      content: { title: "概要", body: "![](/files/common/document.png)" },
    })
    const { id: newsId } = only(await db.insert(s.news).values({}).returning({ id: s.news.id }))
    await db.insert(s.newsContent).values({
      newsId,
      locale: "en",
      content: { title: "News", body: "[here](/files/common/news.pdf)" },
    })
    await db.insert(s.alert).values({
      content: { body: { ja: "[資料](/files/common/alert.pdf)", en: "" } },
    })

    const researchId = await seedResearch(db, "hum0001")
    const datasetId = await seedDataset(db, researchId, "JGAD000001")
    const research = emptyResearchContent()
    await seedVersion(db, {
      researchId,
      number: 1,
      body: { summary: { ...research.summary, aims: { ja: linked("version.pdf"), en: filled([]) } } },
    })
    const { id: draftId } = only(await db.insert(s.researchDraft).values({
      researchId,
      content: { ...research, summary: { ...research.summary, methods: { ja: filled([]), en: linked("draft.pdf") } } },
      shareToken: "a-share-token",
    }).returning({ id: s.researchDraft.id }))
    await db.insert(s.draftDatasetEntry).values({
      draftId,
      datasetId,
      content: {
        ...emptyDatasetContent(),
        values: [{ keyId: "0b8e7a52-0000-4000-8000-000000000000", value: { kind: "text", text: { ja: linked("dataset.pdf"), en: filled([]) } } }],
      },
    })

    expect(await referencedCommonFiles(db)).toEqual([
      "alert.pdf",
      "dataset.pdf",
      "document.png",
      "draft.pdf",
      "news.pdf",
      "version.pdf",
    ])
  })

  it("lists a name linked from several bodies once", async () => {
    const researchId = await seedResearch(db, "hum0001")
    for (const number of [1, 2]) {
      await seedVersion(db, {
        researchId,
        number,
        body: { releaseNote: { ja: linked("shared.pdf"), en: linked("shared.pdf") } },
      })
    }

    expect(await referencedCommonFiles(db)).toEqual(["shared.pdf"])
  })

  it("reads nothing from an empty database", async () => {
    expect(await referencedCommonFiles(db)).toEqual([])
  })
})
