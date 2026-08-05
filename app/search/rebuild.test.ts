import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent } from "~/content/empty"
import { getDb, getPool } from "~/db/client.server"
import * as s from "~/db/schema"

import { rebuildSearchDocs } from "./rebuild.server"

/**
 * These run against the development database, so they need `docker compose up`.
 */
const db = getDb()

beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE research, dataset, content_key, vocabulary_set, facet_category CASCADE
  `)
})

afterAll(async () => {
  await getPool().end()
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

async function createDataset(researchId: string, label: string): Promise<string> {
  const { id } = only(await db.insert(s.dataset).values({ researchId })
    .returning({ id: s.dataset.id }))
  await db.insert(s.labelPin).values({ kind: "dataset", label, datasetId: id, isPrimary: true })
  await db.insert(s.datasetContent).values({ datasetId: id, content: emptyDatasetContent() })
  return id
}

async function publish(
  researchId: string,
  number: number,
  datasetIds: string[],
  releaseDate = "2020-01-01",
): Promise<string> {
  const { id: snapshotId } = only(await db.insert(s.contentSnapshot)
    .values({ researchId, content: { ...emptyResearchContent(), datasetIds } })
    .returning({ id: s.contentSnapshot.id }))
  const { id } = only(await db.insert(s.researchVersion)
    .values({ researchId, number, snapshotId, releaseDate })
    .returning({ id: s.researchVersion.id }))
  return id
}

async function docs() {
  return db.select({
    targetType: s.searchDoc.targetType,
    targetId: s.searchDoc.targetId,
    humLabel: s.searchDoc.humLabel,
    versionNumber: s.searchDoc.versionNumber,
    datasetLabel: s.searchDoc.datasetLabel,
    datePublished: s.searchDoc.datePublished,
    dateModified: s.searchDoc.dateModified,
  }).from(s.searchDoc)
}

describe("rebuildSearchDocs", () => {
  it("lists a research, each published version, and the datasets they list", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [datasetId])

    const counts = await rebuildSearchDocs(db)

    expect(counts).toMatchObject({ research: 1, researchVersions: 1, datasets: 1 })
    expect(await docs()).toHaveLength(3)
  })

  it("dates a research from its earliest and latest published version", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], "2015-03-01")
    await publish(researchId, 2, [], "2021-09-30")

    await rebuildSearchDocs(db)

    const row = only((await docs()).filter((d) => d.targetType === "research"))
    expect(row.datePublished).toBe("2015-03-01")
    expect(row.dateModified).toBe("2021-09-30")
  })

  it("stops listing a version that has been withdrawn", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [])
    const withdrawn = await publish(researchId, 2, [])
    await db.update(s.researchVersion).set({ published: false }).where(eq(s.researchVersion.id, withdrawn))

    await rebuildSearchDocs(db)

    const versions = (await docs()).filter((d) => d.targetType === "research-version")
    expect(versions.map((v) => v.versionNumber)).toEqual([1])
  })

  it("leaves a research with nothing published out entirely", async () => {
    await createResearch("hum0001")

    await rebuildSearchDocs(db)

    expect(await docs()).toEqual([])
  })

  it("stops listing an orphaned dataset but keeps its content", async () => {
    const researchId = await createResearch("hum0001")
    await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [])

    await rebuildSearchDocs(db)

    expect((await docs()).filter((d) => d.targetType === "dataset")).toEqual([])
    expect(await db.select().from(s.datasetContent)).toHaveLength(1)
  })

  it("carries the ancestors of a term so a broad code matches a narrow one", async () => {
    const researchId = await createResearch("hum0001")
    const { id: setId } = only(await db.insert(s.vocabularySet)
      .values({ code: "icd10", labelJa: "ICD10", labelEn: "ICD10", source: "external", hierarchical: true })
      .returning({ id: s.vocabularySet.id }))
    const { id: parentId } = only(await db.insert(s.vocabularyTerm)
      .values({ setId, code: "E11", labelEn: "E11", source: "external" })
      .returning({ id: s.vocabularyTerm.id }))
    const { id: childId } = only(await db.insert(s.vocabularyTerm)
      .values({ setId, code: "E11.9", labelEn: "E11.9", parentId, source: "external" })
      .returning({ id: s.vocabularyTerm.id }))
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({ code: "disease", scope: "experiment", valueType: "vocabulary", labelJa: "疾患", labelEn: "Disease", vocabularySetId: setId })
      .returning({ id: s.contentKey.id }))

    const datasetId = await createDataset(researchId, "JGAD000001")
    await db.update(s.datasetContent).set({
      content: {
        ...emptyDatasetContent(),
        experiments: [{
          id: "experiment-1",
          label: { state: "value", value: "WES" },
          values: [{ keyId, slot: { state: "value", value: { kind: "vocabulary", termIds: [childId] } } }],
        }],
      },
    }).where(eq(s.datasetContent.datasetId, datasetId))
    await publish(researchId, 1, [datasetId])

    const counts = await rebuildSearchDocs(db)

    expect(counts.facetTerms).toBe(1)
    const facet = only(await db.select().from(s.searchFacetTerm))
    expect(facet.termId).toBe(childId)
    expect(facet.ancestorIds).toEqual([parentId])
  })

  it("produces the same rows when run again", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [datasetId])

    await rebuildSearchDocs(db)
    const first = await docs()
    await rebuildSearchDocs(db)
    const second = await docs()

    expect(second).toEqual(first)
  })
})
