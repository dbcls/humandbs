import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { pinLabel, unpinLabel } from "./labels.server"

/**
 * The pin ledger, against the development database.
 *
 * Two things here can only be shown with a database. **A refused pin has to
 * leave the ledger untouched** — it demotes the standing primary on the way to
 * inserting, and a label that turns out to be taken must not leave that
 * demotion behind. And **taking a dataset id away has to take the dataset off
 * the versions that list it**, which happens through the search rows rather
 * than by rewriting any snapshot: what a version listed is a fact about that
 * version.
 */
const db = getDb()

const CURATOR = { sub: "0f3a-1b2c", name: "curator" }

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

async function createResearch(): Promise<string> {
  return only(await db.insert(s.research).values({}).returning({ id: s.research.id })).id
}

async function createDataset(researchId: string): Promise<string> {
  const { id } = only(await db.insert(s.dataset).values({ researchId })
    .returning({ id: s.dataset.id }))
  await db.insert(s.datasetContent).values({ datasetId: id, content: emptyDatasetContent() })
  return id
}

async function publish(researchId: string, datasetIds: string[]): Promise<void> {
  const { id: snapshotId } = only(await db.insert(s.contentSnapshot)
    .values({ researchId, content: { ...emptyResearchContent(), datasetIds } })
    .returning({ id: s.contentSnapshot.id }))
  await db.insert(s.researchVersion)
    .values({ researchId, number: 1, snapshotId, releaseDate: "2020-01-01" })
}

async function pins() {
  return db
    .select({ label: s.labelPin.label, isPrimary: s.labelPin.isPrimary })
    .from(s.labelPin)
    .orderBy(s.labelPin.label)
}

describe("pinning a label", () => {
  it("puts it in the ledger and derives the rows that name it", async () => {
    const researchId = await createResearch()
    await publish(researchId, [])

    const outcome = await pinLabel(
      db,
      { kind: "hum", label: "hum0001", subjectId: researchId, isPrimary: true },
      CURATOR,
    )

    expect(outcome).toEqual({ status: "pinned" })
    expect(await pins()).toEqual([{ label: "hum0001", isPrimary: true }])
    const docs = await db.select({ humLabel: s.searchDoc.humLabel }).from(s.searchDoc)
    expect(docs.map((row) => row.humLabel)).toEqual(["hum0001", "hum0001"])
  })

  it("trims what was typed, and refuses a label that is only spaces", async () => {
    const researchId = await createResearch()

    await pinLabel(
      db,
      { kind: "hum", label: "  hum0001 ", subjectId: researchId, isPrimary: true },
      CURATOR,
    )
    const refused = await pinLabel(
      db,
      { kind: "hum", label: "   ", subjectId: researchId, isPrimary: false },
      CURATOR,
    )

    expect(await pins()).toEqual([{ label: "hum0001", isPrimary: true }])
    expect(refused).toEqual({ status: "gone" })
  })

  it("makes the one it replaces secondary, so the old spelling keeps resolving", async () => {
    const researchId = await createResearch()
    await pinLabel(
      db,
      { kind: "hum", label: "hun0488", subjectId: researchId, isPrimary: true },
      CURATOR,
    )

    await pinLabel(
      db,
      { kind: "hum", label: "hum0488", subjectId: researchId, isPrimary: true },
      CURATOR,
    )

    expect(await pins()).toEqual([
      { label: "hum0488", isPrimary: true },
      { label: "hun0488", isPrimary: false },
    ])
  })

  it("refuses a label that already names something, and demotes nothing on the way", async () => {
    const mine = await createResearch()
    const other = await createResearch()
    await pinLabel(db, { kind: "hum", label: "hum0001", subjectId: mine, isPrimary: true }, CURATOR)
    await pinLabel(db, { kind: "hum", label: "hum0002", subjectId: other, isPrimary: true }, CURATOR)

    const outcome = await pinLabel(
      db,
      { kind: "hum", label: "hum0002", subjectId: mine, isPrimary: true },
      CURATOR,
    )

    expect(outcome).toEqual({ status: "taken" })
    expect(await pins()).toEqual([
      { label: "hum0001", isPrimary: true },
      { label: "hum0002", isPrimary: true },
    ])
    expect(await db.select().from(s.event)).toHaveLength(2)
  })

  it("refuses a label for an identity that is not there", async () => {
    const outcome = await pinLabel(
      db,
      {
        kind: "dataset",
        label: "JGAD000001",
        subjectId: "00000000-0000-4000-8000-000000000000",
        isPrimary: true,
      },
      CURATOR,
    )

    expect(outcome).toEqual({ status: "gone" })
    expect(await pins()).toEqual([])
  })
})

