import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent } from "~/content/empty"
import type { VersionContent } from "~/content/types"

import { closePools, getDb, getOwnerDb, type Database } from "./client.server"
import { emptyDatabase } from "./empty.server"
import * as s from "./schema"

/**
 * These run against the test database, so they need `docker compose up`.
 * Each one starts from an empty database, which keeps them independent of the
 * order they run in.
 */
const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

/** `noUncheckedIndexedAccess` makes every indexed read optional; this says why. */
function only<T>(rows: T[]): T {
  const [row] = rows
  if (row === undefined) {
    throw new Error("expected exactly one row")
  }
  return row
}

async function createResearch(tx: Database = db): Promise<string> {
  const row = only(await tx.insert(s.research).values({}).returning({ id: s.research.id }))
  return row.id
}

async function createDraft(researchId: string, token: string): Promise<string> {
  const row = only(await db.insert(s.researchDraft).values({
    researchId,
    content: emptyResearchContent(),
    shareToken: token,
  }).returning({ id: s.researchDraft.id }))
  return row.id
}

async function createDataset(researchId: string, originDraftId?: string): Promise<string> {
  const row = only(await db.insert(s.dataset).values({ researchId, originDraftId })
    .returning({ id: s.dataset.id }))
  return row.id
}

function versionContent(datasetIds: string[] = []): VersionContent {
  const { datasetIds: listed, ...body } = emptyResearchContent()
  void listed
  return { ...body, datasets: datasetIds.map((datasetId) => ({ datasetId, ...emptyDatasetContent() })) }
}

async function publishVersion(
  researchId: string,
  number: number,
  datasetIds: string[] = [],
): Promise<string> {
  const version = only(await db.insert(s.researchVersion).values({
    researchId,
    number,
    content: versionContent(datasetIds),
    releaseDate: "2026-08-05",
  }).returning({ id: s.researchVersion.id }))
  return version.id
}

describe("label_pin", () => {
  it("refuses a label that another identity already holds", async () => {
    const a = await createResearch()
    const b = await createResearch()
    await db.insert(s.labelPin).values({ kind: "hum", label: "hum0001", researchId: a, isPrimary: true })

    await expect(
      db.insert(s.labelPin).values({ kind: "hum", label: "hum0001", researchId: b, isPrimary: true }),
    ).rejects.toThrow()
  })

  it("refuses a dataset id that another dataset already holds, even as a secondary", async () => {
    const researchId = await createResearch()
    const a = await createDataset(researchId)
    const b = await createDataset(researchId)
    await db.insert(s.labelPin).values({ kind: "dataset", label: "JGAD000001", datasetId: a, isPrimary: true })

    await expect(
      db.insert(s.labelPin).values({ kind: "dataset", label: "JGAD000001", datasetId: b, isPrimary: false }),
    ).rejects.toThrow()
  })

  it("lets a label be pinned again once it is released", async () => {
    const a = await createResearch()
    const b = await createResearch()
    await db.insert(s.labelPin).values({ kind: "hum", label: "hun0488", researchId: a, isPrimary: true })
    await db.delete(s.labelPin).where(eq(s.labelPin.label, "hun0488"))

    await db.insert(s.labelPin).values({ kind: "hum", label: "hun0488", researchId: b, isPrimary: true })
    const rows = await db.select().from(s.labelPin).where(eq(s.labelPin.label, "hun0488"))
    expect(rows).toHaveLength(1)
    expect(only(rows).researchId).toBe(b)
  })

  it("lets one dataset hold a primary id and several secondary ones", async () => {
    const researchId = await createResearch()
    const datasetId = await createDataset(researchId)

    await db.insert(s.labelPin).values([
      { kind: "dataset", label: "hum0014-NHA001", datasetId, isPrimary: true },
      { kind: "dataset", label: "hum0014.v1.ht.v1", datasetId, isPrimary: false },
      { kind: "dataset", label: "hum0014.v1.HT.v1", datasetId, isPrimary: false },
    ])

    const rows = await db.select().from(s.labelPin).where(eq(s.labelPin.datasetId, datasetId))
    expect(rows).toHaveLength(3)
    expect(rows.filter((r) => r.isPrimary)).toHaveLength(1)
  })

  it("refuses a second primary label on the same identity", async () => {
    const researchId = await createResearch()
    await db.insert(s.labelPin).values({ kind: "hum", label: "hum0001", researchId, isPrimary: true })

    await expect(
      db.insert(s.labelPin).values({ kind: "hum", label: "hum0002", researchId, isPrimary: true }),
    ).rejects.toThrow()
  })

  it("refuses a pin whose subject does not match its kind", async () => {
    const researchId = await createResearch()
    const datasetId = await createDataset(researchId)

    await expect(
      db.insert(s.labelPin).values({ kind: "hum", label: "hum0003", datasetId, isPrimary: true }),
    ).rejects.toThrow()
    await expect(
      db.insert(s.labelPin).values({ kind: "hum", label: "hum0003", researchId, datasetId, isPrimary: true }),
    ).rejects.toThrow()
    await expect(
      db.insert(s.labelPin).values({ kind: "hum", label: "hum0003", isPrimary: true }),
    ).rejects.toThrow()
  })
})

