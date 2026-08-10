import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { parseQuery, type QueryNode } from "./dsl"
import { BUILT_IN_ONLY } from "./fields"
import { countMatches, searchDocs, type SearchTarget, type SortKey } from "./query.server"

/**
 * These run against the development database, so they need `docker compose up`.
 */
const db = getDb()

function ast(input: string): QueryNode | null {
  const parsed = parseQuery(input, BUILT_IN_ONLY)
  if (!parsed.ok) throw new Error(`${parsed.error.code} at ${parsed.error.column}`)
  return parsed.ast
}

async function labels(
  input: string,
  target: SearchTarget = "research",
  sort: SortKey = "id",
): Promise<string[]> {
  const result = await searchDocs(db, { target, ast: ast(input), fields: BUILT_IN_ONLY, sort, page: 1 })
  return result.hits.map((hit) => hit.datasetLabel ?? hit.humLabel)
}

beforeAll(async () => {
  await emptyDatabase(getOwnerDb())
  const rows = [
    {
      humLabel: "hum0001",
      title: "糖尿病のゲノム解析 Genome analysis of diabetes",
      text: "全ゲノムシーケンス NGS(Exome)",
      datePublished: "2015-06-01",
      dateModified: "2019-03-20",
      datasetLabel: "JGAD000001",
    },
    {
      humLabel: "hum0002",
      title: "マウスの実験 Mouse study",
      text: "RNA-seq",
      datePublished: "2021-01-05",
      dateModified: null,
      datasetLabel: "JGAD000002",
    },
    {
      humLabel: "hum0003",
      title: "肝臓疾患 Liver disease",
      text: "全ゲノムシーケンス",
      datePublished: null,
      dateModified: null,
      datasetLabel: "JGAD000003",
    },
  ]
  for (const row of rows) {
    const [research] = await db.insert(s.research).values({}).returning({ id: s.research.id })
    if (research === undefined) throw new Error("insert failed")
    for (const targetType of ["research", "dataset"] as const) {
      await db.insert(s.searchDoc).values({
        targetType,
        targetId: crypto.randomUUID(),
        researchId: research.id,
        humLabel: row.humLabel,
        datasetLabel: targetType === "dataset" ? row.datasetLabel : null,
        title: row.title,
        datePublished: row.datePublished,
        dateModified: row.dateModified,
        textJa: `${row.humLabel} ${row.title} ${row.text}`,
        textEn: "",
      })
    }
  }
})

afterAll(async () => {
  await emptyDatabase(getOwnerDb())
  await closePools()
})

describe("running a query against the published set", () => {
  it("matches inside a word, which is what an accession and a product name need", async () => {
    expect(await labels("ゲノム")).toEqual(["hum0001", "hum0003"])
    expect(await labels("Exome")).toEqual(["hum0001"])
  })

  it("keeps punctuation in a value rather than reading it as syntax", async () => {
    expect(await labels("\"NGS(Exome)\"")).toEqual(["hum0001"])
  })

  it("means all of them for words next to each other, and any of them for OR", async () => {
    expect(await labels("糖尿病 ゲノム")).toEqual(["hum0001"])
    expect(await labels("糖尿病 OR 肝臓")).toEqual(["hum0001", "hum0003"])
  })

  it("counts a row that cannot answer as not matching, so NOT is the whole complement", async () => {
    const all = await labels("")
    const matching = await labels("ゲノム")
    const rest = await labels("NOT ゲノム")
    expect([...matching, ...rest].sort()).toEqual(all)
    // hum0003 has no dates at all, and still has to appear in the complement.
    expect(await labels("NOT date_published:2015-06-01")).toContain("hum0003")
  })

  it("scopes a field to the row's own label, and to the list being read", async () => {
    expect(await labels("id:hum0001")).toEqual(["hum0001"])
    expect(await labels("id:JGAD000001")).toEqual([])
    expect(await labels("id:JGAD000001", "dataset")).toEqual(["JGAD000001"])
  })

  it("reads a label without minding its case, since a citation may not", async () => {
    expect(await labels("id:HUM0001")).toEqual(["hum0001"])
  })

  it("takes a wildcard as a prefix and nothing more", async () => {
    expect(await labels("id:hum000*")).toEqual(["hum0001", "hum0002", "hum0003"])
  })

  it("holds a date range at both ends", async () => {
    expect(await labels("date_published:[2015-01-01 TO 2016-12-31]")).toEqual(["hum0001"])
    expect(await labels("date_published:2021-01-05")).toEqual(["hum0002"])
  })

  it("searches the title on its own when asked to", async () => {
    expect(await labels("title:マウス")).toEqual(["hum0002"])
    expect(await labels("title:ゲノム")).toEqual(["hum0001"])
  })

  it("answers the empty query with everything published", async () => {
    expect(await labels("")).toEqual(["hum0001", "hum0002", "hum0003"])
    expect(await countMatches(db, { target: "dataset", ast: null, fields: BUILT_IN_ONLY })).toBe(3)
  })
})

describe("the order rows come back in", () => {
  it("puts a row with no date after the ones that have one, in both directions", async () => {
    expect(await labels("", "research", "datePublished"))
      .toEqual(["hum0002", "hum0001", "hum0003"])
    expect(await labels("", "research", "dateModified"))
      .toEqual(["hum0001", "hum0002", "hum0003"])
  })

  it("never leaves two rows to swap places, so paging cannot repeat or skip one", async () => {
    const first = await searchDocs(db, { target: "research", ast: null, fields: BUILT_IN_ONLY, sort: "relevance", page: 1 })
    const again = await searchDocs(db, { target: "research", ast: null, fields: BUILT_IN_ONLY, sort: "relevance", page: 1 })
    expect(again.hits.map((hit) => hit.humLabel)).toEqual(first.hits.map((hit) => hit.humLabel))
  })

  it("holds a page inside the result rather than answering out of range", async () => {
    const page = await searchDocs(db, { target: "research", ast: null, fields: BUILT_IN_ONLY, sort: "id", page: 99 })
    expect(page.page).toBe(1)
    expect(page.total).toBe(3)
    expect(page.pageCount).toBe(1)
  })
})
