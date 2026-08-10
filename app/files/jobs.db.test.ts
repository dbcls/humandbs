import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { PRIVATE_BUCKET, PUBLIC_BUCKET, privatePrefix, publicPrefix } from "./box"
import {
  claimJob,
  forgetSwitches,
  pendingSwitches,
  privateNames,
  reconcile,
  recoverAbandoned,
  requestBoxMove,
  requestSwitch,
  runOneJob,
  settleJob,
  switchFiles,
} from "./jobs.server"
import { clearPrefix, keysUnder, putTestObject } from "./_store"

/**
 * Moving a file between the buckets, against the real database and the real
 * store.
 *
 * The store is not stood in for. Which bucket an object is in **is** the
 * published state, so a test that decided the answer itself would be testing
 * nothing — and the two operations that matter here, a copy that is not atomic
 * and a delete that follows it, only behave like themselves against something
 * that actually holds objects.
 */
const db = getDb()

const CURATOR = { sub: "0f3a-1b2c", name: "curator" }

let researchId = ""
let humLabel = ""
let boxes: { bucket: typeof PUBLIC_BUCKET | typeof PRIVATE_BUCKET, prefix: string }[] = []

function only<T>(rows: T[]): T {
  const [row] = rows
  if (row === undefined) throw new Error("expected exactly one row")
  return row
}

/** A label of its own per test, so one test's box is never another's. */
let counter = 0

async function research(label: string | null = null): Promise<void> {
  researchId = only(await db.insert(s.research).values({}).returning({ id: s.research.id })).id
  if (label === null) {
    humLabel = ""
    boxes = [{ bucket: PRIVATE_BUCKET, prefix: privatePrefix(researchId) }]
    return
  }
  humLabel = label
  await db.insert(s.labelPin).values({ kind: "hum", label, researchId, isPrimary: true })
  boxes = [
    { bucket: PRIVATE_BUCKET, prefix: privatePrefix(researchId) },
    { bucket: PUBLIC_BUCKET, prefix: publicPrefix(label) },
  ]
}

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
  counter += 1
})

afterEach(async () => {
  for (const box of boxes) await clearPrefix(box.bucket, box.prefix)
  boxes = []
})

afterAll(async () => {
  await closePools()
})

function label(): string {
  return `hum${String(9000 + counter).padStart(4, "0")}`
}

async function publicKeys(under = humLabel): Promise<string[]> {
  return keysUnder(PUBLIC_BUCKET, publicPrefix(under))
}

async function privateKeys(): Promise<string[]> {
  return keysUnder(PRIVATE_BUCKET, privatePrefix(researchId))
}

async function jobs() {
  return db.select().from(s.filePublishJob)
}

describe("the queue", () => {
  it("holds one row per file, so a second answer replaces the first", async () => {
    await research(label())

    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "publish" }])
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "unpublish" }])

    const rows = await jobs()
    expect(rows).toHaveLength(1)
    expect(only(rows).action).toBe("unpublish")
  })

  it("refuses a second row for the same file even when the queue is written to directly", async () => {
    await research(label())
    await db.insert(s.filePublishJob).values({ researchId, fileName: "a.zip", action: "publish" })

    await expect(
      db.insert(s.filePublishJob).values({ researchId, fileName: "a.zip", action: "unpublish" }),
    ).rejects.toThrow()
  })

  it("keeps a file that is being copied marked as running, so nobody starts it twice", async () => {
    await research(label())
    await db.insert(s.filePublishJob)
      .values({ researchId, fileName: "a.zip", action: "publish", state: "running" })

    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "unpublish" }])

    const row = only(await jobs())
    expect(row.state).toBe("running")
    expect(row.action).toBe("unpublish")
  })

  it("clears the failure count when the same file is asked for again", async () => {
    await research(label())
    await db.insert(s.filePublishJob).values({
      researchId,
      fileName: "a.zip",
      action: "publish",
      state: "failed",
      attempts: 5,
      lastError: "something",
    })

    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "publish" }])

    const row = only(await jobs())
    expect(row.state).toBe("pending")
    expect(row.attempts).toBe(0)
    expect(row.lastError).toBeNull()
  })

  it("records who switched a file in the same transaction as the switch", async () => {
    await research(label())

    await switchFiles(db, [{ researchId, fileName: "a.zip", action: "publish" }], CURATOR)

    const event = only(await db.select().from(s.event))
    expect(event.action).toBe("publish-file")
    expect(event.subjectId).toBe("a.zip")
    expect(event.actorSub).toBe(CURATOR.sub)
  })

  it("forgets the destination of a file that is no longer there", async () => {
    await research(label())
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "publish" }])

    await forgetSwitches(db, researchId, ["a.zip"])

    expect(await jobs()).toHaveLength(0)
  })

  it("says which switches have not finished, and which of them failed", async () => {
    await research(label())
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "publish" }])
    await db.update(s.filePublishJob).set({ state: "failed" })
      .where(eq(s.filePublishJob.fileName, "a.zip"))

    expect(await pendingSwitches(db, researchId))
      .toEqual([{ fileName: "a.zip", action: "publish", failed: true }])
  })
})