describe("research_version", () => {
  it("refuses two versions with the same number under one research", async () => {
    const researchId = await createResearch()
    await publishVersion(researchId, 1)

    await expect(publishVersion(researchId, 1)).rejects.toThrow()
  })

  it("allows the same number under a different research", async () => {
    const a = await createResearch()
    const b = await createResearch()
    await publishVersion(a, 1)

    await expect(publishVersion(b, 1)).resolves.toBeTypeOf("string")
  })

  it("leaves a gap where a version was withdrawn", async () => {
    const researchId = await createResearch()
    await publishVersion(researchId, 1)
    const withdrawn = await publishVersion(researchId, 2)
    await publishVersion(researchId, 3)

    await db.delete(s.researchVersion).where(eq(s.researchVersion.id, withdrawn))

    const held = await db.select().from(s.researchVersion)
      .where(eq(s.researchVersion.researchId, researchId))
    expect(held.map((v) => v.number).sort()).toEqual([1, 3])
    // The gap is why visibility can never be decided by comparing against a
    // highest number: v1..latest would let the withdrawn v2 back through.
  })

  /**
   * The number is what a version is addressed by, so it may be given again once
   * the version holding it is gone — and only then.
   */
  it("frees a number once the version holding it is gone", async () => {
    const researchId = await createResearch()
    const first = await publishVersion(researchId, 1)

    await expect(publishVersion(researchId, 1)).rejects.toThrow()

    await db.delete(s.researchVersion).where(eq(s.researchVersion.id, first))
    await expect(publishVersion(researchId, 1)).resolves.toBeTypeOf("string")
  })
})

describe("draft_dataset_entry", () => {
  it("lets two drafts hold different content for the same dataset", async () => {
    const researchId = await createResearch()
    const datasetId = await createDataset(researchId)
    const first = await createDraft(researchId, "token-a")
    const second = await createDraft(researchId, "token-b")

    const base = emptyDatasetContent()
    await db.insert(s.draftDatasetEntry).values([
      { draftId: first, datasetId, content: { ...base, releaseDate: "2026-01-01" } },
      { draftId: second, datasetId, content: { ...base, releaseDate: "2026-02-02" } },
    ])

    const rows = await db.select().from(s.draftDatasetEntry).where(eq(s.draftDatasetEntry.datasetId, datasetId))
    expect(rows.map((r) => r.content.releaseDate).sort()).toEqual(["2026-01-01", "2026-02-02"])
  })

  it("refuses a second entry for the same dataset within one draft", async () => {
    const researchId = await createResearch()
    const datasetId = await createDataset(researchId)
    const draftId = await createDraft(researchId, "token-a")
    await db.insert(s.draftDatasetEntry).values({ draftId, datasetId, content: emptyDatasetContent() })

    await expect(
      db.insert(s.draftDatasetEntry).values({ draftId, datasetId, content: emptyDatasetContent() }),
    ).rejects.toThrow()
  })
})

