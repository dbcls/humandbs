import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { loadConfig, publicOrigin } from "~/config.server"
import { emptyDatasetContent } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedDataset, seedResearch, seedVersion } from "~/db/seed"
import { clearPrefix, putTestObject } from "~/files/_store"
import { PUBLIC_BUCKET, publicPrefix } from "~/files/prefix"
import { listPrefix } from "~/files/store.server"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { datasetUrlList, researchUrlList } from "./file-lists.server"

/**
 * The URL lists against the test database and the store, the way the pages are
 * tested: nothing unpublished comes out, and a secondary ID leads to the primary
 * one's list. The store is replaced only where it has to fail.
 */

vi.mock("~/files/store.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/files/store.server")>()
  return { ...actual, listPrefix: vi.fn(actual.listPrefix) }
})

const db = getDb()
const HUM = "hum7002"
const ORIGIN = publicOrigin(loadConfig(process.env).auth)

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterEach(async () => {
  await clearPrefix(PUBLIC_BUCKET, publicPrefix(HUM))
})

afterAll(async () => {
  await closePools()
})

async function caught(load: () => Promise<unknown>): Promise<Response> {
  try {
    await load()
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    throw thrown
  }
  throw new Error("expected the load to throw")
}

async function published(): Promise<{ researchId: string, datasetId: string }> {
  const researchId = await seedResearch(db, HUM)
  const datasetId = await seedDataset(db, researchId, "NHA900001")
  await seedVersion(db, {
    researchId,
    number: 1,
    datasets: [{ datasetId, content: { ...emptyDatasetContent(), fileSelection: ["b.zip", "gone.zip"] } }],
  })
  await rebuildSearchDocs(db)
  await putTestObject(PUBLIC_BUCKET, `${publicPrefix(HUM)}a b.zip`, "1")
  await putTestObject(PUBLIC_BUCKET, `${publicPrefix(HUM)}b.zip`, "1")
  return { researchId, datasetId }
}

describe("researchUrlList", () => {
  it("lists every public file of the research, one address to a line, saved under its label", async () => {
    await published()

    const response = await researchUrlList(HUM)

    expect(await response.text()).toBe(`${ORIGIN}/files/${HUM}/a%20b.zip\n${ORIGIN}/files/${HUM}/b.zip\n`)
    expect(response.headers.get("Content-Disposition")).toContain(`${HUM}-files.txt`)
  })

  it("is the same 404 for a research with nothing published as for one that does not exist", async () => {
    await seedResearch(db, HUM)

    expect((await caught(() => researchUrlList(HUM))).status).toBe(404)
    expect((await caught(() => researchUrlList("hum7999"))).status).toBe(404)
  })

  it("leads a secondary hum label to the list of the primary one", async () => {
    const { researchId } = await published()
    await db.insert(s.labelPin).values({ kind: "hum", label: "hun7002", researchId, isPrimary: false })

    const redirect = await caught(() => researchUrlList("hun7002"))

    expect(redirect.status).toBe(302)
    expect(redirect.headers.get("Location")).toBe(`/research/${HUM}/files.txt`)
  })

  it("responds 503 rather than an empty list when the store does not respond", async () => {
    await published()
    vi.mocked(listPrefix).mockRejectedValueOnce(new Error("ECONNREFUSED"))

    expect((await caught(() => researchUrlList(HUM))).status).toBe(503)
  })
})

describe("datasetUrlList", () => {
  it("lists the files the dataset selects that the prefix holds", async () => {
    await published()

    const response = await datasetUrlList("NHA900001")

    expect(await response.text()).toBe(`${ORIGIN}/files/${HUM}/b.zip\n`)
    expect(response.headers.get("Content-Disposition")).toContain("NHA900001-files.txt")
  })

  it("is a 404 for a dataset no published version lists", async () => {
    const researchId = await seedResearch(db, HUM)
    await seedDataset(db, researchId, "NHA900001")

    expect((await caught(() => datasetUrlList("NHA900001"))).status).toBe(404)
  })
})
