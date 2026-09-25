import { and, eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"
import { descriptionOf } from "~/content/version"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import {
  createDatasetInDraft,
  createEmptyDraft,
  createResearchWithDraft,
  draftCopiedFrom,
  draftUpdating,
  saveDatasetEntry,
  saveDraftContent,
} from "./drafts.server"
import { publishDraft, publishPreview, withdrawVersion } from "./publish.server"
import { readDraft } from "./queries.server"

/**
 * The write path of publishing, against the development database.
 *
 * The negative side is what these are for. A publish does a great deal in one
 * transaction — a version, the trail, the draft, the search rows — and every
 * way it can refuse has to leave **none** of it behind. The other half is what
 * only a real database shows: that what the public side reads is derived in the
 * same transaction, and that a version's row is never written over.
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
    content: titled("研究"),
  })
  const made = await createDatasetInDraft(db, { draftId: created.draftId, revision: 2 }, created.researchId)
  if (made.status !== "created") throw new Error(made.status)
  // An id the portal issued, so that the upstream check has nothing to report
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

const RELEASE_DATE = "2026-08-10"

function publish(at: { draftId: string, revision: number }, number = 1, releaseDate = RELEASE_DATE) {
  return publishDraft(
    db,
    { at, number, releaseDate, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
    CURATOR,
  )
}

/** The only version there is, and how it describes the only dataset it lists. */
async function theVersion() {
  return only(await db.select().from(s.researchVersion))
}

async function theDescription(): Promise<DatasetContent> {
  return descriptionOf(only((await theVersion()).content.datasets))
}

async function counts() {
  const [versions, drafts, events, docs] = await Promise.all([
    db.select().from(s.researchVersion),
    db.select().from(s.researchDraft),
    db.select().from(s.event),
    db.select().from(s.searchDoc),
  ])
  return {
    versions: versions.length,
    drafts: drafts.length,
    events: events.length,
    docs: docs.length,
  }
}

describe("publishing a draft", () => {
  it("writes a version and puts it, its research and its datasets into the search rows", async () => {
    const fixture = await ready()

    const outcome = await publish({ draftId: fixture.draftId, revision: fixture.revision })

    expect(outcome).toEqual({ status: "published", versionNumber: 1 })
    const version = await theVersion()
    expect(version.number).toBe(1)
    expect(version.releaseDate).toBe(RELEASE_DATE)

    const docs = await db.select({ type: s.searchDoc.targetType }).from(s.searchDoc)
    expect(docs.map((row) => row.type).toSorted())
      .toEqual(["dataset", "research", "research-version"])
  })

  it("consumes the draft, and keeps the dataset that draft introduced", async () => {
    const fixture = await ready()

    await publish({ draftId: fixture.draftId, revision: fixture.revision })

    expect(await readDraft(db, fixture.draftId)).toBeNull()
    const dataset = only(await db.select().from(s.dataset))
    expect(dataset.id).toBe(fixture.datasetId)
    expect(dataset.originDraftId).toBeNull()
  })

  it("publishes every dataset the research has, whatever the order names", async () => {
    const fixture = await ready()
    const spare = await createDatasetInDraft(
      db,
      { draftId: fixture.draftId, revision: fixture.revision },
      fixture.researchId,
    )
    if (spare.status !== "created") throw new Error(spare.status)
    await pinDataset(spare.datasetId, "JGAD000002")
    // The order names one of the two. The other is the research's all the same,
    // so the version has it — at the end, where what is unnamed remains.
    const draft = await readDraft(db, fixture.draftId)
    await saveDraftContent(db, { draftId: fixture.draftId, revision: draft?.revision ?? 0 }, {
      content: { ...titled("研究"), datasetIds: [fixture.datasetId] },
    })

    const after = await readDraft(db, fixture.draftId)
    await publish({ draftId: fixture.draftId, revision: after?.revision ?? 0 })

    const remaining = await db.select({ id: s.dataset.id }).from(s.dataset)
    expect(remaining.map((row) => row.id).toSorted())
      .toEqual([fixture.datasetId, spare.datasetId].toSorted())
    const version = await theVersion()
    expect(version.content.datasets.map((row) => row.datasetId))
      .toEqual([fixture.datasetId, spare.datasetId])
  })

  it("merges the description of every dataset the version lists into the version", async () => {
    const fixture = await ready()

    await publish({ draftId: fixture.draftId, revision: fixture.revision })

    const version = await theVersion()
    expect(version.content.datasets.map((row) => row.datasetId)).toEqual([fixture.datasetId])
    // The dataset has an NHA ID, so this publish also gives it the day the
    // version is going out on (below).
    expect(await theDescription()).toEqual({ ...described("記述"), releaseDate: RELEASE_DATE })
  })

  it("publishes a listed dataset nobody described as an empty one rather than as nothing", async () => {
    const fixture = await ready({ describe: false })

    const outcome = await publish({ draftId: fixture.draftId, revision: fixture.revision })

    expect(outcome.status).toBe("published")
    expect(await theDescription())
      .toEqual({ ...emptyDatasetContent(), releaseDate: RELEASE_DATE })
  })
})

/**
 * The one date the portal is master of. An NHA ID has no archive to request, and
 * the day the version goes out is the only day this publish knows.
 */
describe("the release date an NHA dataset is given", () => {
  it("is the day the version goes out, when the dataset has none of its own", async () => {
    const fixture = await ready()

    await publish({ draftId: fixture.draftId, revision: fixture.revision })

    expect((await theDescription()).releaseDate).toBe(RELEASE_DATE)
  })

  it("is left alone when the administrator set one", async () => {
    const fixture = await ready({ describe: false })
    const saved = await saveDatasetEntry(
      db,
      { draftId: fixture.draftId, datasetId: fixture.datasetId, revision: null },
      { ...emptyDatasetContent(), releaseDate: "2019-05-05" },
    )
    if (saved.status !== "saved") throw new Error(saved.status)

    await publish({ draftId: fixture.draftId, revision: fixture.revision })

    expect((await theDescription()).releaseDate).toBe("2019-05-05")
  })

  it("is not given to a dataset an archive accounts for", async () => {
    // A JGAD accession takes both of its dates from the application system, so
    // a date written here would be a second source for the same fact.
    const fixture = await ready()
    await db.delete(s.labelPin).where(eq(s.labelPin.datasetId, fixture.datasetId))
    await pinDataset(fixture.datasetId, "JGAD000001")

    await publish({ draftId: fixture.draftId, revision: fixture.revision })

    expect((await theDescription()).releaseDate).toBeNull()
  })
})

describe("a publish that is refused", () => {
  it("writes nothing at all when the revision has moved", async () => {
    const fixture = await ready()
    const before = await counts()

    const outcome = await publish({ draftId: fixture.draftId, revision: fixture.revision + 1 })

    expect(outcome).toEqual({ status: "conflict" })
    expect(await counts()).toEqual(before)
  })

  it("writes nothing at all when a label that must be pinned is not", async () => {
    const fixture = await ready()
    await db.delete(s.labelPin).where(eq(s.labelPin.kind, "hum"))
    const before = await counts()

    const outcome = await publish({ draftId: fixture.draftId, revision: fixture.revision })

    expect(outcome).toEqual({ status: "blocked", blocks: [{ kind: "hum-label-missing" }] })
    expect(await counts()).toEqual(before)
  })

  it("writes nothing at all while the listed findings have not been passed", async () => {
    const fixture = await ready({ describe: false })
    const before = await counts()

    const outcome = await publishDraft(
      db,
      {
        at: { draftId: fixture.draftId, revision: fixture.revision },
        number: 1,
        releaseDate: RELEASE_DATE,
        acknowledged: false,
        privateFiles: NO_PRIVATE_FILES,
      },
      CURATOR,
    )

    expect(outcome.status).toBe("unacknowledged")
    expect(await counts()).toEqual(before)
  })

  /**
   * Any free number will do, gap or not: the sequence is not promised to be
   * unbroken.
   */
  it("publishes under a number nothing ever kept", async () => {
    const fixture = await ready()

    const outcome = await publish({ draftId: fixture.draftId, revision: fixture.revision }, 7)

    expect(outcome).toEqual({ status: "published", versionNumber: 7 })
    expect((await theVersion()).number).toBe(7)
  })

  it("refuses a number below one, and writes nothing", async () => {
    const fixture = await ready()
    const before = await counts()

    for (const number of [0, -1, 1.5]) {
      expect(await publish({ draftId: fixture.draftId, revision: fixture.revision }, number), String(number))
        .toEqual({ status: "number-unavailable" })
    }
    expect(await counts()).toEqual(before)
  })
})

/** A copy of v1 — a draft like any other. */
async function copied(researchId: string): Promise<string> {
  const draftId = await draftCopiedFrom(db, researchId, 1)
  if (draftId === null) throw new Error("no v1 to copy")
  return draftId
}

describe("publishing under a number a version already holds", () => {
  it("refuses, and writes nothing: a held number is freed by withdrawing, not taken over", async () => {
    const fixture = await ready()
    await publish({ draftId: fixture.draftId, revision: fixture.revision })
    const first = await theVersion()

    const draftId = await copied(fixture.researchId)
    await saveDraftContent(db, { draftId, revision: 1 }, {
      content: { ...titled("直した"), datasetIds: [fixture.datasetId] },
    })
    const before = await counts()
    const outcome = await publish({ draftId, revision: 2 }, 1, first.releaseDate)

    expect(outcome).toEqual({ status: "number-unavailable" })
    expect(await counts()).toEqual(before)
    expect((await theVersion()).id).toBe(first.id)
  })

  it("has the descriptions of the version it was copied from, as the draft holds them", async () => {
    const fixture = await ready()
    await publish({ draftId: fixture.draftId, revision: fixture.revision })

    const draftId = await copied(fixture.researchId)
    await saveDatasetEntry(
      db,
      { draftId, datasetId: fixture.datasetId, revision: 1 },
      described("直した記述"),
    )
    await publish({ draftId, revision: 1 }, 2)

    // The draft was copied from the version, so the description it holds
    // already has the day that version went out.
    const [second] = await db.select().from(s.researchVersion).where(eq(s.researchVersion.number, 2))
    expect(descriptionOf(only(second?.content.datasets ?? [])))
      .toEqual({ ...described("直した記述"), releaseDate: RELEASE_DATE })
  })

  it("implies nothing about a dataset it did not change", async () => {
    const fixture = await ready()
    await publish({ draftId: fixture.draftId, revision: fixture.revision })

    const draftId = await copied(fixture.researchId)
    const draft = await readDraft(db, draftId)
    await saveDraftContent(db, { draftId, revision: draft?.revision ?? 0 }, {
      content: { ...titled("題目だけ直した"), datasetIds: [fixture.datasetId] },
    })
    const after = await readDraft(db, draftId)
    await publish({ draftId, revision: after?.revision ?? 0 }, 2)

    const about = await db
      .select({ id: s.event.id })
      .from(s.event)
      .where(and(eq(s.event.subjectType, "dataset"), eq(s.event.subjectId, fixture.datasetId)))
    // One event, from the publish that first described it: the second publish
    // wrote the same description the first one did.
    expect(about).toHaveLength(1)
  })
})

/**
 * Two administrators at the same moment. Each of these holds the other side's
 * transaction open at the point that matters, so that what the publish reads
 * is decided by locks rather than by which query happened to run first.
 */
describe("a publish racing another administrator", () => {
  const pause = (ms: number) => new Promise<"waiting">((resolve) => {
    setTimeout(() => {
      resolve("waiting")
    }, ms)
  })

  function signal() {
    let open = (): void => undefined
    const opened = new Promise<void>((resolve) => {
      open = resolve
    })
    return { open, opened }
  }

  it("refuses the same free number to the second of two drafts rather than failing", async () => {
    const fixture = await ready()
    await publish({ draftId: fixture.draftId, revision: fixture.revision })
    const first = await copied(fixture.researchId)
    const second = await copied(fixture.researchId)

    // The first publish is held after it has written its version and before it
    // commits: the search rows it rebuilds are locked here.
    const held = signal()
    const locked = signal()
    const holding = db.transaction(async (tx) => {
      await tx.select().from(s.searchDoc).where(eq(s.searchDoc.researchId, fixture.researchId)).for("update")
      locked.open()
      await held.opened
    })
    await locked.opened
    const publishingFirst = publish({ draftId: first, revision: 1 }, 2)
    await pause(200)
    const publishingSecond = publish({ draftId: second, revision: 1 }, 2).then(
      (outcome) => outcome,
      (error: unknown) => ({ status: "failed", error }),
    )
    await pause(200)
    held.open()
    await holding

    expect(await publishingFirst).toEqual({ status: "published", versionNumber: 2 })
    expect(await publishingSecond).toEqual({ status: "number-unavailable" })
    expect((await db.select().from(s.researchVersion)).map((row) => row.number).toSorted()).toEqual([1, 2])
    expect(await readDraft(db, second)).not.toBeNull()
  })

  it("does not publish a dataset whose id is taken away while the publish check runs", async () => {
    const fixture = await ready()
    const pin = only(await db.select().from(s.labelPin).where(eq(s.labelPin.datasetId, fixture.datasetId)))

    // The id is being taken away and has not been committed yet.
    const held = signal()
    const deleted = signal()
    const unpinning = db.transaction(async (tx) => {
      await tx.delete(s.labelPin).where(eq(s.labelPin.id, pin.id))
      deleted.open()
      await held.opened
    })
    await deleted.opened
    const publishing = publish({ draftId: fixture.draftId, revision: fixture.revision })
    await Promise.race([publishing, pause(200)])
    held.open()
    await unpinning

    expect(await publishing).toEqual({
      status: "blocked",
      blocks: [{ kind: "dataset-id-missing", datasetId: fixture.datasetId }],
    })
    expect(await db.select().from(s.researchVersion)).toHaveLength(0)
  })
})

describe("the trail a publish leaves", () => {
  it("records the version, the datasets it changed, and the publish check it was let through", async () => {
    const fixture = await ready({ describe: false })

    await publish({ draftId: fixture.draftId, revision: fixture.revision })

    const events = await db
      .select({ action: s.event.action, subjectType: s.event.subjectType, detail: s.event.detail })
      .from(s.event)
    // Consuming a draft by publishing it is not a discard: where it went is
    // what the version event has.
    expect(events.map((row) => row.action).toSorted())
      .toEqual(["pass-publish-check", "publish-dataset", "publish-version"])
    const passed = events.find((row) => row.action === "pass-publish-check")
    expect(passed?.detail).toEqual({ passed: { "empty-dataset": 1 } })
  })

  it("names the person who did it rather than the fact that an administrator did", async () => {
    const fixture = await ready()

    await publish({ draftId: fixture.draftId, revision: fixture.revision })

    const actors = await db.select({ sub: s.event.actorSub }).from(s.event)
    expect(new Set(actors.map((row) => row.sub))).toEqual(new Set([CURATOR.sub]))
  })
})

describe("taking a version back", () => {
  it("removes it from the search rows and leaves its content as a draft", async () => {
    const fixture = await ready()
    await publish({ draftId: fixture.draftId, revision: fixture.revision })
    const version = await theVersion()

    const outcome = await withdrawVersion(db, version.id, CURATOR)

    expect(outcome.status).toBe("withdrawn")
    expect(await db.select().from(s.searchDoc)).toHaveLength(0)
    expect(await db.select().from(s.researchVersion)).toHaveLength(0)

    const draft = only(await db.select().from(s.researchDraft))
    expect(draft.content.title.ja).toEqual(filled("研究"))
    expect(draft.content.datasetIds).toEqual([fixture.datasetId])
  })

  it("brings the descriptions out with it, one entry each", async () => {
    const fixture = await ready()
    await publish({ draftId: fixture.draftId, revision: fixture.revision })
    const version = await theVersion()

    await withdrawVersion(db, version.id, CURATOR)

    const entry = only(await db.select().from(s.draftDatasetEntry))
    expect(entry.datasetId).toBe(fixture.datasetId)
    expect(entry.content).toEqual({ ...described("記述"), releaseDate: RELEASE_DATE })
  })

  /**
   * The row is gone, so nothing else remembers the number was ever issued —
   * which is why the draft keeps it and why publishing it back is allowed.
   */
  it("frees the number for the draft it produced", async () => {
    const fixture = await ready()
    await publish({ draftId: fixture.draftId, revision: fixture.revision })
    const withdrawn = await withdrawVersion(db, (await theVersion()).id, CURATOR)
    if (withdrawn.status !== "withdrawn") throw new Error(withdrawn.status)

    const draft = only(await db.select().from(s.researchDraft))
    const outcome = await publish({ draftId: withdrawn.draftId, revision: draft.revision }, 1)

    expect(outcome).toEqual({ status: "published", versionNumber: 1 })
  })

  it("responds gone for a version that is not there", async () => {
    const outcome = await withdrawVersion(db, "00000000-0000-0000-0000-000000000000", CURATOR)

    expect(outcome).toEqual({ status: "gone" })
  })
})

describe("updating a version", () => {
  async function updating(researchId: string, versionId: string) {
    const opened = await draftUpdating(db, researchId, versionId)
    if (opened.status !== "opened") throw new Error(opened.status)
    const draft = await readDraft(db, opened.draftId)
    if (draft === null) throw new Error("the draft was not opened")
    return draft
  }

  /** An update names no number: it has the number of the version it stands in for. */
  function update(at: { draftId: string, revision: number }) {
    return publishDraft(
      db,
      { at, number: null, releaseDate: RELEASE_DATE, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
      CURATOR,
    )
  }

  /** A version out, and the draft it is updated in with its title changed. */
  async function corrected() {
    const fixture = await ready()
    await publish({ draftId: fixture.draftId, revision: fixture.revision })
    const before = await theVersion()
    const draft = await updating(fixture.researchId, before.id)
    const saved = await saveDraftContent(db, { draftId: draft.id, revision: draft.revision }, {
      content: { ...draft.content, title: { ja: filled("直した"), en: filled("直した") } },
    })
    if (saved.status !== "saved") throw new Error(saved.status)
    return { ...fixture, before, at: { draftId: draft.id, revision: saved.revision } }
  }

  it("puts the draft in the version's place under the same number, and nothing else remains", async () => {
    const fixture = await corrected()

    const outcome = await update(fixture.at)

    expect(outcome).toEqual({ status: "published", versionNumber: 1 })
    const after = await theVersion()
    expect(after.id).not.toBe(fixture.before.id)
    expect(after.content.title.ja).toEqual(filled("直した"))
    expect(after.content.datasets.map((row) => row.datasetId)).toEqual([fixture.datasetId])
    expect(await db.select().from(s.researchDraft)).toEqual([])
  })

  it("is recorded as an update of the version, with no withdrawal beside it", async () => {
    const fixture = await corrected()

    await update(fixture.at)

    const events = await db.select({ action: s.event.action, detail: s.event.detail }).from(s.event)
    const replaced = events.filter((row) => row.action === "replace-version")
    expect(replaced).toHaveLength(1)
    expect(replaced[0]?.detail).toMatchObject({ versionNumber: 1, draftId: fixture.at.draftId })
    expect(events.filter((row) => row.action === "withdraw-version")).toEqual([])
  })

  it("puts the updated content into the search rows in the same transaction", async () => {
    const fixture = await corrected()
    const before = (await db.select().from(s.searchDoc)).length

    await update(fixture.at)

    const docs = await db.select({ title: s.searchDoc.title }).from(s.searchDoc)
    expect(docs).toHaveLength(before)
    expect(docs.every((row) => row.title.includes("直した"))).toBe(true)
  })

  it("measures against the version it stands in for, not the newest", async () => {
    const fixture = await ready()
    await publish({ draftId: fixture.draftId, revision: fixture.revision })
    const first = await theVersion()
    const second = await createEmptyDraft(db, fixture.researchId)
    await saveDraftContent(db, { draftId: second, revision: 1 }, { content: titled("二つ目") })
    const published = await publish({ draftId: second, revision: 2 }, 2)
    if (published.status !== "published") throw new Error(published.status)
    const draft = await updating(fixture.researchId, first.id)

    const preview = await publishPreview(db, draft.id, NO_PRIVATE_FILES)

    expect(preview?.updating).toEqual({ number: 1, releaseDate: RELEASE_DATE })
    expect(preview?.researchFields).toBe(0)
    expect(preview?.listingAdded).toEqual([])
    expect(preview?.listingRemoved).toEqual([])
  })

  it("leaves the other versions where they are", async () => {
    const fixture = await corrected()
    const second = await createEmptyDraft(db, fixture.researchId)
    await saveDraftContent(db, { draftId: second, revision: 1 }, { content: titled("二つ目") })
    const published = await publish({ draftId: second, revision: 2 }, 2)
    if (published.status !== "published") throw new Error(published.status)

    const outcome = await update(fixture.at)

    expect(outcome).toEqual({ status: "published", versionNumber: 1 })
    const versions = await db.select().from(s.researchVersion).orderBy(s.researchVersion.number)
    expect(versions.map((row) => [row.number, row.content.title.ja])).toEqual([
      [1, filled("直した")],
      [2, filled("二つ目")],
    ])
  })

  it("refuses to withdraw the version while its update is open, and writes nothing", async () => {
    const fixture = await corrected()
    const before = await counts()

    const outcome = await withdrawVersion(db, fixture.before.id, CURATOR)

    expect(outcome).toEqual({ status: "updating" })
    expect(await counts()).toEqual(before)
    expect((await theVersion()).id).toBe(fixture.before.id)
  })

  it("refuses a draft of its own that identifies no number, and writes nothing", async () => {
    const fixture = await ready()
    const before = await counts()

    const outcome = await update({ draftId: fixture.draftId, revision: fixture.revision })

    expect(outcome).toEqual({ status: "number-unavailable" })
    expect(await counts()).toEqual(before)
  })
})

describe("looking a publish over first", () => {
  it("counts what changes without writing any of it", async () => {
    const fixture = await ready()
    const before = await counts()

    const preview = await publishPreview(db, fixture.draftId, NO_PRIVATE_FILES)

    expect(preview?.nextNumber).toBe(1)
    expect(preview?.heldNumbers).toEqual([])
    expect(preview?.listingAdded).toEqual([fixture.datasetId])
    expect(preview?.datasetChanges).toEqual([{
      datasetId: fixture.datasetId,
      fields: 0,
      isNew: true,
    }])
    expect(await counts()).toEqual(before)
  })

  it("offers the next number, and identifies the ones versions hold", async () => {
    const fixture = await ready()
    await publish({ draftId: fixture.draftId, revision: fixture.revision })
    const draftId = await copied(fixture.researchId)

    const preview = await publishPreview(db, draftId, NO_PRIVATE_FILES)

    expect(preview?.nextNumber).toBe(2)
    expect(preview?.heldNumbers).toEqual([1])
  })

  it("finds nothing to change in a copy of the newest version", async () => {
    const fixture = await ready()
    await publish({ draftId: fixture.draftId, revision: fixture.revision })
    const draftId = await copied(fixture.researchId)

    const preview = await publishPreview(db, draftId, NO_PRIVATE_FILES)

    expect(preview?.researchFields).toBe(0)
    expect(preview?.listingAdded).toEqual([])
    expect(preview?.listingRemoved).toEqual([])
    expect(preview?.datasetChanges).toEqual([])
    expect(preview?.publishCheck.findings).toEqual([])
  })

  it("counts a new order of the same datasets as a change", async () => {
    const fixture = await ready()
    const made = await createDatasetInDraft(db, { draftId: fixture.draftId, revision: fixture.revision }, fixture.researchId)
    if (made.status !== "created") throw new Error(made.status)
    await pinDataset(made.datasetId, "hum0001-NHA002")
    await publish({ draftId: fixture.draftId, revision: fixture.revision + 1 })
    const draftId = await copied(fixture.researchId)
    const draft = await readDraft(db, draftId)
    if (draft === null) throw new Error("no copy")
    expect(draft.content.datasetIds).toEqual([fixture.datasetId, made.datasetId])

    expect((await publishPreview(db, draftId, NO_PRIVATE_FILES))?.reordered).toBe(false)

    await saveDraftContent(db, { draftId, revision: draft.revision }, {
      content: { ...draft.content, datasetIds: [made.datasetId, fixture.datasetId] },
    })
    const preview = await publishPreview(db, draftId, NO_PRIVATE_FILES)

    expect(preview?.reordered).toBe(true)
    expect(preview?.researchFields).toBe(0)
    expect(preview?.datasetChanges).toEqual([])
  })

  /**
   * Publishing writes a version of its own, so another publish in the meantime
   * cannot have moved what this draft holds — there is no staleness to report.
   */
  it("implies nothing about what another publish did in the meantime", async () => {
    const fixture = await ready()
    await publish({ draftId: fixture.draftId, revision: fixture.revision })
    const behind = await copied(fixture.researchId)

    const other = await createEmptyDraft(db, fixture.researchId)
    const otherDraft = await readDraft(db, other)
    await saveDraftContent(db, { draftId: other, revision: otherDraft?.revision ?? 0 }, {
      content: { ...titled("先に直した"), datasetIds: [fixture.datasetId] },
    })
    const ready2 = await readDraft(db, other)
    await publish({ draftId: other, revision: ready2?.revision ?? 0 }, 2)

    const preview = await publishPreview(db, behind, NO_PRIVATE_FILES)

    expect(preview?.publishCheck.findings).toEqual([])
    expect(preview?.heldNumbers).toEqual([2, 1])
  })
})

/**
 * A draft reads a dataset it has not written as the published one (the editing
 * screen shows it so), and publishes it the same way: what is not written is
 * not rewritten. Taken for empty, the publish would put out every published
 * dataset with nothing in it, and the confirmation would count its fields as
 * changed.
 */
describe("a published dataset the draft has not written", () => {
  it("is kept over as published, and counted as unchanged", async () => {
    const fixture = await ready()
    await publish({ draftId: fixture.draftId, revision: fixture.revision })
    const first = await theDescription()

    const draftId = await createEmptyDraft(db, fixture.researchId)
    const preview = await publishPreview(db, draftId, NO_PRIVATE_FILES)
    expect(preview?.datasetChanges).toEqual([])
    expect(preview?.publishCheck.findings.filter((finding) => finding.kind === "empty-dataset")).toEqual([])

    const draft = await readDraft(db, draftId)
    await publish({ draftId, revision: draft?.revision ?? 0 }, 2)

    const [second] = await db.select().from(s.researchVersion).where(eq(s.researchVersion.number, 2))
    expect(descriptionOf(only(second?.content.datasets ?? []))).toEqual(first)
  })
})
