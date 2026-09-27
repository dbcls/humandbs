import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedDataset, seedResearch, seedVersion } from "~/db/seed"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import type { Route } from "./+types/cart-rows"
import { loader } from "./cart-rows"

/**
 * The rows the cart's page asks for, against the test database: what is
 * published comes back as a row, and what was asked for comes back as asked,
 * so the page can tell one it looked for from one it has not fetched yet.
 */
const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

function asking(ids: string): Route.LoaderArgs {
  return {
    request: new Request(`http://localhost/cart/rows?ids=${encodeURIComponent(ids)}`),
    params: {},
  } as unknown as Route.LoaderArgs
}

async function published(...labels: string[]): Promise<void> {
  const researchId = await seedResearch(db, "hum0001")
  const datasetIds = []
  for (const label of labels) datasetIds.push(await seedDataset(db, researchId, label))
  await seedVersion(db, { researchId, number: 1, datasets: datasetIds.map((datasetId) => ({ datasetId })) })
  await rebuildSearchDocs(db)
}

describe("the cart's rows", () => {
  it("are the published ones of what was asked for, and what was asked for comes back with them", async () => {
    await published("JGAD000001", "JGAD000002")

    const answer = await loader(asking("JGAD000002,JGAD000009"))

    expect(answer.asked).toEqual(["JGAD000002", "JGAD000009"])
    expect(answer.rows.map((row) => row.label)).toEqual(["JGAD000002"])
  })

  it("have no row for a withdrawn one, which is still in what was asked for", async () => {
    await published("JGAD000001")
    await db.delete(s.researchVersion).where(eq(s.researchVersion.number, 1))
    await rebuildSearchDocs(db)

    const answer = await loader(asking("JGAD000001"))

    expect(answer.asked).toEqual(["JGAD000001"])
    expect(answer.rows).toEqual([])
  })

  it("give one row for an accession asked for twice", async () => {
    await published("JGAD000001")

    const answer = await loader(asking("JGAD000001,JGAD000001"))

    expect(answer.asked).toEqual(["JGAD000001"])
    expect(answer.rows).toHaveLength(1)
  })

  /** The cart holds only JGA datasets, so anything else was not put there by the page. */
  it("look nothing up for what a cart cannot hold, a NUL included, rather than failing on it", async () => {
    await published("JGAD000001")

    const answer = await loader(asking("JGAD000001,hum0001,JGAD000001\u0000x,"))

    expect(answer.asked).toEqual(["JGAD000001"])
    expect(answer.rows.map((row) => row.label)).toEqual(["JGAD000001"])
  })
})
