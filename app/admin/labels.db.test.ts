import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedVersion } from "~/db/seed"
import { PUBLIC_BUCKET, publicPrefix } from "~/files/prefix"
import { clearPrefix, keysUnder, putTestObject } from "~/files/_store"
import { runOneJob } from "~/files/jobs.server"
import { listPrefix } from "~/files/store.server"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { issueNhaId, nextNhaId, pinLabel, promotePin, unpinLabel } from "./labels.server"

// The store is the boundary: it passes through, and a test can make one listing fail.
vi.mock("~/files/store.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/files/store.server")>()
  return { ...actual, listPrefix: vi.fn(actual.listPrefix) }
})

/**
 * The `label_pin` table, against the development database.
 *
 * Two things here can only be shown with a database. **A refused pin has to
 * leave the `label_pin` table untouched** — it demotes the standing primary on the way to
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
  return id
}

async function publish(researchId: string, datasetIds: string[]): Promise<void> {
  await seedVersion(db, {
    researchId,
    number: 1,
    datasets: datasetIds.map((datasetId) => ({ datasetId })),
  })
}

async function pins() {
  return db
    .select({ label: s.labelPin.label, isPrimary: s.labelPin.isPrimary })
    .from(s.labelPin)
    .orderBy(s.labelPin.label)
}

describe("pinning a label", () => {
  it("puts it in the `label_pin` table and derives the rows that name it", async () => {
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

  it("refuses a label that already identifies something, and demotes nothing on the way", async () => {
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
    const version = only(await db.select().from(s.researchVersion))

    const pin = only(await db.select().from(s.labelPin).where(eq(s.labelPin.kind, "dataset")))
    expect(await unpinLabel(db, pin.id, CURATOR)).toEqual({ status: "unpinned" })

    const left = await db.select({ type: s.searchDoc.targetType }).from(s.searchDoc)
    expect(left.map((row) => row.type).toSorted()).toEqual(["research", "research-version"])
    // What the version listed is a fact about that version, so unpinning the
    // label does not rewrite it: the dataset can be pinned again and come back.
    expect(only(await db.select().from(s.researchVersion)).content).toEqual(version.content)
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

  it("reports that a pin is gone rather than pretending to remove it", async () => {
    const outcome = await unpinLabel(db, "00000000-0000-4000-8000-000000000000", CURATOR)

    expect(outcome).toEqual({ status: "gone" })
  })
})

describe("issuing an NHA id", () => {
  async function primaryOf(datasetId: string): Promise<string | undefined> {
    const [pin] = await db.select({ label: s.labelPin.label }).from(s.labelPin)
      .where(eq(s.labelPin.datasetId, datasetId))
    return pin?.label
  }

  it("starts at NHA000001 and counts on across every research", async () => {
    const one = await createDataset(await createResearch())
    const two = await createDataset(await createResearch())

    expect(await issueNhaId(db, one, CURATOR)).toEqual({ status: "issued", label: "NHA000001" })
    expect(await issueNhaId(db, two, CURATOR)).toEqual({ status: "issued", label: "NHA000002" })
    expect(await primaryOf(two)).toBe("NHA000002")
  })

  it("reads the next number without taking it", async () => {
    const datasetId = await createDataset(await createResearch())

    expect(await nextNhaId(db)).toBe("NHA000001")
    expect(await nextNhaId(db)).toBe("NHA000001")
    expect(await issueNhaId(db, datasetId, CURATOR)).toEqual({ status: "issued", label: "NHA000001" })
    expect(await nextNhaId(db)).toBe("NHA000002")
  })

  it("never gives out a number again once it was unpinned, even the highest", async () => {
    const researchId = await createResearch()
    const [one, two] = [await createDataset(researchId), await createDataset(researchId)]
    await issueNhaId(db, one, CURATOR)
    await unpinLabel(db, only(await db.select().from(s.labelPin)).id, CURATOR)

    expect(await issueNhaId(db, two, CURATOR)).toEqual({ status: "issued", label: "NHA000002" })
  })

  it("never gives out a number again once the dataset holding it is gone", async () => {
    const researchId = await createResearch()
    const [one, two] = [await createDataset(researchId), await createDataset(researchId)]
    await issueNhaId(db, one, CURATOR)
    await db.delete(s.dataset).where(eq(s.dataset.id, one))

    expect(await pins()).toEqual([])
    expect(await issueNhaId(db, two, CURATOR)).toEqual({ status: "issued", label: "NHA000002" })
  })

  it("counts past an NHA id that reached the `label_pin` table without a record", async () => {
    const researchId = await createResearch()
    const [one, two] = [await createDataset(researchId), await createDataset(researchId)]
    await db.insert(s.labelPin).values({ kind: "dataset", label: "NHA000041", datasetId: one, isPrimary: true })

    expect(await issueNhaId(db, two, CURATOR)).toEqual({ status: "issued", label: "NHA000042" })
  })

  it("ignores every other spelling when counting", async () => {
    const researchId = await createResearch()
    const [a, b, c, d] = [
      await createDataset(researchId),
      await createDataset(researchId),
      await createDataset(researchId),
      await createDataset(researchId),
    ]
    await pinLabel(db, { kind: "dataset", label: "JGAD999999", subjectId: a, isPrimary: true }, CURATOR)
    await pinLabel(db, { kind: "dataset", label: "hum0014-NHA999", subjectId: b, isPrimary: true }, CURATOR)
    await pinLabel(db, { kind: "dataset", label: "NHA0000099", subjectId: c, isPrimary: true }, CURATOR)

    expect(await issueNhaId(db, d, CURATOR)).toEqual({ status: "issued", label: "NHA000001" })
  })

  it("gives two issues at the same moment two numbers", async () => {
    const researchId = await createResearch()
    const datasets = await Promise.all([1, 2, 3, 4, 5].map(() => createDataset(researchId)))

    const outcomes = await Promise.all(datasets.map((datasetId) => issueNhaId(db, datasetId, CURATOR)))

    const labels = outcomes.map((outcome) => outcome.status === "issued" ? outcome.label : outcome.status)
    expect(labels.toSorted()).toEqual(["NHA000001", "NHA000002", "NHA000003", "NHA000004", "NHA000005"])
  })

  it("refuses a dataset that already has a primary id, and writes nothing", async () => {
    const datasetId = await createDataset(await createResearch())
    await pinLabel(db, { kind: "dataset", label: "JGAD000001", subjectId: datasetId, isPrimary: true }, CURATOR)

    expect(await issueNhaId(db, datasetId, CURATOR)).toEqual({ status: "held" })
    expect(await pins()).toEqual([{ label: "JGAD000001", isPrimary: true }])
  })

  it("responds gone for a dataset that is not there", async () => {
    expect(await issueNhaId(db, "00000000-0000-4000-8000-000000000000", CURATOR)).toEqual({ status: "gone" })
  })

  it("keeps the NHA spelling out of reach of typing, whatever the number", async () => {
    const datasetId = await createDataset(await createResearch())

    expect(await pinLabel(db, { kind: "dataset", label: "NHA000001", subjectId: datasetId, isPrimary: true }, CURATOR))
      .toEqual({ status: "reserved" })
    expect(await pinLabel(db, { kind: "dataset", label: " NHA123456 ", subjectId: datasetId, isPrimary: true }, CURATOR))
      .toEqual({ status: "reserved" })
    expect(await pins()).toEqual([])
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

describe("renumbering a research", () => {
  const OLD = "hum5001"
  const NEW = "hum5002"

  afterEach(async () => {
    for (const label of [OLD, NEW]) await clearPrefix(PUBLIC_BUCKET, publicPrefix(label))
  })

  it("queues every file in the retired prefix to become public under the new label", async () => {
    const researchId = await createResearch()
    await pinLabel(db, { kind: "hum", label: OLD, subjectId: researchId, isPrimary: true }, CURATOR)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(OLD)}a.zip`)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(OLD)}b.zip`)

    await pinLabel(db, { kind: "hum", label: NEW, subjectId: researchId, isPrimary: true }, CURATOR)

    const queued = await db.select().from(s.filePublishJob)
    expect(queued.map((row) => row.fileName).toSorted()).toEqual(["a.zip", "b.zip"])
    expect(queued.every((row) => row.action === "publish")).toBe(true)
  })

  /**
   * The move is part of the pin. Committed apart, a store that did not respond
   * left the new label in place with the files in the old prefix, and pinning
   * again answered "taken" — nothing could queue the move any more.
   */
  it("pins nothing when the store does not respond, so pinning again still moves the prefix", async () => {
    const researchId = await createResearch()
    await pinLabel(db, { kind: "hum", label: OLD, subjectId: researchId, isPrimary: true }, CURATOR)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(OLD)}a.zip`)
    vi.mocked(listPrefix).mockRejectedValueOnce(new Error("the store did not answer"))

    await expect(pinLabel(db, { kind: "hum", label: NEW, subjectId: researchId, isPrimary: true }, CURATOR))
      .rejects.toThrow()
    expect(await pins()).toEqual([{ label: OLD, isPrimary: true }])
    expect(await db.select().from(s.filePublishJob)).toHaveLength(0)

    expect(await pinLabel(db, { kind: "hum", label: NEW, subjectId: researchId, isPrimary: true }, CURATOR))
      .toEqual({ status: "pinned" })
    expect(only(await db.select().from(s.filePublishJob)).fileName).toBe("a.zip")
  })

  it("promotes nothing when the store does not respond, so promoting again still moves the prefix", async () => {
    const researchId = await createResearch()
    await pinLabel(db, { kind: "hum", label: OLD, subjectId: researchId, isPrimary: true }, CURATOR)
    await pinLabel(db, { kind: "hum", label: NEW, subjectId: researchId, isPrimary: false }, CURATOR)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(OLD)}a.zip`)
    const pinId = only(await db.select().from(s.labelPin).where(eq(s.labelPin.label, NEW))).id
    vi.mocked(listPrefix).mockRejectedValueOnce(new Error("the store did not answer"))

    await expect(promotePin(db, pinId, CURATOR)).rejects.toThrow()
    expect(await pins()).toEqual([{ label: OLD, isPrimary: true }, { label: NEW, isPrimary: false }])
    expect(await db.select().from(s.filePublishJob)).toHaveLength(0)

    expect(await promotePin(db, pinId, CURATOR)).toEqual({ status: "promoted" })
    expect(only(await db.select().from(s.filePublishJob)).fileName).toBe("a.zip")
  })

  /**
   * Unpinned first and a new number pinned after, the old prefix is in the `label_pin` table
   * no more: nothing moved it, the new prefix stayed empty, and the old address
   * kept responding — for whichever research was given that number next.
   */
  it("refuses to take away a hum label whose public prefix still holds files", async () => {
    const researchId = await createResearch()
    await pinLabel(db, { kind: "hum", label: OLD, subjectId: researchId, isPrimary: true }, CURATOR)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(OLD)}a.zip`)
    const pin = only(await db.select().from(s.labelPin))

    expect(await unpinLabel(db, pin.id, CURATOR)).toEqual({ status: "holds-files" })
    expect(await pins()).toEqual([{ label: OLD, isPrimary: true }])
    expect((await db.select().from(s.event)).map((row) => row.action)).toEqual(["pin-label"])
  })

  it("takes the retired label away once the move has emptied its prefix", async () => {
    const researchId = await createResearch()
    await pinLabel(db, { kind: "hum", label: OLD, subjectId: researchId, isPrimary: true }, CURATOR)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(OLD)}a.zip`)
    await pinLabel(db, { kind: "hum", label: NEW, subjectId: researchId, isPrimary: true }, CURATOR)
    const retired = only(await db.select().from(s.labelPin).where(eq(s.labelPin.label, OLD)))

    // Still moving: the prefix is not empty yet.
    expect(await unpinLabel(db, retired.id, CURATOR)).toEqual({ status: "holds-files" })

    while (await runOneJob(db)) { /* until the move is done */ }
    expect(await keysUnder(PUBLIC_BUCKET, publicPrefix(NEW))).toEqual([`${publicPrefix(NEW)}a.zip`])
    expect(await unpinLabel(db, retired.id, CURATOR)).toEqual({ status: "unpinned" })
    expect(await pins()).toEqual([{ label: NEW, isPrimary: true }])
  })

  it("refuses to take away a hum label while a file of the research is still switching", async () => {
    const researchId = await createResearch()
    await pinLabel(db, { kind: "hum", label: OLD, subjectId: researchId, isPrimary: true }, CURATOR)
    await db.insert(s.filePublishJob).values({ researchId, fileName: "a.zip", action: "publish" })
    const pin = only(await db.select().from(s.labelPin))

    expect(await unpinLabel(db, pin.id, CURATOR)).toEqual({ status: "holds-files" })
    expect(await pins()).toEqual([{ label: OLD, isPrimary: true }])
  })

  it("queues nothing when the label being attached is not taking over from another", async () => {
    const researchId = await createResearch()

    await pinLabel(db, { kind: "hum", label: OLD, subjectId: researchId, isPrimary: true }, CURATOR)

    expect(await db.select().from(s.filePublishJob)).toHaveLength(0)
  })

  it("queues nothing for a dataset id, which addresses no prefix", async () => {
    const researchId = await createResearch()
    const datasetId = await createDataset(researchId)
    await pinLabel(
      db,
      { kind: "dataset", label: "JGAD000001", subjectId: datasetId, isPrimary: true },
      CURATOR,
    )

    await pinLabel(
      db,
      { kind: "dataset", label: "JGAD000002", subjectId: datasetId, isPrimary: true },
      CURATOR,
    )

    expect(await db.select().from(s.filePublishJob)).toHaveLength(0)
  })
})
