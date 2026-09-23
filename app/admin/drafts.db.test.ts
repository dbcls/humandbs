import { randomUUID } from "node:crypto"

import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedVersion } from "~/db/seed"

import { PRESENCE_WINDOW_SECONDS } from "./presence"
import {
  changeListing,
  createDatasetInDraft,
  createEmptyDraft,
  createResearchWithDraft,
  deleteDraftDataset,
  discardDraft,
  draftCopiedFrom,
  draftUpdating,
  saveDatasetEntry,
  saveDraftContent,
  touchPresence,
} from "./drafts.server"
import {
  activePresence,
  readDatasetEntry,
  readDraft,
} from "./queries.server"

/**
 * The write path, against the development database.
 *
 * What these are for is the negative side: a save whose revision no longer
 * matches must change nothing at all, and a discard must take everything that
 * hung off the draft with it while leaving the record of the discarding behind.
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
  return { ...emptyResearchContent(), title: { ja: filled(title), en: filled("") } }
}

function described(text: string): DatasetContent {
  return {
    ...emptyDatasetContent(),
    values: [{
      keyId: "type-of-data",
      value: { kind: "text", text: { ja: filled([[{ text }]]), en: { state: "unknown" } } },
    }],
  }
}

function withExperiment(label: string): DatasetContent {
  return {
    ...emptyDatasetContent(),
    experiments: [{ id: "exp-1", label: filled(label), values: [] }],
  }
}

async function createResearch(): Promise<string> {
  return only(await db.insert(s.research).values({}).returning({ id: s.research.id })).id
}

async function publish(
  researchId: string,
  number: number,
  content: ResearchContent,
  datasets: readonly { datasetId: string, content?: DatasetContent }[] = [],
): Promise<string> {
  const { datasetIds, ...body } = content
  void datasetIds
  return seedVersion(db, { researchId, number, body, datasets })
}

describe("starting a research", () => {
  it("creates the draft it will be written in, and pins no label", async () => {
    const created = await createResearchWithDraft(db)

    const draft = await readDraft(db, created.draftId)
    expect(draft?.researchId).toBe(created.researchId)
    expect(draft?.revision).toBe(1)
    expect(draft?.content).toEqual(emptyResearchContent())
    expect(await db.select().from(s.labelPin)).toHaveLength(0)
  })

  it("gives every draft a share token of its own", async () => {
    const first = await createResearchWithDraft(db)
    const second = await createResearchWithDraft(db)

    const tokens = await db.select({ token: s.researchDraft.shareToken }).from(s.researchDraft)
    expect(new Set(tokens.map((row) => row.token)).size).toBe(2)
    expect(first.draftId).not.toBe(second.draftId)
  })
})

describe("starting a draft of an existing research", () => {
  it("opens an empty draft, whatever is published", async () => {
    const researchId = await createResearch()
    await publish(researchId, 1, titled("first"))

    const draftId = await createEmptyDraft(db, researchId)

    expect((await readDraft(db, draftId))?.content).toEqual(emptyResearchContent())
  })

  it("copies the version named, not the newest", async () => {
    const researchId = await createResearch()
    await publish(researchId, 1, titled("first"))
    await publish(researchId, 4, titled("fourth"))

    const draftId = await draftCopiedFrom(db, researchId, 1)

    expect((await readDraft(db, draftId ?? ""))?.content.title.ja).toEqual(filled("first"))
  })

  it("makes a draft each time it is asked, none of them knowing the other", async () => {
    const researchId = await createResearch()
    await publish(researchId, 3, titled("third"))

    const first = await draftCopiedFrom(db, researchId, 3)
    const again = await draftCopiedFrom(db, researchId, 3)

    expect(again).not.toBe(first)
    expect(await db.select().from(s.researchDraft)).toHaveLength(2)
  })

  it("answers with nothing for a number no version holds, and opens no draft", async () => {
    const researchId = await createResearch()
    await publish(researchId, 1, titled("first"))

    expect(await draftCopiedFrom(db, researchId, 2)).toBeNull()
    expect(await db.select().from(s.researchDraft)).toEqual([])
  })

  it("does not copy a version that has been withdrawn", async () => {
    const researchId = await createResearch()
    await publish(researchId, 1, titled("published"))
    await publish(researchId, 2, titled("withdrawn"))
    // Withdrawing takes the row away.
    await db.delete(s.researchVersion).where(eq(s.researchVersion.number, 2))

    expect(await draftCopiedFrom(db, researchId, 2)).toBeNull()
    expect((await readDraft(db, (await draftCopiedFrom(db, researchId, 1)) ?? ""))?.content.title.ja)
      .toEqual(filled("published"))
  })

  /**
   * A draft copied from a version holds an entry for every dataset that version
   * listed: the copy is made once and in full, so editing one never has to
   * reach back to a version that may be gone by then.
   */
  it("brings the descriptions of the version it copies", async () => {
    const researchId = await createResearch()
    const datasetId = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id })).id
    await publish(researchId, 1, { ...titled("v1"), datasetIds: [datasetId] }, [
      { datasetId, content: described("as published") },
    ])

    const draftId = await draftCopiedFrom(db, researchId, 1)

    const entry = await readDatasetEntry(db, draftId ?? "", datasetId)
    expect(entry?.content).toEqual(described("as published"))
  })
})