describe("running a switch", () => {
  it("moves the file into the public bucket and takes the private copy away", async () => {
    await research(label())
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "publish" }])

    expect(await runOneJob(db)).toBe(true)

    expect(await publicKeys()).toEqual([`${publicPrefix(humLabel)}a.zip`])
    expect(await privateKeys()).toEqual([])
    expect(await jobs()).toHaveLength(0)
  })

  it("moves it back into the private bucket, and a reader no longer has an address", async () => {
    await research(label())
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}a.zip`)
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "unpublish" }])

    await runOneJob(db)

    expect(await publicKeys()).toEqual([])
    expect(await privateKeys()).toEqual([`${privatePrefix(researchId)}a.zip`])
  })

  it("leaves the file in one bucket when a previous attempt left it in both", async () => {
    await research(label())
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}a.zip`)
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "publish" }])

    await runOneJob(db)

    expect(await publicKeys()).toHaveLength(1)
    expect(await privateKeys()).toEqual([])
  })

  it("changes nothing the second time, so an attempt can always be repeated", async () => {
    await research(label())
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "publish" }])
    await runOneJob(db)

    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "publish" }])
    await runOneJob(db)

    expect(await publicKeys()).toEqual([`${publicPrefix(humLabel)}a.zip`])
    expect(await privateKeys()).toEqual([])
  })

  it("takes nothing away when the file is in neither bucket", async () => {
    await research(label())
    await requestSwitch(db, [{ researchId, fileName: "gone.zip", action: "publish" }])

    await runOneJob(db)

    expect(await jobs()).toHaveLength(0)
    expect(await publicKeys()).toEqual([])
  })

  it("keeps the file where it is when no hum label gives it a public address", async () => {
    await research(null)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "publish" }])

    await runOneJob(db)

    expect(await privateKeys()).toEqual([`${privatePrefix(researchId)}a.zip`])
    const row = only(await jobs())
    expect(row.lastError).toMatch(/no hum label/)
  })

  it("sends the file the other way when the destination changed while it was copying", async () => {
    await research(label())
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "publish" }])
    await runOneJob(db)
    // The row is gone, which is what "the answer still matches" means; a
    // changed answer is the same thing seen from the other side.
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "unpublish" }])

    await runOneJob(db)

    expect(await publicKeys()).toEqual([])
    expect(await privateKeys()).toEqual([`${privatePrefix(researchId)}a.zip`])
  })

  it("answers false when there is nothing waiting", async () => {
    await research(label())

    expect(await runOneJob(db)).toBe(false)
  })

  it("puts an attempt abandoned by a stopped process back into the queue", async () => {
    await research(label())
    await db.insert(s.filePublishJob).values({
      researchId,
      fileName: "a.zip",
      action: "publish",
      state: "running",
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    })

    expect(await recoverAbandoned(db)).toBe(1)
    expect(only(await jobs()).state).toBe("pending")
  })

  it("leaves an attempt that is still running alone", async () => {
    await research(label())
    await db.insert(s.filePublishJob)
      .values({ researchId, fileName: "a.zip", action: "publish", state: "running" })

    expect(await recoverAbandoned(db)).toBe(0)
  })
})

describe("renumbering a research", () => {
  it("queues every file in the old box to become public under the new label", async () => {
    await research(label())
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}a.zip`)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}b.zip`)

    await requestBoxMove(db, researchId, humLabel)

    expect((await jobs()).map((row) => row.fileName).toSorted()).toEqual(["a.zip", "b.zip"])
  })

  it("moves them into the new box and leaves nothing at the old address", async () => {
    const old = label()
    await research(old)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(old)}a.zip`)
    // What repinning does: the old label stays in the ledger as a secondary,
    // which is how the copy that has to move is found again.
    const moved = `${old}x`
    boxes.push({ bucket: PUBLIC_BUCKET, prefix: publicPrefix(moved) })
    await db.update(s.labelPin).set({ isPrimary: false })
      .where(eq(s.labelPin.researchId, researchId))
    await db.insert(s.labelPin)
      .values({ kind: "hum", label: moved, researchId, isPrimary: true })

    await requestBoxMove(db, researchId, old)
    await runOneJob(db)

    expect(await keysUnder(PUBLIC_BUCKET, publicPrefix(moved)))
      .toEqual([`${publicPrefix(moved)}a.zip`])
    expect(await keysUnder(PUBLIC_BUCKET, publicPrefix(old))).toEqual([])
  })
})

describe("what the publish gate is checked against", () => {
  it("reads the private bucket rather than anything the database holds", async () => {
    await research(label())
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}closed.zip`)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}open.zip`)

    expect([...await privateNames(researchId)]).toEqual(["closed.zip"])
  })
})

describe("a second opinion arriving mid-copy", () => {
  it("keeps the newer destination instead of the finished job deleting it", async () => {
    await research(label())
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "publish" }])

    const claimed = await claimJob(db)
    if (claimed === null) throw new Error("expected a job to claim")
    await reconcile(db, claimed)
    // While the bytes were being copied, somebody asked for the opposite.
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "unpublish" }])
    await settleJob(db, claimed)

    const row = only(await jobs())
    expect(row.action).toBe("unpublish")
    expect(row.state).toBe("pending")
  })

  it("converges on the last answer once that one runs too", async () => {
    await research(label())
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "publish" }])

    const claimed = await claimJob(db)
    if (claimed === null) throw new Error("expected a job to claim")
    await reconcile(db, claimed)
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "unpublish" }])
    await settleJob(db, claimed)
    await runOneJob(db)

    expect(await publicKeys()).toEqual([])
    expect(await privateKeys()).toEqual([`${privatePrefix(researchId)}a.zip`])
    expect(await jobs()).toHaveLength(0)
  })

  it("deletes the row when the destination is still the one it set out for", async () => {
    await research(label())
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
    await requestSwitch(db, [{ researchId, fileName: "a.zip", action: "publish" }])

    const claimed = await claimJob(db)
    if (claimed === null) throw new Error("expected a job to claim")
    await reconcile(db, claimed)
    await settleJob(db, claimed)

    expect(await jobs()).toHaveLength(0)
  })
})
