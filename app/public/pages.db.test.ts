import { eq, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { clearPrefix, putTestObject } from "~/files/_store"
import { PUBLIC_BUCKET, publicPrefix } from "~/files/box"

import { datasetPage, releaseListPage, researchPage } from "./pages.server"

/**
 * These go through the same functions the loaders call, against the development
 * database. What they are here for is the negative side of the rules: nothing
 * unpublished comes out, and a page has one address however it is reached.
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

const ja = { locale: "ja", filePage: 1 } as const

/** The thrown answer of a loader, so its status and headers can be read. */
async function caught(load: () => Promise<unknown>): Promise<Response> {
  try {
    await load()
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    throw thrown
  }
  throw new Error("expected the load to throw")
}

describe("a research page", () => {
  it("opens the highest-numbered published version when no version is named", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [])
    await publish(researchId, 4, [])
    await rebuildSearchDocs(db)

    const view = await researchPage({ ...ja, humId: "hum0001", wanted: "latest" })

    expect(view.versionNumber).toBe(4)
    expect(view.isLatest).toBe(true)
  })

  it("does not open a withdrawn version, and does not treat it as the latest", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [])
    await publish(researchId, 2, [], { published: false })
    await rebuildSearchDocs(db)

    expect((await researchPage({ ...ja, humId: "hum0001", wanted: "latest" })).versionNumber).toBe(1)
    expect((await caught(() => researchPage({ ...ja, humId: "hum0001", wanted: 2 }))).status).toBe(404)
  })

  it("does not open a research whose every version is withdrawn", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], { published: false })
    await rebuildSearchDocs(db)

    expect((await caught(() => researchPage({ ...ja, humId: "hum0001", wanted: "latest" }))).status)
      .toBe(404)
  })

  it("does not open a research that has never been published", async () => {
    await createResearch("hum0001")
    await rebuildSearchDocs(db)

    expect((await caught(() => researchPage({ ...ja, humId: "hum0001", wanted: "latest" }))).status)
      .toBe(404)
  })

  it("answers a label nobody pinned the same way as an unpublished one", async () => {
    expect((await caught(() => researchPage({ ...ja, humId: "hum9999", wanted: "latest" }))).status)
      .toBe(404)
  })

  it("redirects a secondary hum label to the address built from the primary one", async () => {
    const researchId = await createResearch("hum0001")
    await db.insert(s.labelPin)
      .values({ kind: "hum", label: "hun0001", researchId, isPrimary: false })
    await publish(researchId, 3, [])
    await rebuildSearchDocs(db)

    const redirect = await caught(() => researchPage({ ...ja, humId: "hun0001", wanted: 3 }))

    expect(redirect.status).toBe(302)
    expect(redirect.headers.get("location")).toBe("/research/hum0001/v3")
  })

  it("keeps the language of the address when it redirects", async () => {
    const researchId = await createResearch("hum0001")
    await db.insert(s.labelPin)
      .values({ kind: "hum", label: "hun0001", researchId, isPrimary: false })
    await publish(researchId, 1, [])
    await rebuildSearchDocs(db)

    const redirect = await caught(() =>
      researchPage({ locale: "en", humId: "hun0001", wanted: "latest", filePage: 1 }))

    expect(redirect.headers.get("location")).toBe("/en/research/hum0001")
  })

  it("leaves out a dataset that the version lists but that is no longer published", async () => {
    const researchId = await createResearch("hum0001")
    const listed = await createDataset(researchId, "JGAD000001")
    const orphan = await createDataset(researchId, "JGAD000002")
    await publish(researchId, 1, [listed, orphan])
    await rebuildSearchDocs(db)
    // Losing its published content is what takes a dataset off the public side.
    await db.execute(sql`DELETE FROM dataset_content WHERE dataset_id = ${orphan}`)
    await rebuildSearchDocs(db)

    const view = await researchPage({ ...ja, humId: "hum0001", wanted: "latest" })

    expect(view.datasets.map((row) => row.label)).toEqual(["JGAD000001"])
  })

  it("lists the datasets in the order the version lists them", async () => {
    const researchId = await createResearch("hum0001")
    const first = await createDataset(researchId, "JGAD000001")
    const second = await createDataset(researchId, "JGAD000002")
    await publish(researchId, 1, [second, first])
    await rebuildSearchDocs(db)

    const view = await researchPage({ ...ja, humId: "hum0001", wanted: "latest" })

    expect(view.datasets.map((row) => row.label)).toEqual(["JGAD000002", "JGAD000001"])
  })
})

