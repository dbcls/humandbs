import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, filled } from "~/content/empty"
import type { DatasetContent } from "~/content/types"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedDataset, seedResearch, seedVersion, versionContent } from "~/db/seed"

import { draftUpdating } from "./drafts.server"
import { readDatasetEntry, readDraft } from "./queries.server"
import { draftFromBackup, readBackupVersion } from "./restore.server"

/**
 * The backup and the live database are the same test database here: what is
 * read from the backup is only a label lookup and a version row, and what is
 * written is checked against a version passed in, so a backup that differs
 * from the live database is a `BackupVersion` built to differ.
 */
const db = getDb()

const NAME = "2026-09-23 の backup から"

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

function described(text: string): DatasetContent {
  return {
    ...emptyDatasetContent(),
    values: [{
      keyId: "type-of-data",
      value: { kind: "text", text: { ja: filled([[{ text }]]), en: { state: "unknown" } } },
    }],
  }
}

function titled(title: string) {
  return { title: { ja: filled(title), en: filled("") } }
}

async function draftsOf(researchId: string) {
  return db.select().from(s.researchDraft).where(eq(s.researchDraft.researchId, researchId))
}

describe("readBackupVersion", () => {
  it("reads the version under the number of the research the label is pinned to", async () => {
    const researchId = await seedResearch(db, "hum0009")
    await seedVersion(db, { researchId, number: 1, body: titled("first") })
    await seedVersion(db, { researchId, number: 2, body: titled("second") })

    const version = await readBackupVersion(db, "hum0009", 1)

    expect(version?.researchId).toBe(researchId)
    expect(version?.content.title.ja).toEqual(filled("first"))
  })

  it("finds a research by a secondary label as well", async () => {
    const researchId = await seedResearch(db, "hum0009")
    await db.insert(s.labelPin).values({ kind: "hum", label: "hum0010", researchId, isPrimary: false })
    await seedVersion(db, { researchId, number: 1, body: titled("first") })

    expect((await readBackupVersion(db, "hum0010", 1))?.researchId).toBe(researchId)
  })

  it("is null for a number the research has no version under, and for a label pinned to nothing", async () => {
    const researchId = await seedResearch(db, "hum0009")
    await seedVersion(db, { researchId, number: 1 })
    const other = await seedResearch(db, "hum0011")
    await seedVersion(db, { researchId: other, number: 2 })

    expect(await readBackupVersion(db, "hum0009", 2)).toBeNull()
    expect(await readBackupVersion(db, "hum0012", 1)).toBeNull()
    expect(await readBackupVersion(db, "HUM0009", 1)).toBeNull()
  })
})

describe("draftFromBackup", () => {
  it("writes the backup's content as a new draft under the name given, leaving the published version as it is", async () => {
    const researchId = await seedResearch(db, "hum0009")
    const datasetId = await seedDataset(db, researchId, "JGAD000001")
    await seedVersion(db, {
      researchId,
      number: 1,
      body: titled("updated by mistake"),
      datasets: [{ datasetId, content: described("now") }],
    })
    const published = await db.select().from(s.researchVersion)

    const outcome = await draftFromBackup(db, "hum0009", {
      researchId,
      content: versionContent([{ datasetId, content: described("then") }], titled("as it was")),
    }, NAME)

    if (outcome.status !== "created") throw new Error(`expected a draft, got ${outcome.status}`)
    const draft = await readDraft(db, outcome.draftId)
    expect(draft?.researchId).toBe(researchId)
    expect(draft?.name).toBe(NAME)
    expect(draft?.content.title.ja).toEqual(filled("as it was"))
    expect(draft?.content.datasetIds).toEqual([datasetId])
    expect((await readDatasetEntry(db, outcome.draftId, datasetId))?.content).toEqual(described("then"))
    const [row] = await draftsOf(researchId)
    expect(row?.replacesVersionId).toBeNull()
    expect(await db.select().from(s.researchVersion)).toEqual(published)
  })

  it("writes a new draft beside the update a version already has open, and again when asked again", async () => {
    const researchId = await seedResearch(db, "hum0009")
    const versionId = await seedVersion(db, { researchId, number: 1, body: titled("first") })
    const updating = await draftUpdating(db, researchId, versionId)
    if (updating.status !== "opened") throw new Error("expected the update")
    const version = await readBackupVersion(db, "hum0009", 1)
    if (version === null) throw new Error("expected the version")

    expect((await draftFromBackup(db, "hum0009", version, NAME)).status).toBe("created")
    expect((await draftFromBackup(db, "hum0009", version, NAME)).status).toBe("created")

    const drafts = await draftsOf(researchId)
    expect(drafts).toHaveLength(3)
    expect(drafts.find((row) => row.id === updating.draftId)?.replacesVersionId).toBe(versionId)
    expect(drafts.filter((row) => row.id !== updating.draftId).map((row) => [row.name, row.replacesVersionId]))
      .toEqual([[NAME, null], [NAME, null]])
  })

  it("leaves out a dataset deleted since the backup", async () => {
    const researchId = await seedResearch(db, "hum0009")
    const kept = await seedDataset(db, researchId, "JGAD000001")
    const deleted = randomUUID()

    const outcome = await draftFromBackup(db, "hum0009", {
      researchId,
      content: versionContent([
        { datasetId: deleted, content: described("gone") },
        { datasetId: kept, content: described("kept") },
      ]),
    }, NAME)

    if (outcome.status !== "created") throw new Error(`expected a draft, got ${outcome.status}`)
    expect((await readDraft(db, outcome.draftId))?.content.datasetIds).toEqual([kept])
    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(1)
  })

  it("writes nothing when the label is pinned to another research now", async () => {
    const then = await seedResearch(db, "hum0009")
    await db.delete(s.labelPin).where(eq(s.labelPin.researchId, then))
    const now = await seedResearch(db, "hum0009")

    const outcome = await draftFromBackup(db, "hum0009", { researchId: then, content: versionContent() }, NAME)

    expect(outcome).toEqual({ status: "elsewhere" })
    expect(await db.select().from(s.researchDraft)).toHaveLength(0)
    expect(await draftsOf(now)).toHaveLength(0)
  })

  it("writes nothing when the label is pinned to nothing now, or the research has been deleted", async () => {
    const unpinned = await seedResearch(db, "hum0009")
    await db.delete(s.labelPin).where(eq(s.labelPin.researchId, unpinned))

    expect(await draftFromBackup(db, "hum0009", { researchId: unpinned, content: versionContent() }, NAME))
      .toEqual({ status: "elsewhere" })
    expect(await draftFromBackup(db, "hum0010", { researchId: randomUUID(), content: versionContent() }, NAME))
      .toEqual({ status: "elsewhere" })
    expect(await db.select().from(s.researchDraft)).toHaveLength(0)
  })
})