describe("taking a label away", () => {
  it("drops the dataset from the versions that list it, without touching a snapshot", async () => {
    const researchId = await createResearch()
    const datasetId = await createDataset(researchId)
    await publish(researchId, [datasetId])
    await pinLabel(
      db,
      { kind: "hum", label: "hum0001", subjectId: researchId, isPrimary: true },
      CURATOR,
    )
    await pinLabel(
      db,
      { kind: "dataset", label: "JGAD000001", subjectId: datasetId, isPrimary: true },
      CURATOR,
    )
    expect(await db.select().from(s.searchDoc)).toHaveLength(3)
    const snapshot = only(await db.select().from(s.contentSnapshot))

    const pin = only(await db.select().from(s.labelPin).where(eq(s.labelPin.kind, "dataset")))
    expect(await unpinLabel(db, pin.id, CURATOR)).toEqual({ status: "unpinned" })

    const left = await db.select({ type: s.searchDoc.targetType }).from(s.searchDoc)
    expect(left.map((row) => row.type).toSorted()).toEqual(["research", "research-version"])
    expect(only(await db.select().from(s.contentSnapshot)).content).toEqual(snapshot.content)
    // The description stays, so the dataset can be pinned again and come back.
    expect(await db.select().from(s.datasetContent)).toHaveLength(1)
  })

  it("frees the label to be used again", async () => {
    const first = await createResearch()
    const second = await createResearch()
    await pinLabel(db, { kind: "hum", label: "hum0001", subjectId: first, isPrimary: true }, CURATOR)
    const pin = only(await db.select().from(s.labelPin))

    await unpinLabel(db, pin.id, CURATOR)
    const outcome = await pinLabel(
      db,
      { kind: "hum", label: "hum0001", subjectId: second, isPrimary: true },
      CURATOR,
    )

    expect(outcome).toEqual({ status: "pinned" })
    expect(only(await db.select().from(s.labelPin)).researchId).toBe(second)
  })

  it("records what was taken away even after the identity is gone", async () => {
    const researchId = await createResearch()
    await pinLabel(
      db,
      { kind: "hum", label: "hum0001", subjectId: researchId, isPrimary: true },
      CURATOR,
    )
    const pin = only(await db.select().from(s.labelPin))
    await unpinLabel(db, pin.id, CURATOR)

    await db.delete(s.research).where(eq(s.research.id, researchId))

    const events = await db
      .select({ action: s.event.action, subjectId: s.event.subjectId })
      .from(s.event)
    expect(events).toEqual([
      { action: "pin-label", subjectId: "hum0001" },
      { action: "unpin-label", subjectId: "hum0001" },
    ])
  })

  it("answers that a pin is gone rather than pretending to remove it", async () => {
    const outcome = await unpinLabel(db, "00000000-0000-4000-8000-000000000000", CURATOR)

    expect(outcome).toEqual({ status: "gone" })
  })
})

describe("a dataset whose label was taken away", () => {
  it("comes back into the listings when it is pinned again", async () => {
    const researchId = await createResearch()
    const datasetId = await createDataset(researchId)
    await publish(researchId, [datasetId])
    await pinLabel(
      db,
      { kind: "hum", label: "hum0001", subjectId: researchId, isPrimary: true },
      CURATOR,
    )
    await rebuildSearchDocs(db)

    await pinLabel(
      db,
      { kind: "dataset", label: "JGAD000009", subjectId: datasetId, isPrimary: true },
      CURATOR,
    )

    const labels = await db.select({ label: s.searchDoc.datasetLabel }).from(s.searchDoc)
    expect(labels.filter((row) => row.label !== null)).toEqual([{ label: "JGAD000009" }])
  })
})