describe("a release list", () => {
  it("leaves out withdrawn versions and compares across the gap they leave", async () => {
    const researchId = await createResearch("hum0001")
    const first = await createDataset(researchId, "JGAD000001")
    const second = await createDataset(researchId, "JGAD000002")
    await publish(researchId, 1, [first])
    await publish(researchId, 2, [first, second], { published: false })
    await publish(researchId, 3, [first, second])
    await rebuildSearchDocs(db)

    const view = await releaseListPage({ ...ja, humId: "hum0001" })

    expect(view.versions.map((version) => version.number)).toEqual([3, 1])
    expect(view.versions[0]?.addedDatasetLabels).toEqual(["JGAD000002"])
  })

  it("is not reachable for a research with no published version", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], { published: false })
    await rebuildSearchDocs(db)

    expect((await caught(() => releaseListPage({ ...ja, humId: "hum0001" }))).status).toBe(404)
  })
})

describe("a dataset page", () => {
  it("does not open a dataset that no published version lists", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [datasetId], { published: false })
    await rebuildSearchDocs(db)

    expect((await caught(() => datasetPage({ ...ja, datasetId: "JGAD000001" }))).status).toBe(404)
  })

  it("redirects a superseded dataset id to the one that is current", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "hum0001-NHA001")
    await db.insert(s.labelPin)
      .values({ kind: "dataset", label: "hum0001.v1.wgs.v1", datasetId, isPrimary: false })
    await publish(researchId, 1, [datasetId])
    await rebuildSearchDocs(db)

    const redirect = await caught(() => datasetPage({ ...ja, datasetId: "hum0001.v1.wgs.v1" }))

    expect(redirect.headers.get("location")).toBe("/dataset/hum0001-NHA001")
  })

  it("takes the dates of an external accession from the archive cache", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [datasetId])
    await db.insert(s.accessionDate).values({
      accession: "JGAD000001",
      datePublished: "2019-04-01",
      dateModified: "2022-08-09",
      source: "ddbj-search",
    })
    await rebuildSearchDocs(db)

    const view = await datasetPage({ ...ja, datasetId: "JGAD000001" })

    expect(view.datePublished).toBe("2019-04-01")
    expect(view.dateModified).toBe("2022-08-09")
  })

  it("prefers the date in the content for an id the portal issued itself", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "hum0001-NHA001")
    await db.update(s.datasetContent)
      .set({ content: { ...emptyDatasetContent(), releaseDate: "2021-06-30" } })
    await publish(researchId, 1, [datasetId])
    await db.insert(s.accessionDate).values({
      accession: "hum0001-NHA001",
      datePublished: "2019-04-01",
      dateModified: null,
      source: "ddbj-search",
    })
    await rebuildSearchDocs(db)

    expect((await datasetPage({ ...ja, datasetId: "hum0001-NHA001" })).datePublished)
      .toBe("2021-06-30")
  })
})

describe("the download list", () => {
  const HUM = "hum7001"

  afterEach(async () => {
    await clearPrefix(PUBLIC_BUCKET, publicPrefix(HUM))
  })

  it("is the public bucket listed, and holds nothing the research did not put there", async () => {
    const researchId = await createResearch(HUM)
    await publish(researchId, 1, [])
    await rebuildSearchDocs(db)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(HUM)}b.zip`, "12")
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(HUM)}a.zip`, "1")
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix("hum7999")}other.zip`)

    const view = await researchPage({ ...ja, humId: HUM, wanted: "latest" })

    expect(view.files.rows).toEqual([
      { name: "a.zip", size: 1, isPublic: true },
      { name: "b.zip", size: 2, isPublic: true },
    ])
    await clearPrefix(PUBLIC_BUCKET, publicPrefix("hum7999"))
  })

  it("cuts at a hundred names and says how many pages there are", async () => {
    const researchId = await createResearch(HUM)
    await publish(researchId, 1, [])
    await rebuildSearchDocs(db)
    for (let at = 0; at < 101; at += 1) {
      await putTestObject(PUBLIC_BUCKET, `${publicPrefix(HUM)}${String(at).padStart(4, "0")}.zip`)
    }

    const first = await researchPage({ ...ja, humId: HUM, wanted: "latest" })
    const second = await researchPage({ ...ja, humId: HUM, wanted: "latest", filePage: 2 })

    expect(first.files.rows).toHaveLength(100)
    expect(first.files.total).toBe(101)
    expect(first.files.pageCount).toBe(2)
    expect(second.files.rows).toHaveLength(1)
  })

  it("keeps only the dataset selections the box holds", async () => {
    const researchId = await createResearch(HUM)
    const datasetId = await createDataset(researchId, "JGAD000001")
    await db.update(s.datasetContent)
      .set({ content: { ...emptyDatasetContent(), fileSelection: ["a.zip", "gone.zip"] } })
      .where(eq(s.datasetContent.datasetId, datasetId))
    await publish(researchId, 1, [datasetId])
    await rebuildSearchDocs(db)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(HUM)}a.zip`, "1")

    const view = await datasetPage({ locale: "ja", datasetId: "JGAD000001" })

    expect(view.files).toEqual([{ name: "a.zip", size: 1, isPublic: true }])
  })
})
