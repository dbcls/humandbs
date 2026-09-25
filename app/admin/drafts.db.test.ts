import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { CommentAnchor, DatasetContent, ResearchContent } from "~/content/types"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedVersion } from "~/db/seed"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import {
  changeListing,
  createDatasetInDraft,
  createEmptyDraft,
  createResearchWithDraft,
  deleteResearchDataset,
  discardDraft,
  draftCopiedFrom,
  draftUpdating,
  renameDraft,
  saveDatasetEntry,
  saveDraftContent,
} from "./drafts.server"
import { withdrawVersion } from "./publish.server"
import {
  changedDatasets,
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

  it("responds with nothing for a number no version holds, and opens no draft", async () => {
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

describe("naming a draft", () => {
  const nameOf = async (draftId: string | null): Promise<string | undefined> =>
    (await readDraft(db, draftId ?? ""))?.name

  it("calls a new research's draft the first version it plans", async () => {
    const created = await createResearchWithDraft(db)
    expect(await nameOf(created.draftId)).toBe("v1 予定")
  })

  it("calls a draft after the highest number published, whatever it was made from and however the numbers run", async () => {
    const researchId = await createResearch()
    expect(await nameOf(await createEmptyDraft(db, researchId))).toBe("v1 予定")

    await publish(researchId, 1, titled("first"))
    await publish(researchId, 4, titled("fourth"))

    expect(await nameOf(await createEmptyDraft(db, researchId))).toBe("v5 予定")
    // A copy of v1 plans the next version too, not v2.
    expect(await nameOf(await draftCopiedFrom(db, researchId, 1))).toBe("v5 予定")
  })

  it("leaves an update without a name, since it is called by its version", async () => {
    const researchId = await createResearch()
    const versionId = await publish(researchId, 2, titled("out"))
    const opened = await draftUpdating(db, researchId, versionId)
    if (opened.status !== "opened") throw new Error(opened.status)

    expect(await nameOf(opened.draftId)).toBe("")
  })

  it("calls what a withdrawal leaves after the versions still out, so the number it gave up is planned again", async () => {
    const researchId = await createResearch()
    await publish(researchId, 1, titled("first"))
    const second = await publish(researchId, 2, titled("second"))

    const outcome = await withdrawVersion(db, second, CURATOR)

    if (outcome.status !== "withdrawn") throw new Error(outcome.status)
    expect(await nameOf(outcome.draftId)).toBe("v2 予定")
  })

  it("renames without moving the revision, and has no name to change on an update", async () => {
    const researchId = await createResearch()
    const draftId = await createEmptyDraft(db, researchId)
    const versionId = await publish(researchId, 1, titled("out"))
    const opened = await draftUpdating(db, researchId, versionId)
    if (opened.status !== "opened") throw new Error(opened.status)

    expect(await renameDraft(db, draftId, "図の差し替え")).toEqual({ status: "renamed" })
    expect(await readDraft(db, draftId)).toMatchObject({ name: "図の差し替え", revision: 1 })

    expect(await renameDraft(db, opened.draftId, "更新")).toEqual({ status: "gone" })
    expect(await nameOf(opened.draftId)).toBe("")
    expect(await renameDraft(db, randomUUID(), "無い")).toEqual({ status: "gone" })
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

  it("responds gone for a version of another research, and opens no draft", async () => {
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
  async function fixture(): Promise<{ researchId: string, draftId: string, a: string, b: string }> {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const made = await createDatasetInDraft(db, { draftId, revision: 1 }, researchId)
    const madeAgain = await createDatasetInDraft(db, { draftId, revision: 2 }, researchId)
    if (made.status !== "created" || madeAgain.status !== "created") throw new Error("not created")
    return { researchId, draftId, a: made.datasetId, b: madeAgain.datasetId }
  }

  async function listed(draftId: string): Promise<string[]> {
    return (await readDraft(db, draftId))?.content.datasetIds ?? []
  }

  it("moves a dataset one step, and leaves the end where it is", async () => {
    const { researchId, draftId, a, b } = await fixture()

    await changeListing(db, { draftId, revision: 3 }, researchId, { datasetId: b, by: -1 })
    expect(await listed(draftId)).toEqual([b, a])
    await changeListing(db, { draftId, revision: 4 }, researchId, { datasetId: b, by: -1 })
    expect(await listed(draftId)).toEqual([b, a])
  })

  it("moves one the order has never named, and writes the whole order back", async () => {
    const { researchId, draftId, a, b } = await fixture()
    // A draft that has never been ordered: the datasets are the research's all
    // the same, so the step is taken on what the screen shows.
    await saveDraftContent(db, { draftId, revision: 3 }, {
      content: { ...emptyResearchContent(), datasetIds: [] },
    })

    expect(await changeListing(db, { draftId, revision: 4 }, researchId, { datasetId: b, by: -1 }))
      .toEqual({ status: "changed" })

    // The whole order is written back, not just the step: the identities are
    // time-ordered, so a was made first and b now comes before it.
    expect(await listed(draftId)).toEqual([b, a])
  })

  it("refuses a revision that has moved, and a draft that is gone", async () => {
    const { researchId, draftId, a } = await fixture()

    expect(await changeListing(db, { draftId, revision: 1 }, researchId, { datasetId: a, by: 1 }))
      .toEqual({ status: "conflict" })
    expect(await listed(draftId)).toHaveLength(2)
    expect(await changeListing(db, { draftId: randomUUID(), revision: 1 }, researchId, { datasetId: a, by: 1 }))
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
    await db.insert(s.comment).values({
      draftId,
      anchor: { kind: "research-field", path: "title" },
      authorName: "a provider",
      body: "please confirm",
    })
    await db.insert(s.reviewAcknowledgement).values({ draftId, kind: "commented", actorName: "a provider" })
  }

  it("takes the entries, the comments and its own datasets", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    await hangEverythingOff(draftId, researchId)

    expect(await discardDraft(db, { draftId, revision: 1 }, CURATOR))
      .toEqual({ status: "discarded" })

    expect(await db.select().from(s.researchDraft)).toHaveLength(0)
    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(0)
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
   * is compared against is chosen when somebody requests a comparison.
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

describe("which datasets a draft has changed", () => {
  async function makeDataset(researchId: string): Promise<string> {
    return only(await db.insert(s.dataset).values({ researchId }).returning({ id: s.dataset.id })).id
  }

  it("counts none of what it copied from a version and has not touched", async () => {
    const researchId = await createResearch()
    const [one, two] = [await makeDataset(researchId), await makeDataset(researchId)]
    await publish(researchId, 1, titled("v1"), [
      { datasetId: one, content: described("one") },
      { datasetId: two, content: withExperiment("WGS") },
    ])
    const draftId = await draftCopiedFrom(db, researchId, 1)
    if (draftId === null) throw new Error("no draft")

    expect(await changedDatasets(db, draftId, researchId, null)).toEqual(new Set())
  })

  it("counts a dataset saved with a different value, and only that one", async () => {
    const researchId = await createResearch()
    const [one, two] = [await makeDataset(researchId), await makeDataset(researchId)]
    await publish(researchId, 1, titled("v1"), [
      { datasetId: one, content: described("one") },
      { datasetId: two, content: described("two") },
    ])
    const draftId = await draftCopiedFrom(db, researchId, 1)
    if (draftId === null) throw new Error("no draft")

    await saveDatasetEntry(db, { draftId, datasetId: two, revision: 1 }, described("two, edited"))

    expect(await changedDatasets(db, draftId, researchId, null)).toEqual(new Set([two]))
  })

  it("stops counting a dataset written back to what the version has", async () => {
    const researchId = await createResearch()
    const datasetId = await makeDataset(researchId)
    await publish(researchId, 1, titled("v1"), [{ datasetId, content: described("one") }])
    const draftId = await draftCopiedFrom(db, researchId, 1)
    if (draftId === null) throw new Error("no draft")

    await saveDatasetEntry(db, { draftId, datasetId, revision: 1 }, described("edited"))
    await saveDatasetEntry(db, { draftId, datasetId, revision: 2 }, described("one"))

    expect(await changedDatasets(db, draftId, researchId, null)).toEqual(new Set())
  })

  it("counts a dataset no version lists once the draft has written it", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const written = await makeDataset(researchId)
    const unwritten = await makeDataset(researchId)
    await saveDatasetEntry(db, { draftId, datasetId: written, revision: null }, emptyDatasetContent())

    const changed = await changedDatasets(db, draftId, researchId, null)

    expect(changed).toEqual(new Set([written]))
    expect(changed.has(unwritten)).toBe(false)
  })

  it("compares an update with the version it updates, not with the newest", async () => {
    const researchId = await createResearch()
    const datasetId = await makeDataset(researchId)
    const first = await publish(researchId, 1, titled("v1"), [{ datasetId, content: described("old") }])
    await publish(researchId, 2, titled("v2"), [{ datasetId, content: described("new") }])
    const opened = await draftUpdating(db, researchId, first)
    if (opened.status !== "opened") throw new Error(opened.status)

    expect(await changedDatasets(db, opened.draftId, researchId, first)).toEqual(new Set())
    expect(await changedDatasets(db, opened.draftId, researchId, null)).toEqual(new Set([datasetId]))
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

  it("goes out of the research with its entry, and out of the order", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const created = await createDatasetInDraft(db, { draftId, revision: 1 }, researchId)
    if (created.status !== "created") throw new Error("expected a dataset")
    await saveDatasetEntry(db, { draftId, datasetId: created.datasetId, revision: null }, described("wip"))

    expect(await deleteResearchDataset(db, { draftId, revision: 2 }, researchId, created.datasetId, CURATOR))
      .toEqual({ status: "deleted" })

    expect(await db.select().from(s.dataset)).toHaveLength(0)
    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(0)
    expect((await readDraft(db, draftId))?.content.datasetIds).toEqual([])
  })

  it("takes a published one out too, with its published row, and reports it in the trail", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const created = await createDatasetInDraft(db, { draftId, revision: 1 }, researchId)
    if (created.status !== "created") throw new Error("expected a dataset")
    // Publishing is what clears `originDraftId` and writes the published row.
    await db.update(s.dataset).set({ originDraftId: null })
      .where(eq(s.dataset.id, created.datasetId))
    await db.insert(s.labelPin)
      .values({ kind: "dataset", label: "JGAD000999", datasetId: created.datasetId, isPrimary: true })
    await db.insert(s.searchDoc).values({
      targetType: "dataset",
      targetId: created.datasetId,
      researchId,
      humLabel: "hum0001",
      datasetLabel: "JGAD000999",
      content: emptyDatasetContent(),
      title: "",
      textJa: "",
      textEn: "",
    })

    expect(await deleteResearchDataset(db, { draftId, revision: 2 }, researchId, created.datasetId, CURATOR))
      .toEqual({ status: "deleted" })

    expect(await db.select().from(s.dataset)).toHaveLength(0)
    // The published row is what the public side reads, so it goes at once.
    expect(await db.select().from(s.searchDoc)).toHaveLength(0)
    // The pin goes by cascade, which frees the accession to be pinned again.
    expect(await db.select().from(s.labelPin)).toHaveLength(0)
    const [event] = await db.select().from(s.event).where(eq(s.event.action, "delete-dataset"))
    expect(event?.subjectId).toBe(created.datasetId)
    expect(event?.detail).toEqual({ researchId, label: "JGAD000999" })
  })

  /** A published one whose research is found by its text, and a dataset of it that nothing else mentions. */
  async function publishedPair() {
    const { researchId, draftId } = await createResearchWithDraft(db)
    await db.insert(s.labelPin).values({ kind: "hum", label: "hum0001", researchId, isPrimary: true })
    const ids: string[] = []
    for (const label of ["JGAD000901", "JGAD000902"]) {
      const row = only(await db.insert(s.dataset).values({ researchId }).returning({ id: s.dataset.id }))
      await db.insert(s.labelPin).values({ kind: "dataset", label, datasetId: row.id, isPrimary: true })
      ids.push(row.id)
    }
    const [going = "", staying = ""] = ids
    await seedVersion(db, {
      researchId,
      number: 1,
      datasets: [
        { datasetId: going, content: described("消える側だけの語") },
        { datasetId: staying, content: described("残る側の語") },
      ],
    })
    await rebuildSearchDocs(db, { researchIds: [researchId] })
    const researchRow = async () => only(await db.select().from(s.searchDoc)
      .where(eq(s.searchDoc.targetType, "research")))
    return { researchId, draftId, going, staying, researchRow }
  }

  /**
   * The research's row has the text of its datasets. Dropping the dataset's
   * own row alone left the research found by what only the deleted dataset
   * said, until something else rebuilt it.
   */
  it("rebuilds the research's search row, so it is no longer found by the deleted dataset", async () => {
    const { researchId, draftId, going, researchRow } = await publishedPair()
    expect((await researchRow()).textJa).toContain("消える側だけの語")

    expect(await deleteResearchDataset(db, { draftId, revision: 1 }, researchId, going, CURATOR))
      .toEqual({ status: "deleted" })

    const row = await researchRow()
    expect(row.textJa).not.toContain("消える側だけの語")
    expect(row.textJa).toContain("残る側の語")
    const datasets = await db.select({ id: s.searchDoc.targetId }).from(s.searchDoc)
      .where(eq(s.searchDoc.targetType, "dataset"))
    expect(datasets.map((one) => one.id)).not.toContain(going)
  })

  /**
   * A comment is anchored in JSON, so no cascade reaches it: left behind, it
   * pointed at a place no screen draws and was counted as unresolved for good.
   */
  it("takes the comments on it away, in every draft, and leaves the others", async () => {
    const { researchId, draftId, going, staying } = await publishedPair()
    const otherDraftId = await createEmptyDraft(db, researchId)
    const on = (draft: string, anchor: CommentAnchor) =>
      db.insert(s.comment).values({ draftId: draft, anchor, authorName: "提供者", body: "…" })
    await on(draftId, { kind: "dataset-field", datasetId: going, path: "values.type-of-data" })
    await on(otherDraftId, { kind: "dataset-field", datasetId: going, path: "values.type-of-data" })
    await on(draftId, { kind: "dataset-field", datasetId: staying, path: "values.type-of-data" })
    await on(draftId, { kind: "draft" })

    await deleteResearchDataset(db, { draftId, revision: 1 }, researchId, going, CURATOR)

    const left = await db.select({ anchor: s.comment.anchor }).from(s.comment)
    expect(left.map((one) => one.anchor).toSorted((a, b) => a.kind.localeCompare(b.kind))).toEqual([
      { kind: "dataset-field", datasetId: staying, path: "values.type-of-data" },
      { kind: "draft" },
    ])
  })

  it("cannot take out one that belongs to another draft", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const otherDraftId = await createEmptyDraft(db, researchId)
    const created = await createDatasetInDraft(db, { draftId: otherDraftId, revision: 1 }, researchId)
    if (created.status !== "created") throw new Error("expected a dataset")

    expect(await deleteResearchDataset(db, { draftId, revision: 1 }, researchId, created.datasetId, CURATOR))
      .toEqual({ status: "refused" })
    expect(await db.select().from(s.dataset)).toHaveLength(1)
  })

  it("cannot take out one of another research", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const other = await createResearchWithDraft(db)
    const theirs = await createDatasetInDraft(db, { draftId: other.draftId, revision: 1 }, other.researchId)
    if (theirs.status !== "created") throw new Error("expected a dataset")

    expect(await deleteResearchDataset(db, { draftId, revision: 1 }, researchId, theirs.datasetId, CURATOR))
      .toEqual({ status: "refused" })
    expect(await db.select().from(s.dataset)).toHaveLength(1)
  })
})
