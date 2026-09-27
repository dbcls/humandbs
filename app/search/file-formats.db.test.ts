import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

/**
 * The file formats as the search has them: a column of the search row, read
 * off an archive's files for its datasets and off the selected names for the
 * datasets the portal issued, and filtered and counted like a vocabulary.
 */

import { searchFields } from "~/api/pages.server"
import { emptyDatasetContent } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedDataset, seedResearch, seedVersion } from "~/db/seed"
import { facetPanel } from "~/public/facets.server"

import { loadFacetDefinitions } from "./catalog.server"
import { countFormats } from "./counts.server"
import { parseQuery, type QueryNode } from "./dsl"
import { queryFields } from "./fields"
import { searchDocs, type SearchTarget } from "./query.server"
import { rebuildSearchDocs } from "./rebuild.server"

const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

/** Two researches: one with an archive's dataset and the portal's, one with an archive's dataset the refresh found no files for. */
async function seed(): Promise<void> {
  const first = await seedResearch(db, "hum0001")
  const jgad = await seedDataset(db, first, "JGAD000001")
  const nha = await seedDataset(db, first, "NHA000001")
  const second = await seedResearch(db, "hum0002")
  const dra = await seedDataset(db, second, "DRA000001")
  await seedVersion(db, {
    researchId: first,
    number: 1,
    datasets: [
      { datasetId: jgad },
      { datasetId: nha, content: { ...emptyDatasetContent(), fileSelection: ["hum0001.v1.AF.v1.txt.zip", "readme.html"] } },
    ],
  })
  await seedVersion(db, { researchId: second, number: 1, datasets: [{ datasetId: dra }] })
  await db.insert(s.accessionFileSummary).values({ accession: "JGAD000001", byteCount: 10, formats: ["fastq", "bam"], source: "jgad-file" })
  await rebuildSearchDocs(db)
}

async function formatsOf(target: "research" | "dataset"): Promise<Record<string, string[]>> {
  const rows = await db
    .select({ label: s.searchDoc.datasetLabel, hum: s.searchDoc.humLabel, formats: s.searchDoc.fileFormats })
    .from(s.searchDoc)
    .where(eq(s.searchDoc.targetType, target))
  return Object.fromEntries(rows.map((row) => [row.label ?? row.hum, row.formats]))
}

async function fieldsNow() {
  return queryFields((await loadFacetDefinitions(db)).map((one) => one.field))
}

async function ast(input: string): Promise<QueryNode | null> {
  const parsed = parseQuery(input, await fieldsNow())
  if (!parsed.ok) throw new Error(`${parsed.error.code} at ${parsed.error.column}`)
  return parsed.ast
}

async function labels(input: string, target: SearchTarget = "dataset"): Promise<string[]> {
  const result = await searchDocs(db, { target, ast: await ast(input), fields: await fieldsNow(), sort: "id", order: "asc", page: 1 })
  return result.hits.map((hit) => hit.datasetLabel ?? hit.humLabel)
}

describe("the rebuild", () => {
  it("reads an archive's dataset's formats off the refresh's row and the portal's off the names it selects, and gives a research its datasets' together", async () => {
    await seed()

    expect(await formatsOf("dataset")).toEqual({
      JGAD000001: ["fastq", "bam"],
      NHA000001: ["txt", "html"],
      DRA000001: [],
    })
    expect(await formatsOf("research")).toEqual({ hum0001: ["fastq", "bam", "txt", "html"], hum0002: [] })
  })

  it("takes a format's name into the text a word finds", async () => {
    await seed()

    expect(await labels("FASTQ")).toEqual(["JGAD000001"])
  })
})

describe("file-type in a query", () => {
  it("matches the rows that hold the format, whichever case it is written in, and a research by what its datasets hold", async () => {
    await seed()

    expect(await labels("file-type:fastq")).toEqual(["JGAD000001"])
    expect(await labels("file-type:HTML")).toEqual(["NHA000001"])
    expect(await labels("file-type:fastq", "research")).toEqual(["hum0001"])
    expect(await labels("NOT file-type:fastq")).toEqual(["DRA000001", "NHA000001"])
    expect(await labels("file-type:cram")).toEqual([])
  })

  it("refuses a pattern and a range, as a vocabulary does", async () => {
    const fields = await fieldsNow()
    expect(parseQuery("file-type:fast*", fields)).toMatchObject({ ok: false, error: { code: "invalid-operator-for-field" } })
    expect(parseQuery("file-type:[a TO b]", fields)).toMatchObject({ ok: false, error: { code: "invalid-operator-for-field" } })
  })
})

describe("the formats counted", () => {
  it("counts each format by the rows of the result that hold it", async () => {
    await seed()

    const counts = await countFormats(db, { target: "dataset", ast: null, fields: await fieldsNow() })
    expect(new Map(counts.map((row) => [row.code, row.count]))).toEqual(new Map([["fastq", 1], ["bam", 1], ["txt", 1], ["html", 1]]))
  })

  it("heads the data category of the panel, counted with its own condition lifted", async () => {
    await seed()
    // A category is drawn for the keys in it, so the data category needs one.
    const [data] = await db.insert(s.facetCategory)
      .values({ code: "data", labelJa: "データ", labelEn: "Data", position: 4 })
      .returning({ id: s.facetCategory.id })
    const [platforms] = await db.insert(s.vocabularySet)
      .values({ code: "platform", labelJa: "platform", labelEn: "platform", hierarchical: false })
      .returning({ id: s.vocabularySet.id })
    await db.insert(s.contentKey).values({
      code: "platform",
      scope: "experiment",
      valueType: "vocabulary",
      labelJa: "プラットフォーム",
      labelEn: "Platform",
      vocabularySetId: platforms?.id,
      facetCategoryId: data?.id,
      multiple: true,
    })
    const definitions = await loadFacetDefinitions(db)
    const fields = queryFields(definitions.map((one) => one.field))

    const panel = await facetPanel(db, {
      target: "dataset",
      ast: await ast("file-type:fastq"),
      fields,
      definitions,
      locale: "ja",
      sort: null,
      order: null,
      size: null,
      today: "2026-09-27",
    })

    const heading = panel.categories.find((one) => one.code === "data")
    expect(heading?.facets.map((one) => one.code)).toEqual(["file-type", "platform"])
    const box = heading?.facets[0]
    expect(box?.code).toBe("file-type")
    expect(box?.label).toBe("ファイル形式")
    expect(box?.values.map((one) => [one.label, one.count, one.selected])).toEqual([
      // The chosen first, then by how many rows each leaves, and by name among equals.
      ["FASTQ", 1, true],
      ["BAM", 1, false],
      ["HTML", 1, false],
      ["TXT", 1, false],
    ])
  })
})

describe("the fields a query can name", () => {
  it("lists the formats the published set holds under file-type, and no others", async () => {
    await seed()

    const { fields } = JSON.parse(await (await searchFields()).text()) as { fields: { code: string, values?: { code: string }[] }[] }
    const fileType = fields.find((one) => one.code === "file-type")
    expect(fileType?.values?.map((one) => one.code)).toEqual(["fastq", "bam", "txt", "html"])
  })
})
