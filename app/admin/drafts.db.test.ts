import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { ResearchContent } from "~/content/types"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import {
  createDraft,
  createResearchWithDraft,
  discardDraft,
  saveDraftContent,
} from "./drafts.server"
import { readDraft } from "./queries.server"

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

async function createResearch(): Promise<string> {
  return only(await db.insert(s.research).values({}).returning({ id: s.research.id })).id
}

async function publish(
  researchId: string,
  number: number,
  content: ResearchContent,
  options: { published?: boolean } = {},
): Promise<string> {
  const snapshot = only(await db.insert(s.contentSnapshot)
    .values({ researchId, content })
    .returning({ id: s.contentSnapshot.id }))
  await db.insert(s.researchVersion).values({
    researchId,
    number,
    snapshotId: snapshot.id,
    releaseDate: "2020-01-01",
    published: options.published ?? true,
  })
  return snapshot.id
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
  it("copies the latest published version and remembers the snapshot it came from", async () => {
    const researchId = await createResearch()
    await publish(researchId, 1, titled("first"))
    const latest = await publish(researchId, 4, titled("fourth"))

    const draftId = await createDraft(db, researchId)

    const draft = await readDraft(db, draftId)
    expect(draft?.content.title.ja).toEqual(filled("fourth"))
    const rows = await db
      .select({ parent: s.researchDraft.parentSnapshotId })
      .from(s.researchDraft)
      .where(eq(s.researchDraft.id, draftId))
    expect(only(rows).parent).toBe(latest)
  })

  it("does not start from a version that has been withdrawn", async () => {
    const researchId = await createResearch()
    await publish(researchId, 1, titled("published"))
    await publish(researchId, 2, titled("withdrawn"), { published: false })

    const draft = await readDraft(db, await createDraft(db, researchId))

    expect(draft?.content.title.ja).toEqual(filled("published"))
  })

  it("starts empty, with no parent, when nothing has ever been published", async () => {
    const researchId = await createResearch()
    await publish(researchId, 1, titled("withdrawn"), { published: false })

    const draftId = await createDraft(db, researchId)

    const draft = await readDraft(db, draftId)
    expect(draft?.content).toEqual(emptyResearchContent())
    const rows = await db
      .select({ parent: s.researchDraft.parentSnapshotId })
      .from(s.researchDraft)
      .where(eq(s.researchDraft.id, draftId))
    expect(only(rows).parent).toBeNull()
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
      .values({ draftId, snapshot: { content: emptyResearchContent(), datasetEntries: [] } })
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