describe("updating a version", () => {
  it("opens a draft holding the version, and leaves the version as it is", async () => {
    const researchId = await createResearch()
    const versionId = await publish(researchId, 2, titled("out"))

    const outcome = await draftUpdating(db, researchId, versionId)

    if (outcome.status !== "opened") throw new Error(outcome.status)
    const draft = await readDraft(db, outcome.draftId)
    expect(draft?.content.title.ja).toEqual(filled("out"))
    expect(draft?.updating).toEqual({ versionId, number: 2 })
    expect(await db.select().from(s.researchVersion)).toHaveLength(1)
  })

  it("opens the same draft the second time, rather than a second one", async () => {
    const researchId = await createResearch()
    const versionId = await publish(researchId, 2, titled("out"))

    const first = await draftUpdating(db, researchId, versionId)
    const again = await draftUpdating(db, researchId, versionId)

    expect(again).toEqual(first)
    expect(await db.select().from(s.researchDraft)).toHaveLength(1)
  })

  it("answers gone for a version of another research, and opens no draft", async () => {
    const researchId = await createResearch()
    const other = await createResearch()
    const versionId = await publish(other, 1, titled("theirs"))

    expect(await draftUpdating(db, researchId, versionId)).toEqual({ status: "gone" })
    expect(await db.select().from(s.researchDraft)).toEqual([])
  })

  it("is discarded like any draft, and the version stays out", async () => {
    const researchId = await createResearch()
    const versionId = await publish(researchId, 2, titled("out"))
    const opened = await draftUpdating(db, researchId, versionId)
    if (opened.status !== "opened") throw new Error(opened.status)

    const outcome = await discardDraft(db, { draftId: opened.draftId, revision: 1 }, CURATOR)

    expect(outcome).toEqual({ status: "discarded" })
    expect(await db.select().from(s.researchDraft)).toEqual([])
    expect(await db.select().from(s.researchVersion)).toHaveLength(1)
  })
})

describe("deciding what a version lists", () => {
  async function ground(): Promise<{ researchId: string, draftId: string, a: string, b: string }> {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const made = await createDatasetInDraft(db, { draftId, revision: 1 }, researchId)
    const madeAgain = await createDatasetInDraft(db, { draftId, revision: 2 }, researchId)
    if (made.status !== "created" || madeAgain.status !== "created") throw new Error("not created")
    return { researchId, draftId, a: made.datasetId, b: madeAgain.datasetId }
  }

  async function listed(draftId: string): Promise<string[]> {
    return (await readDraft(db, draftId))?.content.datasetIds ?? []
  }

  it("takes a dataset off the list and puts it back at the end, moving the revision each time", async () => {
    const { researchId, draftId, a, b } = await ground()

    expect(await changeListing(db, { draftId, revision: 3 }, researchId, { kind: "unlist", datasetId: a }))
      .toEqual({ status: "changed" })
    expect(await listed(draftId)).toEqual([b])
    expect(await changeListing(db, { draftId, revision: 4 }, researchId, { kind: "list", datasetId: a }))
      .toEqual({ status: "changed" })
    expect(await listed(draftId)).toEqual([b, a])
    expect((await readDraft(db, draftId))?.revision).toBe(5)
  })

  it("moves a dataset one step, and leaves the end where it is", async () => {
    const { researchId, draftId, a, b } = await ground()

    await changeListing(db, { draftId, revision: 3 }, researchId, { kind: "move", datasetId: b, by: -1 })
    expect(await listed(draftId)).toEqual([b, a])
    await changeListing(db, { draftId, revision: 4 }, researchId, { kind: "move", datasetId: b, by: -1 })
    expect(await listed(draftId)).toEqual([b, a])
  })

  it("refuses to list a dataset of another research, and writes nothing", async () => {
    const { researchId, draftId } = await ground()
    const other = await createResearchWithDraft(db)
    const theirs = await createDatasetInDraft(db, { draftId: other.draftId, revision: 1 }, other.researchId)
    if (theirs.status !== "created") throw new Error("not created")

    const outcome = await changeListing(
      db,
      { draftId, revision: 3 },
      researchId,
      { kind: "list", datasetId: theirs.datasetId },
    )

    expect(outcome).toEqual({ status: "refused" })
    expect((await readDraft(db, draftId))?.revision).toBe(3)
  })

  it("refuses a revision that has moved, and a draft that is gone", async () => {
    const { researchId, draftId, a } = await ground()

    expect(await changeListing(db, { draftId, revision: 1 }, researchId, { kind: "unlist", datasetId: a }))
      .toEqual({ status: "conflict" })
    expect(await listed(draftId)).toHaveLength(2)
    expect(await changeListing(db, { draftId: randomUUID(), revision: 1 }, researchId, { kind: "unlist", datasetId: a }))
      .toEqual({ status: "gone" })
  })
})

