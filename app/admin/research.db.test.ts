import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { createDatasetInDraft, createResearchWithDraft, saveDatasetEntry, saveDraftContent } from "./drafts.server"
import { publishDraft } from "./publish.server"
import { deleteResearch } from "./research.server"

/**
 * Deleting a research, against the development database.
 *
 * The point of these is the invariants in docs/publishing.md の「破棄と削除」: what
 * composition takes with it, what the pin ledger frees, and what the event
 * outlives — even though the research it names no longer exists.
 */
const db = getDb()

const CURATOR = { sub: "0f3a-1b2c", name: "curator" }
const AS_VERSION = { kind: "version", releaseDate: "2026-08-10" } as const
const NO_PRIVATE_FILES: ReadonlySet<string> = new Set()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

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

/** A research with a hum label, a draft, and one described dataset that draft introduced. */
async function ready(label: string) {
  const created = await createResearchWithDraft(db)
  await pinHum(created.researchId, label)
  await saveDraftContent(db, { draftId: created.draftId, revision: 1 }, {
    note: "",
    content: titled("研究"),
  })
  const made = await createDatasetInDraft(db, { draftId: created.draftId, revision: 2 }, created.researchId)
  if (made.status !== "created") throw new Error(made.status)
  await pinDataset(made.datasetId, `${label}-NHA001`)
  const saved = await saveDatasetEntry(
    db,
    { draftId: created.draftId, datasetId: made.datasetId, revision: null },
    described("記述"),
  )
  if (saved.status !== "saved") throw new Error(saved.status)
  return { ...created, datasetId: made.datasetId, revision: 3 }
}

async function publish(ground: Awaited<ReturnType<typeof ready>>): Promise<void> {
  const outcome = await publishDraft(
    db,
    { at: { draftId: ground.draftId, revision: ground.revision }, mode: AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
    CURATOR,
  )
  if (outcome.status !== "published") throw new Error(outcome.status)
}

describe("deleting a research", () => {
  it("takes its datasets, its drafts and their change entries with it", async () => {
    const ground = await ready("hum0002")

    expect(await deleteResearch(db, ground.researchId, CURATOR)).toEqual({ status: "deleted" })

    expect(await db.select().from(s.research)).toHaveLength(0)
    expect(await db.select().from(s.researchDraft)).toHaveLength(0)
    expect(await db.select().from(s.dataset)).toHaveLength(0)
    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(0)
  })

  it("takes its published versions, their snapshots and the dataset content too", async () => {
    const ground = await ready("hum0003")
    await publish(ground)

    await deleteResearch(db, ground.researchId, CURATOR)

    expect(await db.select().from(s.researchVersion)).toHaveLength(0)
    expect(await db.select().from(s.contentSnapshot)).toHaveLength(0)
    expect(await db.select().from(s.datasetContent)).toHaveLength(0)
  })

  it("frees both the hum label and the dataset id to be pinned again", async () => {
    const ground = await ready("hum0004")

    await deleteResearch(db, ground.researchId, CURATOR)

    expect(await db.select().from(s.labelPin)).toHaveLength(0)
    // The same labels are free again — pinning them a second time is not a
    // unique-constraint violation.
    const another = await createResearchWithDraft(db)
    const other = await createDatasetInDraft(db, { draftId: another.draftId, revision: 1 }, another.researchId)
    if (other.status !== "created") throw new Error(other.status)
    await expect(pinHum(another.researchId, "hum0004")).resolves.toBeUndefined()
    await expect(pinDataset(other.datasetId, "hum0004-NHA001")).resolves.toBeUndefined()
  })

  it("takes the search rows with it, so it leaves the public side at the same moment", async () => {
    const ground = await ready("hum0005")
    await publish(ground)
    expect(await db.select().from(s.searchDoc)).not.toHaveLength(0)

    await deleteResearch(db, ground.researchId, CURATOR)

    expect(await db.select().from(s.searchDoc)).toHaveLength(0)
  })

  it("leaves the event behind, carrying the hum label the research had", async () => {
    const ground = await ready("hum0006")

    await deleteResearch(db, ground.researchId, CURATOR)

    // The research row that gave the event its subjectId is gone by the time
    // this reads, since event carries no foreign key to it.
    const events = await db.select().from(s.event).where(eq(s.event.action, "delete-research"))
    expect(events).toHaveLength(1)
    expect(events[0]?.subjectType).toBe("research")
    expect(events[0]?.subjectId).toBe(ground.researchId)
    expect(events[0]?.detail).toMatchObject({ humLabels: ["hum0006"] })
  })

  it("answers gone for a research that is not there, and writes no event", async () => {
    const outcome = await deleteResearch(db, randomUUID(), CURATOR)

    expect(outcome).toEqual({ status: "gone" })
    expect(await db.select().from(s.event)).toHaveLength(0)
  })
})
