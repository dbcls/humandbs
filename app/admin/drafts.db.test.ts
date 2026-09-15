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
  UNDO_DEPTH,
  createDatasetInDraft,
  createDraft,
  createResearchWithDraft,
  deleteDraftDataset,
  discardDraft,
  draftToTakeInto,
  saveDatasetEntry,
  saveDraftContent,
  touchPresence,
} from "./drafts.server"
import {
  activePresence,
  readDatasetEntry,
  readDraft,
  readUndoSnapshot,
  readUndoStack,
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
  it("copies the newest version and remembers the number it came from", async () => {
    const researchId = await createResearch()
    await publish(researchId, 1, titled("first"))
    await publish(researchId, 4, titled("fourth"))

    const draftId = await createDraft(db, researchId)

    const draft = await readDraft(db, draftId)
    expect(draft?.content.title.ja).toEqual(filled("fourth"))
    expect(draft?.copiedFromNumber).toBe(4)
  })

  it("does not start from a version that has been withdrawn", async () => {
    const researchId = await createResearch()
    await publish(researchId, 1, titled("published"))
    await publish(researchId, 2, titled("withdrawn"))
    // Withdrawing takes the row away, so the newest one left is v1.
    await db.delete(s.researchVersion).where(eq(s.researchVersion.number, 2))

    const draft = await readDraft(db, await createDraft(db, researchId))

    expect(draft?.content.title.ja).toEqual(filled("published"))
  })

  it("starts empty, remembering no number, when nothing has ever been published", async () => {
    const researchId = await createResearch()

    const draftId = await createDraft(db, researchId)

    const draft = await readDraft(db, draftId)
    expect(draft?.content).toEqual(emptyResearchContent())
    expect(draft?.copiedFromNumber).toBeNull()
  })

  /**
   * Which number a draft remembers is the whole of the difference between
   * taking an upstream update into what is published and taking it into a
   * version that is yet to be — it is what the publish screen offers first.
   */
  it("remembers the number when the draft is to replace what is published", async () => {
    const researchId = await createResearch()
    await publish(researchId, 3, titled("third"))

    const draftId = await draftToTakeInto(db, researchId, "replacement")

    const draft = await readDraft(db, draftId ?? "")
    expect(draft?.content.title.ja).toEqual(filled("third"))
    expect(draft?.copiedFromNumber).toBe(3)
  })

  it("remembers no number when the draft is to become the next version", async () => {
    const researchId = await createResearch()
    await publish(researchId, 3, titled("third"))

    const draftId = await draftToTakeInto(db, researchId, "next-version")

    const draft = await readDraft(db, draftId ?? "")
    expect(draft?.content.title.ja).toEqual(filled("third"))
    expect(draft?.copiedFromNumber).toBeNull()
  })

  it("answers with nothing where there is no version to copy", async () => {
    const researchId = await createResearch()

    expect(await draftToTakeInto(db, researchId, "replacement")).toBeNull()
    expect(await db.select().from(s.researchDraft)).toEqual([])
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

    const draftId = await createDraft(db, researchId)

    const entry = await readDatasetEntry(db, draftId, datasetId)
    expect(entry?.content).toEqual(described("as published"))
  })
})

