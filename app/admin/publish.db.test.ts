import { and, eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import {
  createDatasetInDraft,
  createDraft,
  createResearchWithDraft,
  saveDatasetEntry,
  saveDraftContent,
} from "./drafts.server"
import { publishDraft, publishPreview, republishVersion, withdrawVersion } from "./publish.server"
import { readDraft } from "./queries.server"

/**
 * The write path of publishing, against the development database.
 *
 * The negative side is what these are for. A publish does a great deal in one
 * transaction — descriptions, a version, the trail, the draft, the search rows
 * — and every way it can refuse has to leave **none** of it behind. The other
 * half is the pair of things that only a real database shows: that what the
 * public side reads is derived in the same transaction, and that a description
 * written over is still there afterwards.
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

function titled(title: string): ResearchContent {
  return { ...emptyResearchContent(), title: { ja: filled(title), en: filled(title) } }
}

function described(text: string): DatasetContent {
  return {
    ...emptyDatasetContent(),
    values: [{
      keyId: "type-of-data",
      value: { kind: "text", text: { ja: filled([[{ text }]]), en: filled([[{ text }]]) } },
    }],
  }
}

async function pinHum(researchId: string, label: string): Promise<void> {
  await db.insert(s.labelPin).values({ kind: "hum", label, researchId, isPrimary: true })
}

async function pinDataset(datasetId: string, label: string): Promise<void> {
  await db.insert(s.labelPin).values({ kind: "dataset", label, datasetId, isPrimary: true })
}

/** A research with a hum label, a draft, and one dataset that draft introduced. */
async function ready(options: { describe?: boolean } = {}) {
  const created = await createResearchWithDraft(db)
  await pinHum(created.researchId, "hum0001")
  await saveDraftContent(db, { draftId: created.draftId, revision: 1 }, {
    note: "",
    content: titled("研究"),
  })
  const made = await createDatasetInDraft(db, { draftId: created.draftId, revision: 2 }, created.researchId)
  if (made.status !== "created") throw new Error(made.status)
  // An id the portal issued, so that the upstream check has nothing to say
  // about it: an accession missing from the cache is upstream not knowing it.
  await pinDataset(made.datasetId, "hum0001-NHA001")
  if (options.describe !== false) {
    const saved = await saveDatasetEntry(
      db,
      { draftId: created.draftId, datasetId: made.datasetId, revision: null },
      described("記述"),
    )
    if (saved.status !== "saved") throw new Error(saved.status)
  }
  return { ...created, datasetId: made.datasetId, revision: 3 }
}

/** No file is waiting to be made public; the store is not reached from here. */
const NO_PRIVATE_FILES: ReadonlySet<string> = new Set()

const AS_VERSION = { kind: "version", releaseDate: "2026-08-10" } as const

async function counts() {
  const [versions, snapshots, drafts, contents, events, docs, replaced] = await Promise.all([
    db.select().from(s.researchVersion),
    db.select().from(s.contentSnapshot),
    db.select().from(s.researchDraft),
    db.select().from(s.datasetContent),
    db.select().from(s.event),
    db.select().from(s.searchDoc),
    db.select().from(s.replacedDatasetContent),
  ])
  return {
    versions: versions.length,
    snapshots: snapshots.length,
    drafts: drafts.length,
    contents: contents.length,
    events: events.length,
    docs: docs.length,
    replaced: replaced.length,
  }
}

describe("publishing a draft", () => {
  it("pins a version and puts it, its research and its datasets into the search rows", async () => {
    const ground = await ready()

    const outcome = await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    expect(outcome).toEqual({ status: "published", versionNumber: 1 })
    const version = only(await db.select().from(s.researchVersion))
    expect(version.number).toBe(1)
    expect(version.published).toBe(true)
    expect(version.releaseDate).toBe("2026-08-10")

    const docs = await db.select({ type: s.searchDoc.targetType }).from(s.searchDoc)
    expect(docs.map((row) => row.type).toSorted())
      .toEqual(["dataset", "research", "research-version"])
  })

  it("consumes the draft, and keeps the dataset that draft introduced", async () => {
    const ground = await ready()

    await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    expect(await readDraft(db, ground.draftId)).toBeNull()
    const dataset = only(await db.select().from(s.dataset))
    expect(dataset.id).toBe(ground.datasetId)
    expect(dataset.originDraftId).toBeNull()
  })

  it("takes with it a dataset the draft made and left off the version", async () => {
    const ground = await ready()
    const spare = await createDatasetInDraft(
      db,
      { draftId: ground.draftId, revision: ground.revision },
      ground.researchId,
    )
    if (spare.status !== "created") throw new Error(spare.status)
    await pinDataset(spare.datasetId, "JGAD000002")
    // Taking it off the listing leaves the identity behind, still the draft's.
    const draft = await readDraft(db, ground.draftId)
    await saveDraftContent(db, { draftId: ground.draftId, revision: draft?.revision ?? 0 }, {
      note: "",
      content: { ...titled("研究"), datasetIds: [ground.datasetId] },
    })

    const after = await readDraft(db, ground.draftId)
    await publishDraft(
      db,
      {
        at: { draftId: ground.draftId, revision: after?.revision ?? 0 },
        mode: AS_VERSION,
        acknowledged: true,
        privateFiles: NO_PRIVATE_FILES,
      },
      CURATOR,
    )

    const remaining = await db.select({ id: s.dataset.id }).from(s.dataset)
    expect(remaining.map((row) => row.id)).toEqual([ground.datasetId])
  })

  it("writes the description of every dataset the version lists", async () => {
    const ground = await ready()

    await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    const content = only(await db.select().from(s.datasetContent))
    expect(content.datasetId).toBe(ground.datasetId)
    expect(content.content).toEqual(described("記述"))
  })

  it("publishes a listed dataset nobody described as an empty one rather than as nothing", async () => {
    const ground = await ready({ describe: false })

    const outcome = await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    expect(outcome.status).toBe("published")
    expect(only(await db.select().from(s.datasetContent)).content).toEqual(emptyDatasetContent())
  })
})

describe("a publish that is refused", () => {
  it("writes nothing at all when the revision has moved", async () => {
    const ground = await ready()
    const before = await counts()

    const outcome = await publishDraft(
      db,
      {
        at: { draftId: ground.draftId, revision: ground.revision + 1 },
        mode: AS_VERSION,
        acknowledged: true,
        privateFiles: NO_PRIVATE_FILES,
      },
      CURATOR,
    )

    expect(outcome).toEqual({ status: "conflict" })
    expect(await counts()).toEqual(before)
  })

  it("writes nothing at all when a label that must be pinned is not", async () => {
    const ground = await ready()
    await db.delete(s.labelPin).where(eq(s.labelPin.kind, "hum"))
    const before = await counts()

    const outcome = await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    expect(outcome).toEqual({ status: "blocked", blocks: [{ kind: "hum-label-missing" }] })
    expect(await counts()).toEqual(before)
  })

  it("writes nothing at all while the listed findings have not been passed", async () => {
    const ground = await ready({ describe: false })
    const before = await counts()

    const outcome = await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: false, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    expect(outcome.status).toBe("unacknowledged")
    expect(await counts()).toEqual(before)
  })

  it("refuses a fix from a draft that came from no version", async () => {
    const ground = await ready()
    const before = await counts()

    const outcome = await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: { kind: "fix" }, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    expect(outcome).toEqual({ status: "no-parent" })
    expect(await counts()).toEqual(before)
  })
})

describe("publishing a fix", () => {
  it("leaves the number alone and points the version at a new snapshot", async () => {
    const ground = await ready()
    await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )
    const first = only(await db.select().from(s.researchVersion))

    const draftId = await createDraft(db, ground.researchId)
    await saveDraftContent(db, { draftId, revision: 1 }, {
      note: "",
      content: { ...titled("直した"), datasetIds: [ground.datasetId] },
    })
    const outcome = await publishDraft(
      db,
      { at: { draftId, revision: 2 }, mode: { kind: "fix" }, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    expect(outcome).toEqual({ status: "published", versionNumber: 1 })
    const after = only(await db.select().from(s.researchVersion))
    expect(after.number).toBe(1)
    expect(after.releaseDate).toBe(first.releaseDate)
    expect(after.snapshotId).not.toBe(first.snapshotId)
    // The one it pointed at before is still stored and no longer reachable.
    expect(await db.select().from(s.contentSnapshot)).toHaveLength(2)
  })

  it("keeps the description it wrote over, and only when there was one to keep", async () => {
    const ground = await ready()
    await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )
    expect(await db.select().from(s.replacedDatasetContent)).toHaveLength(0)

    const draftId = await createDraft(db, ground.researchId)
    await saveDatasetEntry(
      db,
      { draftId, datasetId: ground.datasetId, revision: null },
      described("直した記述"),
    )
    await publishDraft(
      db,
      { at: { draftId, revision: 1 }, mode: { kind: "fix" }, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    const kept = only(await db.select().from(s.replacedDatasetContent))
    expect(kept.content).toEqual(described("記述"))
    expect(only(await db.select().from(s.datasetContent)).content).toEqual(described("直した記述"))
  })

  it("says nothing about a dataset it did not change", async () => {
    const ground = await ready()
    await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    const draftId = await createDraft(db, ground.researchId)
    await saveDraftContent(db, { draftId, revision: 1 }, {
      note: "",
      content: { ...titled("題目だけ直した"), datasetIds: [ground.datasetId] },
    })
    await publishDraft(
      db,
      { at: { draftId, revision: 2 }, mode: { kind: "fix" }, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    const about = await db
      .select({ id: s.event.id })
      .from(s.event)
      .where(and(eq(s.event.subjectType, "dataset"), eq(s.event.subjectId, ground.datasetId)))
    // One event, from the publish that first described it, and nothing written
    // over: the first description replaced nothing and the fix touched nothing.
    expect(about).toHaveLength(1)
    expect(await db.select().from(s.replacedDatasetContent)).toHaveLength(0)
  })
})

describe("the trail a publish leaves", () => {
  it("records the version, the datasets it changed, and the gate it was let through", async () => {
    const ground = await ready({ describe: false })

    await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    const events = await db
      .select({ action: s.event.action, subjectType: s.event.subjectType, detail: s.event.detail })
      .from(s.event)
    // Consuming a draft by publishing it is not a discard: where it went is
    // what the version event says.
    expect(events.map((row) => row.action).toSorted())
      .toEqual(["pass-publish-gate", "publish-fix", "publish-version"])
    const passed = events.find((row) => row.action === "pass-publish-gate")
    expect(passed?.detail).toEqual({ passed: { "empty-dataset": 1 } })
  })

  it("names the person who did it rather than the fact that an administrator did", async () => {
    const ground = await ready()

    await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    const actors = await db.select({ sub: s.event.actorSub }).from(s.event)
    expect(new Set(actors.map((row) => row.sub))).toEqual(new Set([CURATOR.sub]))
  })
})

describe("taking a version out of sight", () => {
  it("removes it from the search rows and puts it back on request", async () => {
    const ground = await ready()
    await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )
    const version = only(await db.select().from(s.researchVersion))

    expect(await withdrawVersion(db, version.id, CURATOR)).toEqual({ status: "changed" })
    expect(await db.select().from(s.searchDoc)).toHaveLength(0)

    expect(await republishVersion(db, version.id, CURATOR)).toEqual({ status: "changed" })
    expect(await db.select().from(s.searchDoc)).toHaveLength(3)
  })

  it("records nothing when it is already the way it was asked to be", async () => {
    const ground = await ready()
    await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )
    const version = only(await db.select().from(s.researchVersion))
    const before = await counts()

    expect(await republishVersion(db, version.id, CURATOR)).toEqual({ status: "unchanged" })
    expect(await counts()).toEqual(before)
  })
})

describe("looking a publish over first", () => {
  it("counts what changes without writing any of it", async () => {
    const ground = await ready()
    const before = await counts()

    const preview = await publishPreview(db, ground.draftId, NO_PRIVATE_FILES)

    expect(preview?.nextNumber).toBe(1)
    expect(preview?.fixes).toBeNull()
    expect(preview?.listingAdded).toEqual([ground.datasetId])
    expect(preview?.datasetChanges).toEqual([{
      datasetId: ground.datasetId,
      fields: 0,
      affects: 1,
      affectsIfFix: null,
      isNew: true,
    }])
    expect(await counts()).toEqual(before)
  })

  it("finds nothing to change in a draft taken from the version it would follow", async () => {
    const ground = await ready()
    await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )
    const draftId = await createDraft(db, ground.researchId)

    const preview = await publishPreview(db, draftId, NO_PRIVATE_FILES)

    // The comparison is against the version this one would follow, and a copy
    // of it differs from it in nothing.
    expect(preview?.researchFields).toBe(0)
    expect(preview?.listingAdded).toEqual([])
    expect(preview?.listingRemoved).toEqual([])
    expect(preview?.datasetChanges).toEqual([])
    expect(preview?.gate.findings).toEqual([])
  })

  it("says a draft is behind when the version it came from has been replaced", async () => {
    const ground = await ready()
    await publishDraft(
      db,
      { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )
    const behind = await createDraft(db, ground.researchId)

    // Somebody else fixes the version this draft was taken from.
    const other = await createDraft(db, ground.researchId)
    await saveDraftContent(db, { draftId: other, revision: 1 }, {
      note: "",
      content: { ...titled("先に直した"), datasetIds: [ground.datasetId] },
    })
    await publishDraft(
      db,
      { at: { draftId: other, revision: 2 }, mode: { kind: "fix" }, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )

    const preview = await publishPreview(db, behind, NO_PRIVATE_FILES)
    expect(preview?.fixes).toBeNull()
    expect(preview?.stale).toEqual({ number: 1 })
  })
})