describe("saving a draft", () => {
  it("moves the revision on by one, which is what the next save is checked against", async () => {
    const { draftId } = await createResearchWithDraft(db)

    const outcome = await saveDraftContent(db, { draftId, revision: 1 }, {
      content: titled("written"),
    })

    expect(outcome).toEqual({ status: "saved", revision: 2 })
    const draft = await readDraft(db, draftId)
    expect(draft?.content.title.ja).toEqual(filled("written"))
  })

  it("reports a conflict and changes nothing when the revision no longer matches", async () => {
    const { draftId } = await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, { content: titled("theirs") })

    const outcome = await saveDraftContent(db, { draftId, revision: 1 }, {
      content: titled("mine"),
    })

    expect(outcome).toEqual({ status: "conflict" })
    const draft = await readDraft(db, draftId)
    expect(draft?.revision).toBe(2)
    expect(draft?.content.title.ja).toEqual(filled("theirs"))
  })

  it("tells a draft that has been discarded apart from one somebody else edited", async () => {
    const { draftId } = await createResearchWithDraft(db)
    await db.delete(s.researchDraft).where(eq(s.researchDraft.id, draftId))

    expect(await saveDraftContent(db, { draftId, revision: 1 }, {
      content: emptyResearchContent(),
    })).toEqual({ status: "gone" })
  })
})

describe("discarding a draft", () => {
  async function hangEverythingOff(draftId: string, researchId: string): Promise<void> {
    const dataset = only(await db.insert(s.dataset)
      .values({ researchId, originDraftId: draftId })
      .returning({ id: s.dataset.id }))
    await db.insert(s.draftDatasetEntry)
      .values({ draftId, datasetId: dataset.id, content: emptyDatasetContent() })
    await db.insert(s.draftPresence).values({ draftId, sessionId: "a-session", displayName: "curator" })
    await db.insert(s.comment).values({
      draftId,
      anchor: { kind: "research-field", path: "title" },
      authorName: "a provider",
      body: "please confirm",
    })
    await db.insert(s.reviewAcknowledgement).values({ draftId, kind: "commented", actorName: "a provider" })
  }

  it("takes the entries, the comments, the presence and its own datasets", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    await hangEverythingOff(draftId, researchId)

    expect(await discardDraft(db, { draftId, revision: 1 }, CURATOR))
      .toEqual({ status: "discarded" })

    expect(await db.select().from(s.researchDraft)).toHaveLength(0)
    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(0)
    expect(await db.select().from(s.draftPresence)).toHaveLength(0)
    expect(await db.select().from(s.comment)).toHaveLength(0)
    expect(await db.select().from(s.reviewAcknowledgement)).toHaveLength(0)
    expect(await db.select().from(s.dataset)).toHaveLength(0)
  })

  it("leaves a dataset the draft only edited, along with its identity and its pin", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const dataset = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id }))
    await db.insert(s.labelPin)
      .values({ kind: "dataset", label: "JGAD000001", datasetId: dataset.id, isPrimary: true })
    await db.insert(s.draftDatasetEntry)
      .values({ draftId, datasetId: dataset.id, content: emptyDatasetContent() })

    await discardDraft(db, { draftId, revision: 1 }, CURATOR)

    expect(await db.select().from(s.dataset)).toHaveLength(1)
    expect(await db.select().from(s.labelPin)).toHaveLength(1)
    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(0)
  })

  it("refuses when the revision no longer matches, and the draft stays", async () => {
    const { draftId } = await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, { content: titled("theirs") })

    expect(await discardDraft(db, { draftId, revision: 1 }, CURATOR))
      .toEqual({ status: "conflict" })
    expect(await readDraft(db, draftId)).not.toBeNull()
  })

  it("records who discarded it, and the record outlives the draft", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)

    await discardDraft(db, { draftId, revision: 1 }, CURATOR)

    const events = await db.select().from(s.event)
    expect(events).toHaveLength(1)
    expect(events[0]?.action).toBe("discard-draft")
    expect(events[0]?.subjectType).toBe("draft")
    expect(events[0]?.subjectId).toBe(draftId)
    expect(events[0]?.actorSub).toBe(CURATOR.sub)
    expect(events[0]?.detail).toEqual({ researchId })
  })

  it("records nothing when it did not discard anything", async () => {
    const { draftId } = await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, { content: titled("theirs") })

    await discardDraft(db, { draftId, revision: 1 }, CURATOR)
    await discardDraft(db, { draftId: draftId, revision: 99 }, BOOTSTRAP_ACTOR)

    expect(await db.select().from(s.event)).toHaveLength(0)
  })
})