describe("saving a draft", () => {
  it("moves the revision on by one, which is what the next save is checked against", async () => {
    const { draftId } = await createResearchWithDraft(db)

    const outcome = await saveDraftContent(db, { draftId, revision: 1 }, {
      note: "for the 2026 release",
      content: titled("written"),
    })

    expect(outcome).toEqual({ status: "saved", revision: 2 })
    const draft = await readDraft(db, draftId)
    expect(draft?.note).toBe("for the 2026 release")
    expect(draft?.content.title.ja).toEqual(filled("written"))
  })

  it("reports a conflict and changes nothing when the revision no longer matches", async () => {
    const { draftId } = await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, { note: "theirs", content: titled("theirs") })

    const outcome = await saveDraftContent(db, { draftId, revision: 1 }, {
      note: "mine",
      content: titled("mine"),
    })

    expect(outcome).toEqual({ status: "conflict" })
    const draft = await readDraft(db, draftId)
    expect(draft?.revision).toBe(2)
    expect(draft?.note).toBe("theirs")
    expect(draft?.content.title.ja).toEqual(filled("theirs"))
  })

  it("tells a draft that has been discarded apart from one somebody else edited", async () => {
    const { draftId } = await createResearchWithDraft(db)
    await db.delete(s.researchDraft).where(eq(s.researchDraft.id, draftId))

    expect(await saveDraftContent(db, { draftId, revision: 1 }, {
      note: "",
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
    await db.insert(s.draftUndo)
      .values({ draftId, snapshot: { reason: "before-save", note: "", content: emptyResearchContent(), datasetEntries: [] } })
    await db.insert(s.draftPresence).values({ draftId, sessionId: "a-session", displayName: "curator" })
    const thread = only(await db.insert(s.commentThread)
      .values({ draftId, anchor: { kind: "research-field", path: "title" } })
      .returning({ id: s.commentThread.id }))
    await db.insert(s.comment)
      .values({ threadId: thread.id, authorName: "a provider", body: "please confirm" })
    await db.insert(s.reviewAcknowledgement).values({ draftId, actorName: "a provider" })
  }

  it("takes the entries, the undo stack, the comments, the presence and its own datasets", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    await hangEverythingOff(draftId, researchId)

    expect(await discardDraft(db, { draftId, revision: 1 }, CURATOR))
      .toEqual({ status: "discarded" })

    expect(await db.select().from(s.researchDraft)).toHaveLength(0)
    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(0)
    expect(await db.select().from(s.draftUndo)).toHaveLength(0)
    expect(await db.select().from(s.draftPresence)).toHaveLength(0)
    expect(await db.select().from(s.commentThread)).toHaveLength(0)
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
    await saveDraftContent(db, { draftId, revision: 1 }, { note: "", content: titled("theirs") })

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
    await saveDraftContent(db, { draftId, revision: 1 }, { note: "", content: titled("theirs") })

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

describe("the undo stack", () => {
  it("keeps the state as it stood before an explicit save", async () => {
    const { draftId } = await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, { note: "first", content: titled("first") })
    await saveDraftContent(db, { draftId, revision: 2 }, { note: "second", content: titled("second") })

    const stack = await readUndoStack(db, draftId)
    expect(stack.map((entry) => entry.reason)).toEqual(["before-save", "before-save"])
    const newest = await readUndoSnapshot(db, draftId, stack[0]?.id ?? "")
    expect(newest?.note).toBe("first")
    expect(newest?.content.title.ja).toEqual(filled("first"))
  })

  it("keeps the form a conflict refused, which exists nowhere else once the screen closes", async () => {
    const { draftId } = await createResearchWithDraft(db)
    await saveDraftContent(db, { draftId, revision: 1 }, { note: "theirs", content: titled("theirs") })

    await saveDraftContent(db, { draftId, revision: 1 }, { note: "mine", content: titled("mine") })

    const stack = await readUndoStack(db, draftId)
    expect(stack[0]?.reason).toBe("rejected")
    const refused = await readUndoSnapshot(db, draftId, stack[0]?.id ?? "")
    expect(refused?.note).toBe("mine")
    expect(refused?.content.title.ja).toEqual(filled("mine"))
  })

  it("keeps the dataset a conflict refused alongside what the draft already held", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const kept = only(await db.insert(s.dataset).values({ researchId }).returning({ id: s.dataset.id })).id
    const contested = only(await db.insert(s.dataset).values({ researchId }).returning({ id: s.dataset.id })).id
    await saveDatasetEntry(db, { draftId, datasetId: kept, revision: null }, described("kept"))
    await saveDatasetEntry(db, { draftId, datasetId: contested, revision: null }, described("theirs"))

    await saveDatasetEntry(db, { draftId, datasetId: contested, revision: null }, described("mine"))

    const stack = await readUndoStack(db, draftId)
    const refused = await readUndoSnapshot(db, draftId, stack[0]?.id ?? "")
    expect(refused?.reason).toBe("rejected")
    const entries = new Map(refused?.datasetEntries.map((row) => [row.datasetId, row.content]))
    expect(entries.get(contested)).toEqual(described("mine"))
    expect(entries.get(kept)).toEqual(described("kept"))
  })

  it("never grows past ten, dropping the oldest to make room", async () => {
    const { draftId } = await createResearchWithDraft(db)
    for (let revision = 1; revision <= 14; revision += 1) {
      await saveDraftContent(db, { draftId, revision }, {
        note: `save ${revision}`,
        content: titled(`save ${revision}`),
      })
    }

    const stack = await readUndoStack(db, draftId)
    expect(stack).toHaveLength(UNDO_DEPTH)
    const oldest = await readUndoSnapshot(db, draftId, stack[stack.length - 1]?.id ?? "")
    expect(oldest?.note).toBe("save 4")
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
    await saveDraftContent(db, { draftId, revision: 1 }, { note: "", content: titled("theirs") })

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
    const otherDraftId = await createDraft(db, researchId)
    const created = await createDatasetInDraft(db, { draftId: otherDraftId, revision: 1 }, researchId)
    if (created.status !== "created") throw new Error("expected a dataset")

    expect(await deleteDraftDataset(db, { draftId, revision: 1 }, created.datasetId))
      .toEqual({ status: "refused" })
    expect(await db.select().from(s.dataset)).toHaveLength(1)
  })
})
