import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyResearchContent, filled } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedDataset, seedResearch, seedVersion } from "~/db/seed"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { adminResearchIndex } from "./queries.server"

/**
 * What the admin research listing shows for a research: **the public listing's
 * values** while a version is out — its datasets, its date published and its
 * date modified — and the draft's while none is.
 */
const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

async function seedDraft(researchId: string, updatedAt: Date): Promise<void> {
  await db.insert(s.researchDraft).values({
    researchId,
    content: { ...emptyResearchContent(), title: { ja: filled("下書きの題目"), en: filled("Draft title") } },
    shareToken: `share-${researchId}`,
    createdAt: updatedAt,
    updatedAt,
  })
}

async function rowOf(researchId: string) {
  const row = (await adminResearchIndex(db)).find((one) => one.researchId === researchId)
  if (row === undefined) throw new Error("expected the research in the listing")
  return row
}

describe("a research with a version out", () => {
  it("shows the datasets the latest version lists and still matches the ones only a draft has", async () => {
    const researchId = await seedResearch(db, "hum9001")
    const kept = await seedDataset(db, researchId, "JGAD900001")
    const dropped = await seedDataset(db, researchId, "JGAD900002")
    await seedDataset(db, researchId, "JGAD900003")
    await seedVersion(db, { researchId, number: 1, releaseDate: "2020-01-01", datasets: [{ datasetId: kept }, { datasetId: dropped }] })
    await seedVersion(db, { researchId, number: 2, releaseDate: "2021-05-01", datasets: [{ datasetId: kept }] })
    await seedDraft(researchId, new Date("2026-09-20T00:00:00Z"))
    await rebuildSearchDocs(db)

    const row = await rowOf(researchId)

    expect(row.datasets).toEqual([{ label: "JGAD900001", published: true }])
    expect(row.datasetLabels.toSorted()).toEqual(["JGAD900001", "JGAD900002", "JGAD900003"])
  })

  it("dates the row as the public listing does, whatever a draft has changed since", async () => {
    const researchId = await seedResearch(db, "hum9002")
    await seedVersion(db, { researchId, number: 1, releaseDate: "2020-01-01" })
    await seedVersion(db, { researchId, number: 2, releaseDate: "2021-05-01" })
    await seedDraft(researchId, new Date("2026-09-20T00:00:00Z"))

    const row = await rowOf(researchId)

    expect(row.publishedOn).toBe("2020-01-01")
    expect(row.updatedOn).toBe("2021-05-01")
  })

  it("orders the datasets by label with the numbers read as numbers, as the public listing does", async () => {
    const researchId = await seedResearch(db, "hum9003")
    const ten = await seedDataset(db, researchId, "hum9003.v10.freq")
    const nine = await seedDataset(db, researchId, "hum9003.v9.freq")
    await seedVersion(db, { researchId, number: 1, datasets: [{ datasetId: ten }, { datasetId: nine }] })
    await rebuildSearchDocs(db)

    const row = await rowOf(researchId)

    expect(row.datasets.map((one) => one.label)).toEqual(["hum9003.v9.freq", "hum9003.v10.freq"])
  })
})

describe("a research never out", () => {
  it("shows every pinned dataset as not published and dates the row by its draft", async () => {
    const researchId = await seedResearch(db, "hum9004")
    await db.update(s.research).set({ createdAt: new Date("2026-09-01T00:00:00Z") }).where(eq(s.research.id, researchId))
    await seedDataset(db, researchId, "JGAD900004")
    // 2026-09-25T20:00Z is 09-26 05:00 in Japan.
    await seedDraft(researchId, new Date("2026-09-25T20:00:00Z"))

    const row = await rowOf(researchId)

    expect(row.datasets).toEqual([{ label: "JGAD900004", published: false }])
    expect(row.publishedOn).toBeNull()
    expect(row.updatedOn).toBe("2026-09-26")
  })
})
