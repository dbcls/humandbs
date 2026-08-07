import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { canonicalRedirect, datasetListPage, researchListPage } from "./lists.server"

/**
 * These go through the same functions the listing loaders call, against the
 * development database. What they are here for is the part the unit tests
 * cannot reach: that the set comes from the published rows, that the address
 * and the box agree, and that a condition the box cannot show is still shown.
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

async function createResearch(humLabel: string): Promise<string> {
  const { id } = only(await db.insert(s.research).values({}).returning({ id: s.research.id }))
  await db.insert(s.labelPin).values({ kind: "hum", label: humLabel, researchId: id, isPrimary: true })
  return id
}

async function createDataset(
  researchId: string,
  label: string,
  experimentLabel?: string,
): Promise<string> {
  const { id } = only(await db.insert(s.dataset).values({ researchId })
    .returning({ id: s.dataset.id }))
  await db.insert(s.labelPin).values({ kind: "dataset", label, datasetId: id, isPrimary: true })
  await db.insert(s.datasetContent).values({
    datasetId: id,
    content: experimentLabel === undefined
      ? emptyDatasetContent()
      : {
          ...emptyDatasetContent(),
          experiments: [{
            id: "experiment-1",
            label: { state: "value", value: experimentLabel },
            values: [],
          }],
        },
  })
  return id
}

async function publish(
  researchId: string,
  number: number,
  datasetIds: string[],
  title: string,
  options: { published?: boolean } = {},
): Promise<void> {
  const { id: snapshotId } = only(await db.insert(s.contentSnapshot)
    .values({
      researchId,
      content: {
        ...emptyResearchContent(),
        title: { state: "value", value: { ja: title, en: title } },
        datasetIds,
      },
    })
    .returning({ id: s.contentSnapshot.id }))
  await db.insert(s.researchVersion).values({
    researchId,
    number,
    snapshotId,
    releaseDate: "2020-01-01",
    published: options.published ?? true,
  })
}

function request(path: string) {
  return { locale: "ja" as const, url: new URL(`http://localhost${path}`) }
}

describe("the research listing", () => {
  it("shows only what is published, whichever way it is reached", async () => {
    const shown = await createResearch("hum0001")
    await publish(shown, 1, [], "公開された研究")
    const hidden = await createResearch("hum0002")
    await publish(hidden, 1, [], "未公開の研究", { published: false })
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research"))

    expect(view.rows.map((row) => row.humLabel)).toEqual(["hum0001"])
    expect((await researchListPage(request("/research?q=%E7%A0%94%E7%A9%B6"))).total).toBe(1)
  })

  it("finds a research by a word written inside one of its datasets", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001", "ATAC-seq")
    await publish(researchId, 1, [datasetId], "研究題目")
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research?q=ATAC-seq"))

    expect(view.rows.map((row) => row.humLabel)).toEqual(["hum0001"])
  })

  it("says how many the other listing matches for the same words", async () => {
    const researchId = await createResearch("hum0001")
    const first = await createDataset(researchId, "JGAD000001", "ATAC-seq")
    const second = await createDataset(researchId, "JGAD000002", "ATAC-seq")
    await publish(researchId, 1, [first, second], "研究題目")
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research?q=ATAC-seq"))

    expect(view.total).toBe(1)
    expect(view.otherCount).toBe(2)
  })

  it("leaves the other count out when nothing was searched for", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], "研究題目")
    await rebuildSearchDocs(db)

    expect((await researchListPage(request("/research"))).otherCount).toBeNull()
  })

  it("shows a condition the box cannot hold, with the address that removes it", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], "ゲノム解析")
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research?q=%E8%A7%A3%E6%9E%90+title%3A%E3%82%B2%E3%83%8E%E3%83%A0"))

    expect(view.keyword).toBe("解析")
    expect(view.conditions).toHaveLength(1)
    expect(view.conditions[0]?.label).toBe("研究題目: ゲノム")
    expect(view.conditions[0]?.href).toBe("/research?q=%E8%A7%A3%E6%9E%90")
  })

  it("answers a query it cannot read with the failure rather than with everything", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], "研究題目")
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research?q=%28"))

    expect(view.parseError?.code).toBe("unexpected-token")
    expect(view.rows).toEqual([])
    expect(view.total).toBe(0)
  })

  it("sorts by relevance when words were searched for and by date when they were not", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], "研究題目")
    await rebuildSearchDocs(db)

    expect((await researchListPage(request("/research"))).sort).toBe("dateModified")
    expect((await researchListPage(request("/research?q=%E7%A0%94%E7%A9%B6"))).sort).toBe("relevance")
    // Relevance has nothing to rank by without a query, so it is not offered.
    expect((await researchListPage(request("/research"))).sortOptions).not.toContain("relevance")
  })
})

describe("the dataset listing", () => {
  it("names the research each dataset belongs to", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [datasetId], "研究題目")
    await rebuildSearchDocs(db)

    const view = await datasetListPage(request("/dataset"))

    expect(view.rows.map((row) => [row.label, row.humLabel])).toEqual([["JGAD000001", "hum0001"]])
  })

  it("stops listing a dataset no published version points at", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [datasetId], "研究題目")
    await rebuildSearchDocs(db)
    await db.update(s.contentSnapshot).set({
      content: { ...emptyResearchContent(), datasetIds: [] },
    }).where(eq(s.contentSnapshot.researchId, researchId))
    await rebuildSearchDocs(db)

    expect((await datasetListPage(request("/dataset"))).total).toBe(0)
  })
})

describe("a search submitted from the box", () => {
  it("is answered with the address it should have, so it can be shared", () => {
    const answer = canonicalRedirect(
      new URL("http://localhost/research?k=NGS%28Exome%29"),
      "research",
      "ja",
    )
    expect(answer?.status).toBe(302)
    expect(answer?.headers.get("location")).toBe("/research?q=%22NGS%28Exome%29%22")
  })

  it("keeps the conditions the box does not show", () => {
    const answer = canonicalRedirect(
      new URL("http://localhost/research?k=%E8%A7%A3%E6%9E%90&q=title%3A%E3%82%B2%E3%83%8E%E3%83%A0"),
      "research",
      "ja",
    )
    const location = answer?.headers.get("location") ?? ""
    const written = new URL(location, "http://localhost").searchParams.get("q")
    expect(written).toBe("解析 AND title:ゲノム")
  })

  it("is left alone when the box was not used", () => {
    expect(canonicalRedirect(new URL("http://localhost/research?q=a"), "research", "ja")).toBeNull()
  })

  it("writes the address of the other language when that is where it came from", () => {
    const answer = canonicalRedirect(
      new URL("http://localhost/en/dataset?k=cancer"),
      "dataset",
      "en",
    )
    expect(answer?.headers.get("location")).toBe("/en/dataset?q=cancer")
  })
})