describe("discarding a draft", () => {
  it("takes the entries and comments with it", async () => {
    const researchId = await createResearch()
    const datasetId = await createDataset(researchId)
    const draftId = await createDraft(researchId, "token-a")
    await db.insert(s.draftDatasetEntry).values({ draftId, datasetId, content: emptyDatasetContent() })
    await db.insert(s.comment).values({
      draftId,
      anchor: { kind: "research-field", path: "summary.aims" },
      authorName: "provider",
      body: "please confirm",
    })
    await db.insert(s.reviewAcknowledgement).values({ draftId, kind: "approved", actorName: "provider" })

    await db.delete(s.researchDraft).where(eq(s.researchDraft.id, draftId))

    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(0)
    expect(await db.select().from(s.comment)).toHaveLength(0)
    expect(await db.select().from(s.reviewAcknowledgement)).toHaveLength(0)
  })

  it("removes datasets the draft introduced and keeps ones it only edited", async () => {
    const researchId = await createResearch()
    const draftId = await createDraft(researchId, "token-a")
    const existing = await createDataset(researchId)
    await createDataset(researchId, draftId)
    await publishVersion(researchId, 1, [existing])
    await db.insert(s.draftDatasetEntry).values({
      draftId,
      datasetId: existing,
      content: emptyDatasetContent(),
    })

    await db.delete(s.researchDraft).where(eq(s.researchDraft.id, draftId))

    const remaining = await db.select().from(s.dataset)
    expect(remaining.map((d) => d.id)).toEqual([existing])
    // The version still describes it: what the draft held was a copy.
    expect(only(await db.select().from(s.researchVersion)).content.datasets).toHaveLength(1)
  })
})

describe("hum_accession", () => {
  it("holds many accessions for one hum but never one accession twice", async () => {
    await db.insert(s.humAccession).values([
      { accession: "JGAD000001", humLabel: "hum0001", kind: "jga-dataset" },
      { accession: "JGAD000002", humLabel: "hum0001", kind: "jga-dataset" },
      { accession: "JGAS000001", humLabel: "hum0001", kind: "jga-study" },
    ])

    const rows = await db.select().from(s.humAccession).where(eq(s.humAccession.humLabel, "hum0001"))
    expect(rows).toHaveLength(3)

    await expect(
      db.insert(s.humAccession).values({ accession: "JGAD000001", humLabel: "hum0002", kind: "jga-dataset" }),
    ).rejects.toThrow()
  })
})

describe("deleting a research", () => {
  it("takes its datasets, versions and pins with it", async () => {
    const researchId = await createResearch()
    const datasetId = await createDataset(researchId)
    await publishVersion(researchId, 1, [datasetId])
    await db.insert(s.labelPin).values([
      { kind: "hum", label: "hum0001", researchId, isPrimary: true },
      { kind: "dataset", label: "JGAD000001", datasetId, isPrimary: true },
    ])

    await db.delete(s.research).where(eq(s.research.id, researchId))

    expect(await db.select().from(s.dataset)).toHaveLength(0)
    expect(await db.select().from(s.researchVersion)).toHaveLength(0)
    expect(await db.select().from(s.labelPin)).toHaveLength(0)
  })

  it("leaves the event log behind", async () => {
    const researchId = await createResearch()
    await db.insert(s.event).values({
      actorSub: "sub-1",
      actorName: "curator",
      action: "delete-research",
      subjectType: "research",
      subjectId: researchId,
    })

    await db.delete(s.research).where(eq(s.research.id, researchId))

    const events = await db.select().from(s.event)
    expect(events).toHaveLength(1)
    expect(only(events).subjectId).toBe(researchId)
  })
})

describe("dataset", () => {
  it("keeps its identity when the version describing it is withdrawn", async () => {
    const researchId = await createResearch()
    const datasetId = await createDataset(researchId)
    await publishVersion(researchId, 1, [datasetId])

    await db.delete(s.researchVersion)

    // An orphan: no version lists it, and the accession pinned to it is still
    // held, so nothing else can be given that accession.
    expect(await db.select().from(s.dataset)).toHaveLength(1)
  })
})

