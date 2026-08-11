import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import {
  apiBulk,
  apiSearch,
  datasetEntry,
  dblinkEntry,
  dblinkListing,
  researchEntry,
  researchVersionEntry,
} from "./pages.server"

/**
 * These go through the same functions the route modules call, against the
 * development database. What they are here for is the negative side of the
 * rules: nothing unpublished reaches an answer through any of the four ways in,
 * and the three ways of reaching one object agree about what it is.
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
  await db.insert(s.labelPin)
    .values({ kind: "hum", label: humLabel, researchId: id, isPrimary: true })
  return id
}

async function createDataset(researchId: string, label: string): Promise<string> {
  const { id } = only(await db.insert(s.dataset).values({ researchId })
    .returning({ id: s.dataset.id }))
  await db.insert(s.labelPin)
    .values({ kind: "dataset", label, datasetId: id, isPrimary: true })
  await db.insert(s.datasetContent).values({ datasetId: id, content: emptyDatasetContent() })
  return id
}

async function publish(
  researchId: string,
  number: number,
  datasetIds: string[],
  options: { published?: boolean, releaseDate?: string } = {},
): Promise<void> {
  const { id: snapshotId } = only(await db.insert(s.contentSnapshot)
    .values({ researchId, content: { ...emptyResearchContent(), datasetIds } })
    .returning({ id: s.contentSnapshot.id }))
  await db.insert(s.researchVersion).values({
    researchId,
    number,
    snapshotId,
    releaseDate: options.releaseDate ?? "2020-01-01",
    published: options.published ?? true,
  })
}

function get(path: string): Request {
  return new Request(`https://humandbs.dbcls.jp${path}`)
}

async function body(answer: Response): Promise<unknown> {
  return JSON.parse(await answer.text()) as unknown
}

async function lines(answer: Response): Promise<Record<string, unknown>[]> {
  const text = await answer.text()
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe("what the JSON API is allowed to answer with", () => {
  it("does not answer for a research that has never been published", async () => {
    await createResearch("hum0001")
    await rebuildSearchDocs(db)

    const answer = await researchEntry(get("/api/research/hum0001"), "hum0001", "latest")
    expect(answer.status).toBe(404)
  })

  it("answers a label nobody pinned exactly as it answers an unpublished one", async () => {
    await createResearch("hum0001")
    await rebuildSearchDocs(db)

    const unpublished = await researchEntry(get("/api/research/hum0001"), "hum0001", "latest")
    const absent = await researchEntry(get("/api/research/hum0001"), "hum9999", "latest")
    expect(await body(unpublished)).toEqual(await body(absent))
  })

  it("says why it refused in a sentence that does not name the label", async () => {
    // `instance` echoes the path the caller wrote, which tells them nothing they
    // did not already know. The sentence is fixed per kind of object, so two
    // refusals are the same refusal.
    const answer = await researchEntry(get("/api/research/hum0001"), "hum0001", "latest")
    const problem = await body(answer) as { detail: string, instance: string }
    expect(problem.detail).not.toContain("hum0001")
    expect(problem.instance).toBe("/api/research/hum0001")
  })

  it("does not answer for a version that was withdrawn", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [])
    await publish(researchId, 2, [], { published: false })
    await rebuildSearchDocs(db)

    expect((await researchVersionEntry(get("/x"), "hum0001", "v1")).status).toBe(200)
    expect((await researchVersionEntry(get("/x"), "hum0001", "v2")).status).toBe(404)
  })

  it("does not list an unpublished research in a search or in the bulk stream", async () => {
    const published = await createResearch("hum0001")
    await publish(published, 1, [])
    await createResearch("hum0002")
    await rebuildSearchDocs(db)

    const search = await body(await apiSearch(get("/api/research"), "research")) as {
      total: number
      hits: { id: string }[]
    }
    expect(search.total).toBe(1)
    expect(search.hits.map((hit) => hit.id)).toEqual(["hum0001"])
    expect((await lines(await apiBulk("research"))).map((row) => row.id)).toEqual(["hum0001"])
  })

  it("does not list a dataset whose research has no published version", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [datasetId], { published: false })
    await rebuildSearchDocs(db)

    expect((await datasetEntry(get("/x"), "JGAD000001")).status).toBe(404)
    expect(await lines(await apiBulk("dataset"))).toEqual([])
  })
})

describe("the three ways of reaching one object", () => {
  it("agree about what the object is", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [datasetId])
    await rebuildSearchDocs(db)

    const entry = await body(await researchEntry(get("/x"), "hum0001", "latest"))
    const search = await body(await apiSearch(get("/api/research"), "research")) as {
      hits: unknown[]
    }
    const [bulk] = await lines(await apiBulk("research"))
    expect(search.hits[0]).toEqual(entry)
    expect(bulk).toEqual(entry)
  })

  it("answers a superseded label without redirecting, under the current one", async () => {
    const researchId = await createResearch("hum0001")
    await db.insert(s.labelPin)
      .values({ kind: "hum", label: "hum0999", researchId, isPrimary: false })
    await publish(researchId, 1, [])
    await rebuildSearchDocs(db)

    const answer = await researchEntry(get("/x"), "hum0999", "latest")
    expect(answer.status).toBe(200)
    expect(await body(answer)).toEqual(await body(await researchEntry(get("/x"), "hum0001", "latest")))
  })
})

describe("every answer", () => {
  it("is open to any origin", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [])
    await rebuildSearchDocs(db)

    const answers = [
      await researchEntry(get("/x"), "hum0001", "latest"),
      await researchEntry(get("/x"), "hum9999", "latest"),
      await apiSearch(get("/api/research"), "research"),
      await apiBulk("research"),
      await dblinkListing(get("/x"), "humandbs"),
    ]
    for (const answer of answers) {
      expect(answer.headers.get("access-control-allow-origin")).toBe("*")
    }
  })

  it("says which of the two formats it is", async () => {
    expect((await apiBulk("research")).headers.get("content-type"))
      .toBe("application/x-ndjson; charset=utf-8")
    expect((await researchEntry(get("/x"), "hum9999", "latest")).headers.get("content-type"))
      .toBe("application/problem+json; charset=utf-8")
  })
})

describe("the correspondence supplied to DDBJ Search", () => {
  async function withUpstream(): Promise<void> {
    const published = await createResearch("hum0001")
    await publish(published, 1, [])
    await createResearch("hum0002")
    await rebuildSearchDocs(db)
    await db.insert(s.humAccession).values([
      { accession: "JGAD000001", humLabel: "hum0001", kind: "jga-dataset" },
      { accession: "JGAS000001", humLabel: "hum0001", kind: "jga-study" },
      { accession: "JGAD000002", humLabel: "hum0002", kind: "jga-dataset" },
    ])
  }

  it("leaves out an accession whose research the portal has not published", async () => {
    await withUpstream()
    const rows = await lines(await dblinkListing(get("/x"), "jga-dataset"))
    expect(rows.map((row) => row.identifier)).toEqual(["JGAD000001"])
  })

  it("answers for that accession the same as for one nobody has heard of", async () => {
    await withUpstream()
    const held = await body(await dblinkEntry(get("/x"), "jga-dataset", "JGAD000002")) as {
      dbXrefs: unknown[]
    }
    const absent = await body(await dblinkEntry(get("/x"), "jga-dataset", "JGAD999999")) as {
      dbXrefs: unknown[]
    }
    expect(held.dbXrefs).toEqual([])
    expect(held.dbXrefs).toEqual(absent.dbXrefs)
  })

  it("reports the label whose address answers, not the one upstream typed", async () => {
    const researchId = await createResearch("hum0001")
    await db.insert(s.labelPin)
      .values({ kind: "hum", label: "hum0O01", researchId, isPrimary: false })
    await publish(researchId, 1, [])
    await rebuildSearchDocs(db)
    await db.insert(s.humAccession)
      .values({ accession: "JGAD000001", humLabel: "hum0O01", kind: "jga-dataset" })

    const [row] = await lines(await dblinkListing(get("/x"), "humandbs"))
    expect(row?.identifier).toBe("hum0001")
  })

  it("refuses an accession type it does not cover", async () => {
    const answer = await dblinkListing(get("/api/dblink/bioproject"), "bioproject")
    expect(answer.status).toBe(422)
  })
})

describe("what apiSearch answers about its own parameters", () => {
  async function problemType(answer: Response): Promise<{ status: number, type: string }> {
    expect(answer.headers.get("content-type")).toBe("application/problem+json; charset=utf-8")
    const problem = await body(answer) as { status: number, type: string }
    return { status: problem.status, type: problem.type }
  }

  it("refuses a ?q= it cannot parse as a query with 422", async () => {
    const answer = await apiSearch(get("/api/research?q=%22unterminated"), "research")
    const { status, type } = await problemType(answer)
    expect(status).toBe(422)
    expect(type).toBe("https://humandbs.dbcls.jp/problems/invalid-query")
  })

  it("accepts a ?q= it can parse as a query with 200", async () => {
    await rebuildSearchDocs(db)
    const answer = await apiSearch(get("/api/research?q=title:cancer"), "research")
    expect(answer.status).toBe(200)
    expect(answer.headers.get("content-type")).toBe("application/json; charset=utf-8")
  })

  it("refuses sort=relevance when the query has no free-text word to score", async () => {
    await rebuildSearchDocs(db)
    const answer = await apiSearch(
      get("/api/research?q=date_published:2020-01-01&sort=relevance"),
      "research",
    )
    const { status, type } = await problemType(answer)
    expect(status).toBe(422)
    expect(type).toBe("https://humandbs.dbcls.jp/problems/invalid-sort")
  })

  it("accepts sort=relevance once the query carries a free-text word", async () => {
    await rebuildSearchDocs(db)
    const answer = await apiSearch(get("/api/research?q=cancer&sort=relevance"), "research")
    expect(answer.status).toBe(200)
  })

  it("refuses a negative page with 422", async () => {
    const answer = await apiSearch(get("/api/research?page=-1"), "research")
    const { status, type } = await problemType(answer)
    expect(status).toBe(422)
    expect(type).toBe("https://humandbs.dbcls.jp/problems/invalid-parameter")
  })

  it("refuses a non-integer page with 422", async () => {
    const answer = await apiSearch(get("/api/research?page=1.5"), "research")
    const { status, type } = await problemType(answer)
    expect(status).toBe(422)
    expect(type).toBe("https://humandbs.dbcls.jp/problems/invalid-parameter")
  })
})

/**
 * The usage records are a cache of an upstream table, and the key that matches
 * a cached row to that table is the one column in it no reader may see
 * (docs/data-model.md の「外部キャッシュ」). Types cannot hold that: the column
 * is there and the projection simply has to not carry it, so this is what says
 * it does not.
 */
describe("the usage project a cached usage record came from", () => {
  it("appears in no answer, though the row it came from carries it", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [])
    await db.insert(s.cauEntry).values({
      humLabel: "hum0001",
      applicationId: "J-DU000131",
      piNameJa: "山田 太郎",
      piNameEn: "Taro Yamada",
      affiliationJa: "研究科, 大学",
      affiliationEn: "School, University",
      country: "Japan",
      researchTitleJa: "課題",
      researchTitleEn: "Project",
      periodStart: "2023-04-10",
      periodEnd: "2024-03-31",
      datasetAccessions: ["JGAD000251"],
    })
    await rebuildSearchDocs(db)

    const answer = await researchEntry(get("/api/research/hum0001"), "hum0001", "latest")
    const text = await answer.clone().text()
    const research = await body(answer) as { controlledAccessUsers: Record<string, unknown>[] }

    expect(research.controlledAccessUsers).toHaveLength(1)
    expect(research.controlledAccessUsers[0]).not.toHaveProperty("applicationId")
    expect(text).not.toContain("J-DU000131")
    // The rest of the record is what the page shows, and it is all there.
    expect(text).toContain("Taro Yamada")
  })
})
