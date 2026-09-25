import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { PRIVATE_BUCKET, privatePrefix, PUBLIC_BUCKET, publicPrefix } from "~/files/prefix"
import { clearPrefix, keysUnder, putTestObject } from "~/files/_store"

import { createDatasetInDraft, createResearchWithDraft, saveDatasetEntry, saveDraftContent } from "./drafts.server"
import { publishDraft } from "./publish.server"
import { deleteResearch } from "./research.server"

/**
 * Deleting a research, against the development database.
 *
 * The point of these is the invariants around it: what composition takes with
 * it, what the `label_pin` table frees, and what the event outlives — even though
 * the research it identifies no longer exists.
 */
const db = getDb()

const CURATOR = { sub: "0f3a-1b2c", name: "curator" }
const AS_VERSION = { number: 1, releaseDate: "2026-08-10" } as const
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

async function publish(fixture: Awaited<ReturnType<typeof ready>>): Promise<void> {
  const outcome = await publishDraft(
    db,
    { at: { draftId: fixture.draftId, revision: fixture.revision }, ...AS_VERSION, acknowledged: true, privateFiles: NO_PRIVATE_FILES },
    CURATOR,
  )
  if (outcome.status !== "published") throw new Error(outcome.status)
}

describe("deleting a research", () => {
  it("takes its datasets, its drafts and their change entries with it", async () => {
    const fixture = await ready("hum5202")

    expect(await deleteResearch(db, fixture.researchId, CURATOR)).toEqual({ status: "deleted" })

    expect(await db.select().from(s.research)).toHaveLength(0)
    expect(await db.select().from(s.researchDraft)).toHaveLength(0)
    expect(await db.select().from(s.dataset)).toHaveLength(0)
    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(0)
  })

  it("takes its published versions, their snapshots and the dataset content too", async () => {
    const fixture = await ready("hum5203")
    await publish(fixture)

    await deleteResearch(db, fixture.researchId, CURATOR)

    expect(await db.select().from(s.researchVersion)).toHaveLength(0)
    expect(await db.select().from(s.dataset)).toHaveLength(0)
  })

  it("frees both the hum label and the dataset id to be pinned again", async () => {
    const fixture = await ready("hum5204")

    await deleteResearch(db, fixture.researchId, CURATOR)

    expect(await db.select().from(s.labelPin)).toHaveLength(0)
    // The same labels are free again — pinning them a second time is not a
    // unique-constraint violation.
    const another = await createResearchWithDraft(db)
    const other = await createDatasetInDraft(db, { draftId: another.draftId, revision: 1 }, another.researchId)
    if (other.status !== "created") throw new Error(other.status)
    await expect(pinHum(another.researchId, "hum5204")).resolves.toBeUndefined()
    await expect(pinDataset(other.datasetId, "hum5204-NHA001")).resolves.toBeUndefined()
  })

  it("takes the search rows with it, so it leaves the public side at the same moment", async () => {
    const fixture = await ready("hum5205")
    await publish(fixture)
    expect(await db.select().from(s.searchDoc)).not.toHaveLength(0)

    await deleteResearch(db, fixture.researchId, CURATOR)

    expect(await db.select().from(s.searchDoc)).toHaveLength(0)
  })

  it("leaves the event behind, with the hum label the research had", async () => {
    const fixture = await ready("hum5206")

    await deleteResearch(db, fixture.researchId, CURATOR)

    // The research row that gave the event its subjectId is gone by the time
    // this reads, since event has no foreign key to it.
    const events = await db.select().from(s.event).where(eq(s.event.action, "delete-research"))
    expect(events).toHaveLength(1)
    expect(events[0]?.subjectType).toBe("research")
    expect(events[0]?.subjectId).toBe(fixture.researchId)
    expect(events[0]?.detail).toMatchObject({ humLabels: ["hum5206"] })
  })

  describe("with files in its prefixes", () => {
    const LABEL = "hum5101"
    const RETIRED = "hum5102"
    let researchId = ""

    afterEach(async () => {
      for (const label of [LABEL, RETIRED]) await clearPrefix(PUBLIC_BUCKET, publicPrefix(label))
      if (researchId !== "") await clearPrefix(PRIVATE_BUCKET, privatePrefix(researchId))
      researchId = ""
    })

    /**
     * The rows go and the objects would not: the public ones kept responding at
     * `/files/hum…/`, and the research given that number next listed them as
     * its own.
     */
    it("refuses while a public prefix, the current one or a retired one, holds a file, and changes nothing", async () => {
      const fixture = await ready(LABEL)
      researchId = fixture.researchId
      await db.insert(s.labelPin).values({ kind: "hum", label: RETIRED, researchId, isPrimary: false })
      await putTestObject(PUBLIC_BUCKET, `${publicPrefix(RETIRED)}a.zip`)

      expect(await deleteResearch(db, researchId, CURATOR)).toEqual({ status: "files-remain" })

      expect(await db.select().from(s.research)).toHaveLength(1)
      expect(await db.select().from(s.labelPin)).toHaveLength(3)
      expect(await db.select().from(s.event).where(eq(s.event.action, "delete-research"))).toHaveLength(0)
      expect(await keysUnder(PUBLIC_BUCKET, publicPrefix(RETIRED))).toEqual([`${publicPrefix(RETIRED)}a.zip`])
    })

    it("refuses while the private prefix holds a file", async () => {
      const fixture = await ready(LABEL)
      researchId = fixture.researchId
      await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)

      expect(await deleteResearch(db, researchId, CURATOR)).toEqual({ status: "files-remain" })
      expect(await db.select().from(s.research)).toHaveLength(1)
    })

    it("deletes once the files are gone", async () => {
      const fixture = await ready(LABEL)
      researchId = fixture.researchId
      await putTestObject(PUBLIC_BUCKET, `${publicPrefix(LABEL)}a.zip`)
      expect(await deleteResearch(db, researchId, CURATOR)).toEqual({ status: "files-remain" })

      await clearPrefix(PUBLIC_BUCKET, publicPrefix(LABEL))

      expect(await deleteResearch(db, researchId, CURATOR)).toEqual({ status: "deleted" })
    })
  })

  it("reports gone for a research that is not there, and writes no event", async () => {
    const outcome = await deleteResearch(db, randomUUID(), CURATOR)

    expect(outcome).toEqual({ status: "gone" })
    expect(await db.select().from(s.event)).toHaveLength(0)
  })
})
