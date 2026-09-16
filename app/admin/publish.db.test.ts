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
  createDraft,
  createResearchWithDraft,
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
    const ground = await ready()

    const outcome = await publish({ draftId: ground.draftId, revision: ground.revision })

    expect(outcome).toEqual({ status: "published", versionNumber: 1, replaced: false })
    const version = await theVersion()
    expect(version.number).toBe(1)
    expect(version.releaseDate).toBe(RELEASE_DATE)

    const docs = await db.select({ type: s.searchDoc.targetType }).from(s.searchDoc)
    expect(docs.map((row) => row.type).toSorted())
      .toEqual(["dataset", "research", "research-version"])
  })

  it("consumes the draft, and keeps the dataset that draft introduced", async () => {
    const ground = await ready()

    await publish({ draftId: ground.draftId, revision: ground.revision })

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
      content: { ...titled("研究"), datasetIds: [ground.datasetId] },
    })

    const after = await readDraft(db, ground.draftId)
    await publish({ draftId: ground.draftId, revision: after?.revision ?? 0 })

    const remaining = await db.select({ id: s.dataset.id }).from(s.dataset)
    expect(remaining.map((row) => row.id)).toEqual([ground.datasetId])
  })

  it("folds the description of every dataset the version lists into the version", async () => {
    const ground = await ready()

    await publish({ draftId: ground.draftId, revision: ground.revision })

    const version = await theVersion()
    expect(version.content.datasets.map((row) => row.datasetId)).toEqual([ground.datasetId])
    // The dataset carries an NHA ID, so this publish also gives it the day the
    // version is going out on (below).
    expect(await theDescription()).toEqual({ ...described("記述"), releaseDate: RELEASE_DATE })
  })

  it("publishes a listed dataset nobody described as an empty one rather than as nothing", async () => {
    const ground = await ready({ describe: false })

    const outcome = await publish({ draftId: ground.draftId, revision: ground.revision })

    expect(outcome.status).toBe("published")
    expect(await theDescription())
      .toEqual({ ...emptyDatasetContent(), releaseDate: RELEASE_DATE })
  })
})

/**
 * The one date the portal is master of. An NHA ID has no archive to ask, and
 * the day the version goes out is the only day this publish knows
 * ([data-model.md](../../docs/data-model.md) の「日付」).
 */
describe("the release date an NHA dataset is given", () => {
  it("is the day the version goes out, when the dataset has none of its own", async () => {
    const ground = await ready()

    await publish({ draftId: ground.draftId, revision: ground.revision })

    expect((await theDescription()).releaseDate).toBe(RELEASE_DATE)
  })

  it("is left alone when the administrator set one", async () => {
    const ground = await ready({ describe: false })
    const saved = await saveDatasetEntry(
      db,
      { draftId: ground.draftId, datasetId: ground.datasetId, revision: null },
      { ...emptyDatasetContent(), releaseDate: "2019-05-05" },
    )
    if (saved.status !== "saved") throw new Error(saved.status)

    await publish({ draftId: ground.draftId, revision: ground.revision })

    expect((await theDescription()).releaseDate).toBe("2019-05-05")
  })

  it("is not given to a dataset an archive answers for", async () => {
    // A JGAD accession takes both of its dates from the application system, so
    // a date written here would be a second source for the same fact.
    const ground = await ready()
    await db.delete(s.labelPin).where(eq(s.labelPin.datasetId, ground.datasetId))
    await pinDataset(ground.datasetId, "JGAD000001")

    await publish({ draftId: ground.draftId, revision: ground.revision })

    expect((await theDescription()).releaseDate).toBeNull()
  })
})