describe("search_doc", () => {
  async function insertDoc(textJa: string, textEn: string): Promise<void> {
    const researchId = await createResearch()
    await db.insert(s.searchDoc).values({
      targetType: "research",
      targetId: researchId,
      researchId,
      humLabel: "hum0001",
      content: emptyResearchContent(),
      title: "",
      textJa,
      textEn,
    })
  }

  async function search(query: string): Promise<number> {
    const rows = await db.select().from(s.searchDoc)
      .where(sql`${s.searchDoc.textAll} &@~ ${query}`)
    return rows.length
  }

  it("matches a substring that crosses a word boundary", async () => {
    await insertDoc("日本人集団のがんゲノム解析", "Cancer genome analysis")

    expect(await search("がん")).toBe(1)
  })

  it("matches inside an ASCII token", async () => {
    await insertDoc("JGAD000123 を含む記述", "includes JGAD000123")

    expect(await search("GAD000123")).toBe(1)
  })

  it("does not match an unrelated term", async () => {
    await insertDoc("日本人集団のがんゲノム解析", "Cancer genome analysis")

    expect(await search("マウス")).toBe(0)
  })

  it("searches both languages through the generated column", async () => {
    await insertDoc("日本語だけの記述", "English only phrase")

    expect(await search("English")).toBe(1)
    expect(await search("日本語")).toBe(1)
  })

  it("refuses to have the generated column written directly", async () => {
    const researchId = await createResearch()

    await expect(db.execute(sql`
      INSERT INTO search_doc (target_type, target_id, research_id, hum_label, text_ja, text_en, text_all)
      VALUES ('research', ${researchId}, ${researchId}, 'hum0001', 'a', 'b', 'something else')
    `)).rejects.toThrow()
  })
})

describe("search_facet_term", () => {
  it("finds a descendant term through the ancestor list", async () => {
    const set = only(await db.insert(s.vocabularySet).values({
      code: "icd10",
      labelJa: "ICD10",
      labelEn: "ICD10",
      hierarchical: true,
    }).returning({ id: s.vocabularySet.id }))
    const parent = only(await db.insert(s.vocabularyTerm).values({
      setId: set.id, code: "E11", labelEn: "Type 2 diabetes mellitus",
    }).returning({ id: s.vocabularyTerm.id }))
    const child = only(await db.insert(s.vocabularyTerm).values({
      setId: set.id,
      code: "E11.9",
      labelEn: "Type 2 diabetes mellitus without complications",
      parentId: parent.id,
    }).returning({ id: s.vocabularyTerm.id }))
    const key = only(await db.insert(s.contentKey).values({
      code: "disease-icd10",
      scope: "experiment",
      valueType: "vocabulary",
      labelJa: "疾患",
      labelEn: "Disease",
      vocabularySetId: set.id,
      multiple: true,
    }).returning({ id: s.contentKey.id }))

    const researchId = await createResearch()
    const doc = only(await db.insert(s.searchDoc).values({
      targetType: "dataset",
      targetId: researchId,
      researchId,
      humLabel: "hum0001",
      content: emptyDatasetContent(),
      title: "",
      textJa: "",
      textEn: "",
    }).returning({ id: s.searchDoc.id }))
    await db.insert(s.searchFacetTerm).values({
      docId: doc.id,
      keyId: key.id,
      termId: child.id,
      ancestorIds: [parent.id],
    })

    const rolledUp = await db.select().from(s.searchFacetTerm)
      .where(sql`${s.searchFacetTerm.ancestorIds} @> ARRAY[${parent.id}]::uuid[]`)
    expect(rolledUp).toHaveLength(1)

    const exact = await db.select().from(s.searchFacetTerm)
      .where(eq(s.searchFacetTerm.termId, child.id))
    expect(exact).toHaveLength(1)
  })

  it("refuses the same term twice under one key on one document", async () => {
    const set = only(await db.insert(s.vocabularySet).values({
      code: "tissue", labelJa: "組織", labelEn: "Tissue",
    }).returning({ id: s.vocabularySet.id }))
    const term = only(await db.insert(s.vocabularyTerm).values({
      setId: set.id, code: "blood", labelEn: "Blood",
    }).returning({ id: s.vocabularyTerm.id }))
    const key = only(await db.insert(s.contentKey).values({
      code: "tissues", scope: "experiment", valueType: "vocabulary",
      labelJa: "組織", labelEn: "Tissue", vocabularySetId: set.id, multiple: true,
    }).returning({ id: s.contentKey.id }))
    const researchId = await createResearch()
    const doc = only(await db.insert(s.searchDoc).values({
      targetType: "dataset", targetId: researchId, researchId,
      humLabel: "hum0001", content: emptyDatasetContent(), title: "", textJa: "", textEn: "",
    }).returning({ id: s.searchDoc.id }))
    await db.insert(s.searchFacetTerm).values({ docId: doc.id, keyId: key.id, termId: term.id })

    await expect(
      db.insert(s.searchFacetTerm).values({ docId: doc.id, keyId: key.id, termId: term.id }),
    ).rejects.toThrow()
  })
})