describe("writing a dataset of a draft", () => {
  async function makeDataset(researchId: string, published: DatasetContent | null): Promise<string> {
    const row = only(await db.insert(s.dataset).values({ researchId })
      .returning({ id: s.dataset.id }))
    if (published !== null) {
      await publish(researchId, 1, titled("v1"), [{ datasetId: row.id, content: published }])
    }
    return row.id
  }

  it("creates the entry on the first save", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await makeDataset(researchId, described("as published"))

    const outcome = await saveDatasetEntry(db, { draftId, datasetId, revision: null }, described("as edited"))

    expect(outcome).toEqual({ status: "saved", revision: 1 })
    const entry = await readDatasetEntry(db, draftId, datasetId)
    expect(entry?.content).toEqual(described("as edited"))
  })

  /**
   * Nothing records what the entry started from: a draft is a copy, and what it
   * is compared against is chosen when somebody asks for a comparison.
   */
  it("keeps nothing beside the content it was saved with", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await makeDataset(researchId, described("as published"))

    await saveDatasetEntry(db, { draftId, datasetId, revision: null }, described("first"))

    const row = only(await db.select().from(s.draftDatasetEntry))
    expect(Object.keys(row).toSorted())
      .toEqual(["content", "datasetId", "draftId", "id", "revision"])
  })

  it("refuses a first save that is not the one which created the entry", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await makeDataset(researchId, null)
    await saveDatasetEntry(db, { draftId, datasetId, revision: null }, described("theirs"))

    const outcome = await saveDatasetEntry(db, { draftId, datasetId, revision: null }, described("mine"))

    expect(outcome).toEqual({ status: "conflict" })
    expect((await readDatasetEntry(db, draftId, datasetId))?.content).toEqual(described("theirs"))
  })

  it("moves the revision on by one, which is what the next save is checked against", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await makeDataset(researchId, null)
    await saveDatasetEntry(db, { draftId, datasetId, revision: null }, described("first"))

    const outcome = await saveDatasetEntry(db, { draftId, datasetId, revision: 1 }, described("second"))

    expect(outcome).toEqual({ status: "saved", revision: 2 })
    expect((await readDatasetEntry(db, draftId, datasetId))?.content).toEqual(described("second"))
  })

  it("reports a conflict and changes nothing when the revision no longer matches", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await makeDataset(researchId, null)
    await saveDatasetEntry(db, { draftId, datasetId, revision: null }, described("first"))
    await saveDatasetEntry(db, { draftId, datasetId, revision: 1 }, described("theirs"))

    const outcome = await saveDatasetEntry(db, { draftId, datasetId, revision: 1 }, described("mine"))

    expect(outcome).toEqual({ status: "conflict" })
    const entry = await readDatasetEntry(db, draftId, datasetId)
    expect(entry?.revision).toBe(2)
    expect(entry?.content).toEqual(described("theirs"))
  })

  it("checks an experiment against the dataset's revision, having none of its own", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await makeDataset(researchId, null)
    await saveDatasetEntry(db, { draftId, datasetId, revision: null }, withExperiment("Exome"))
    await saveDatasetEntry(db, { draftId, datasetId, revision: 1 }, withExperiment("WGS"))

    const outcome = await saveDatasetEntry(db, { draftId, datasetId, revision: 1 }, withExperiment("RNA-seq"))

    expect(outcome).toEqual({ status: "conflict" })
    const entry = await readDatasetEntry(db, draftId, datasetId)
    expect(entry?.content.experiments[0]?.label).toEqual(filled("WGS"))
  })

  it("tells a dataset that has been destroyed apart from one somebody else saved", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const datasetId = await makeDataset(researchId, null)
    await saveDatasetEntry(db, { draftId, datasetId, revision: null }, described("first"))
    await db.delete(s.dataset).where(eq(s.dataset.id, datasetId))

    expect(await saveDatasetEntry(db, { draftId, datasetId, revision: 1 }, described("mine")))
      .toEqual({ status: "gone" })
  })
})