describe("a publish that is refused", () => {
  it("writes nothing at all when the revision has moved", async () => {
    const ground = await ready()
    const before = await counts()

    const outcome = await publish({ draftId: ground.draftId, revision: ground.revision + 1 })

    expect(outcome).toEqual({ status: "conflict" })
    expect(await counts()).toEqual(before)
  })

  it("writes nothing at all when a label that must be pinned is not", async () => {
    const ground = await ready()
    await db.delete(s.labelPin).where(eq(s.labelPin.kind, "hum"))
    const before = await counts()

    const outcome = await publish({ draftId: ground.draftId, revision: ground.revision })

    expect(outcome).toEqual({ status: "blocked", blocks: [{ kind: "hum-label-missing" }] })
    expect(await counts()).toEqual(before)
  })

  it("writes nothing at all while the listed findings have not been passed", async () => {
    const ground = await ready({ describe: false })
    const before = await counts()

    const outcome = await publishDraft(
      db,
      {
        at: { draftId: ground.draftId, revision: ground.revision },
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
   * A number nothing ever carried would put a version under it with no
   * withdrawal to account for the gap, which a reader cannot tell from a
   * version that was taken back.
   */
  it("writes nothing at all under a number that was never issued", async () => {
    const ground = await ready()
    const before = await counts()

    const outcome = await publish({ draftId: ground.draftId, revision: ground.revision }, 7)

    expect(outcome).toEqual({ status: "number-unavailable" })
    expect(await counts()).toEqual(before)
  })
})

describe("publishing under a number a version already holds", () => {
  it("replaces that version rather than writing over its row", async () => {
    const ground = await ready()
    await publish({ draftId: ground.draftId, revision: ground.revision })
    const first = await theVersion()

    const draftId = await createDraft(db, ground.researchId)
    await saveDraftContent(db, { draftId, revision: 1 }, {
      content: { ...titled("直した"), datasetIds: [ground.datasetId] },
    })
    const outcome = await publish({ draftId, revision: 2 }, 1, first.releaseDate)

    expect(outcome).toEqual({ status: "published", versionNumber: 1, replaced: true })
    const after = await theVersion()
    expect(after.number).toBe(1)
    expect(after.releaseDate).toBe(first.releaseDate)
    // A new row under the same number, rather than the old one edited.
    expect(after.id).not.toBe(first.id)
    expect(after.content.title.ja).toEqual(filled("直した"))
  })

  it("carries the descriptions of the version it replaces, as the draft holds them", async () => {
    const ground = await ready()
    await publish({ draftId: ground.draftId, revision: ground.revision })

    const draftId = await createDraft(db, ground.researchId)
    await saveDatasetEntry(
      db,
      { draftId, datasetId: ground.datasetId, revision: 1 },
      described("直した記述"),
    )
    await publish({ draftId, revision: 1 }, 1)

    // The draft was copied from the version, so the description it holds
    // already carries the day that version went out.
    expect(await theDescription())
      .toEqual({ ...described("直した記述"), releaseDate: RELEASE_DATE })
  })

  it("says nothing about a dataset it did not change", async () => {
    const ground = await ready()
    await publish({ draftId: ground.draftId, revision: ground.revision })

    const draftId = await createDraft(db, ground.researchId)
    const draft = await readDraft(db, draftId)
    await saveDraftContent(db, { draftId, revision: draft?.revision ?? 0 }, {
      content: { ...titled("題目だけ直した"), datasetIds: [ground.datasetId] },
    })
    const after = await readDraft(db, draftId)
    await publish({ draftId, revision: after?.revision ?? 0 }, 1)

    const about = await db
      .select({ id: s.event.id })
      .from(s.event)
      .where(and(eq(s.event.subjectType, "dataset"), eq(s.event.subjectId, ground.datasetId)))
    // One event, from the publish that first described it: the second publish
    // wrote the same description the first one did.
    expect(about).toHaveLength(1)
  })
})

describe("the trail a publish leaves", () => {
  it("records the version, the datasets it changed, and the gate it was let through", async () => {
    const ground = await ready({ describe: false })

    await publish({ draftId: ground.draftId, revision: ground.revision })

    const events = await db
      .select({ action: s.event.action, subjectType: s.event.subjectType, detail: s.event.detail })
      .from(s.event)
    // Consuming a draft by publishing it is not a discard: where it went is
    // what the version event says.
    expect(events.map((row) => row.action).toSorted())
      .toEqual(["pass-publish-gate", "publish-dataset", "publish-version"])
    const passed = events.find((row) => row.action === "pass-publish-gate")
    expect(passed?.detail).toEqual({ passed: { "empty-dataset": 1 } })
  })

  it("calls a publish under a held number a replacement", async () => {
    const ground = await ready()
    await publish({ draftId: ground.draftId, revision: ground.revision })
    const draftId = await createDraft(db, ground.researchId)

    await publish({ draftId, revision: 1 }, 1)

    const actions = await db.select({ action: s.event.action }).from(s.event)
    expect(actions.map((row) => row.action)).toContain("replace-version")
  })

  it("names the person who did it rather than the fact that an administrator did", async () => {
    const ground = await ready()

    await publish({ draftId: ground.draftId, revision: ground.revision })

    const actors = await db.select({ sub: s.event.actorSub }).from(s.event)
    expect(new Set(actors.map((row) => row.sub))).toEqual(new Set([CURATOR.sub]))
  })
})

describe("taking a version back", () => {
  it("removes it from the search rows and leaves its content as a draft", async () => {
    const ground = await ready()
    await publish({ draftId: ground.draftId, revision: ground.revision })
    const version = await theVersion()

    const outcome = await withdrawVersion(db, version.id, CURATOR)

    expect(outcome.status).toBe("withdrawn")
    expect(await db.select().from(s.searchDoc)).toHaveLength(0)
    expect(await db.select().from(s.researchVersion)).toHaveLength(0)

    const draft = only(await db.select().from(s.researchDraft))
    expect(draft.content.title.ja).toEqual(filled("研究"))
    expect(draft.content.datasetIds).toEqual([ground.datasetId])
    expect(draft.copiedFromNumber).toBe(1)
  })

  it("brings the descriptions out with it, one entry each", async () => {
    const ground = await ready()
    await publish({ draftId: ground.draftId, revision: ground.revision })
    const version = await theVersion()

    await withdrawVersion(db, version.id, CURATOR)

    const entry = only(await db.select().from(s.draftDatasetEntry))
    expect(entry.datasetId).toBe(ground.datasetId)
    expect(entry.content).toEqual({ ...described("記述"), releaseDate: RELEASE_DATE })
  })

  /**
   * The row is gone, so nothing else remembers the number was ever issued —
   * which is why the draft carries it and why publishing it back is allowed.
   */
  it("frees the number for the draft it produced", async () => {
    const ground = await ready()
    await publish({ draftId: ground.draftId, revision: ground.revision })
    const withdrawn = await withdrawVersion(db, (await theVersion()).id, CURATOR)
    if (withdrawn.status !== "withdrawn") throw new Error(withdrawn.status)

    const draft = only(await db.select().from(s.researchDraft))
    const outcome = await publish({ draftId: withdrawn.draftId, revision: draft.revision }, 1)

    expect(outcome).toEqual({ status: "published", versionNumber: 1, replaced: false })
  })

  it("answers gone for a version that is not there", async () => {
    const outcome = await withdrawVersion(db, "00000000-0000-0000-0000-000000000000", CURATOR)

    expect(outcome).toEqual({ status: "gone" })
  })
})

describe("looking a publish over first", () => {
  it("counts what changes without writing any of it", async () => {
    const ground = await ready()
    const before = await counts()

    const preview = await publishPreview(db, ground.draftId, NO_PRIVATE_FILES)

    expect(preview?.nextNumber).toBe(1)
    expect(preview?.choices).toEqual([])
    expect(preview?.suggestedNumber).toBeNull()
    expect(preview?.listingAdded).toEqual([ground.datasetId])
    expect(preview?.datasetChanges).toEqual([{
      datasetId: ground.datasetId,
      fields: 0,
      isNew: true,
    }])
    expect(await counts()).toEqual(before)
  })

  it("offers the version a draft was copied from, and the next number beside it", async () => {
    const ground = await ready()
    await publish({ draftId: ground.draftId, revision: ground.revision })
    const draftId = await createDraft(db, ground.researchId)

    const preview = await publishPreview(db, draftId, NO_PRIVATE_FILES)

    expect(preview?.nextNumber).toBe(2)
    expect(preview?.choices).toEqual([{ number: 1, releaseDate: RELEASE_DATE }])
    expect(preview?.suggestedNumber).toBe(1)
  })

  it("finds nothing to change in a copy of the version it would replace", async () => {
    const ground = await ready()
    await publish({ draftId: ground.draftId, revision: ground.revision })
    const draftId = await createDraft(db, ground.researchId)

    const preview = await publishPreview(db, draftId, NO_PRIVATE_FILES)

    expect(preview?.researchFields).toBe(0)
    expect(preview?.listingAdded).toEqual([])
    expect(preview?.listingRemoved).toEqual([])
    expect(preview?.datasetChanges).toEqual([])
    expect(preview?.gate.findings).toEqual([])
  })

  /**
   * Publishing writes a version of its own, so another publish in the meantime
   * cannot have moved what this draft holds — there is no staleness to report.
   */
  it("says nothing about what another publish did in the meantime", async () => {
    const ground = await ready()
    await publish({ draftId: ground.draftId, revision: ground.revision })
    const behind = await createDraft(db, ground.researchId)

    const other = await createDraft(db, ground.researchId)
    const otherDraft = await readDraft(db, other)
    await saveDraftContent(db, { draftId: other, revision: otherDraft?.revision ?? 0 }, {
      content: { ...titled("先に直した"), datasetIds: [ground.datasetId] },
    })
    const ready2 = await readDraft(db, other)
    await publish({ draftId: other, revision: ready2?.revision ?? 0 }, 1)

    const preview = await publishPreview(db, behind, NO_PRIVATE_FILES)

    expect(preview?.gate.findings).toEqual([])
    expect(preview?.choices).toEqual([{ number: 1, releaseDate: RELEASE_DATE }])
  })
})