describe("who has a draft open", () => {
  it("keeps one row per session however often it says so", async () => {
    const { draftId } = await createResearchWithDraft(db)

    await touchPresence(db, { draftId, sessionId: "s1", actorSub: "sub-1", displayName: "tanaka" })
    await touchPresence(db, { draftId, sessionId: "s1", actorSub: "sub-1", displayName: "tanaka" })
    await touchPresence(db, { draftId, sessionId: "s2", actorSub: "sub-2", displayName: "suzuki" })

    expect((await activePresence(db, draftId)).map((row) => row.displayName))
      .toEqual(["suzuki", "tanaka"])
  })

  it("leaves out somebody who has stopped saying they are there", async () => {
    const { draftId } = await createResearchWithDraft(db)
    await touchPresence(db, { draftId, sessionId: "s1", actorSub: "sub-1", displayName: "tanaka" })
    await db
      .update(s.draftPresence)
      .set({ lastSeenAt: sql`now() - make_interval(secs => ${PRESENCE_WINDOW_SECONDS + 1})` })
      .where(eq(s.draftPresence.sessionId, "s1"))

    expect(await activePresence(db, draftId)).toEqual([])
    // The row is still there: expiry is a predicate on the read, not a sweep.
    expect(await db.select().from(s.draftPresence)).toHaveLength(1)
  })
})

describe("a dataset a draft adds", () => {
  it("is listed by the version straight away, and belongs to the draft", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)

    const outcome = await createDatasetInDraft(db, { draftId, revision: 1 }, researchId)

    expect(outcome.status).toBe("created")
    if (outcome.status !== "created") return
    const draft = await readDraft(db, draftId)
    expect(draft?.content.datasetIds).toEqual([outcome.datasetId])
    expect(draft?.revision).toBe(2)
    const rows = await db.select({ origin: s.dataset.originDraftId }).from(s.dataset)
    expect(only(rows).origin).toBe(draftId)
  })

  it("leaves nothing behind when the draft has moved on since the screen opened", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, { content: titled("theirs") })

    expect(await createDatasetInDraft(db, { draftId, revision: 1 }, researchId))
      .toEqual({ status: "conflict" })
    expect(await db.select().from(s.dataset)).toHaveLength(0)
  })

  it("goes off the version's list when the draft destroys it", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const created = await createDatasetInDraft(db, { draftId, revision: 1 }, researchId)
    if (created.status !== "created") throw new Error("expected a dataset")
    await saveDatasetEntry(db, { draftId, datasetId: created.datasetId, revision: null }, described("wip"))

    expect(await deleteDraftDataset(db, { draftId, revision: 2 }, created.datasetId))
      .toEqual({ status: "deleted" })

    expect(await db.select().from(s.dataset)).toHaveLength(0)
    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(0)
    expect((await readDraft(db, draftId))?.content.datasetIds).toEqual([])
  })

  it("cannot destroy one that has been published, however it got there", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const created = await createDatasetInDraft(db, { draftId, revision: 1 }, researchId)
    if (created.status !== "created") throw new Error("expected a dataset")
    // Publishing is what clears `originDraftId`, and that is what takes the
    // dataset out of this draft's reach.
    await db.update(s.dataset).set({ originDraftId: null })
      .where(eq(s.dataset.id, created.datasetId))

    expect(await deleteDraftDataset(db, { draftId, revision: 2 }, created.datasetId))
      .toEqual({ status: "refused" })
    expect(await db.select().from(s.dataset)).toHaveLength(1)
  })

  it("cannot destroy one that belongs to another draft", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const otherDraftId = await createEmptyDraft(db, researchId)
    const created = await createDatasetInDraft(db, { draftId: otherDraftId, revision: 1 }, researchId)
    if (created.status !== "created") throw new Error("expected a dataset")

    expect(await deleteDraftDataset(db, { draftId, revision: 1 }, created.datasetId))
      .toEqual({ status: "refused" })
    expect(await db.select().from(s.dataset)).toHaveLength(1)
  })
})
