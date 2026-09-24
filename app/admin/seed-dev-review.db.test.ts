import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedDataset, seedResearch, seedVersion } from "~/db/seed"

import { changedDatasetFromPublished } from "./changes"
import { readDatasetEntry, readPublishedDataset } from "./queries.server"
import { seedDevReviewData } from "./seed-dev-review.server"

/**
 * The dev fixture builder, against the development database — the only place
 * its idempotency and its use of the real write path can be shown.
 */
const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

async function seedCatalog(): Promise<void> {
  const [set] = await db.insert(s.vocabularySet).values({
    code: "access-criteria",
    labelJa: "アクセス制限",
    labelEn: "Access type",
  }).returning({ id: s.vocabularySet.id })
  if (set === undefined) throw new Error("the vocabulary set insert returned no row")
  await db.insert(s.vocabularyTerm).values([
    { setId: set.id, code: "unrestricted-access", labelEn: "Unrestricted-access", labelJa: "非制限公開" },
    { setId: set.id, code: "controlled-access-type-1", labelEn: "Controlled-access (Type I)" },
  ])
  await db.insert(s.contentKey).values({
    code: "access-criteria",
    scope: "dataset",
    valueType: "vocabulary",
    labelJa: "アクセス制限",
    labelEn: "Access type",
    vocabularySetId: set.id,
  })
}

/** hum0127, with two published datasets — what a real dev load already has. */
async function seedHum0127(): Promise<string> {
  const researchId = await seedResearch(db, "hum0127")
  const first = await seedDataset(db, researchId, "JGAD000001")
  const second = await seedDataset(db, researchId, "JGAD000002")
  await seedVersion(db, {
    researchId,
    number: 1,
    datasets: [{ datasetId: first }, { datasetId: second }],
  })
  return researchId
}

async function seedFixture(): Promise<{ hum0127: string, hum0005: string }> {
  await seedCatalog()
  const hum0127 = await seedHum0127()
  const hum0005 = await seedResearch(db, "hum0005")
  return { hum0127, hum0005 }
}

describe("hum0127 のレビュー用 draft", () => {
  it("field コメント (未解決 2・解決済み 1、うち 1 つは dataset の値スロット宛) を持つ", async () => {
    await seedFixture()

    const result = await seedDevReviewData(db)

    const rows = await db.select().from(s.comment).where(eq(s.comment.draftId, result.reviewDraftId))
    const fields = rows.filter((row) => row.anchor.kind === "research-field" || row.anchor.kind === "dataset-field")
    expect(fields.filter((row) => row.resolved)).toHaveLength(1)
    expect(fields.filter((row) => !row.resolved)).toHaveLength(2)
    expect(fields.filter((row) => row.anchor.kind === "dataset-field")).toHaveLength(1)
  })

  it("全体へのコメント 2 (提供者・admin) とメモ 2 を持つ", async () => {
    await seedFixture()

    const result = await seedDevReviewData(db)

    const rows = await db.select().from(s.comment).where(eq(s.comment.draftId, result.reviewDraftId))
    const drafts = rows.filter((row) => row.anchor.kind === "draft")
    expect(drafts).toHaveLength(2)
    expect(drafts.map((row) => row.authorSub === null).toSorted()).toEqual([false, true])
    expect(rows.filter((row) => row.anchor.kind === "memo")).toHaveLength(2)
  })

  it("commented と approved のマークを別人から持つ", async () => {
    await seedFixture()

    const result = await seedDevReviewData(db)

    const rows = await db
      .select()
      .from(s.reviewAcknowledgement)
      .where(eq(s.reviewAcknowledgement.draftId, result.reviewDraftId))
    expect(rows.map((row) => row.kind).toSorted()).toEqual(["approved", "commented"])
    expect(new Set(rows.map((row) => row.actorName)).size).toBe(2)
  })

  it("未確定の欄 2 つ (ja だけ・両方)・該当なしの欄 1 つ・未翻訳の欄 1 つを content に持つ", async () => {
    await seedFixture()

    const result = await seedDevReviewData(db)

    const [draft] = await db
      .select({ content: s.researchDraft.content })
      .from(s.researchDraft)
      .where(eq(s.researchDraft.id, result.reviewDraftId))
    if (draft === undefined) throw new Error("the review draft is gone")

    expect(draft.content.summary.targets.ja).toEqual({ state: "unknown" })
    expect(draft.content.summary.targets.en.state).toBe("value")
    expect(draft.content.summary.aims.ja).toEqual({ state: "unknown" })
    expect(draft.content.summary.aims.en).toEqual({ state: "unknown" })
    expect(draft.content.summary.url.ja).toEqual({ state: "not-applicable" })
    expect(draft.content.releaseNote.ja.state).toBe("value")
    expect(draft.content.releaseNote.en).toEqual({ state: "value", value: [] })
  })

  it("研究の dataset に新規の 1 件を足し、それだけラベルを pin しない", async () => {
    await seedFixture()

    const result = await seedDevReviewData(db)

    const [draft] = await db
      .select({ content: s.researchDraft.content, researchId: s.researchDraft.researchId })
      .from(s.researchDraft)
      .where(eq(s.researchDraft.id, result.reviewDraftId))
    if (draft === undefined) throw new Error("the review draft is gone")
    // **載せる操作は無い** — draft は研究の dataset を全部公開するので、seed が
    // 足すのは自分で作る 1 件だけ (`admin/datasets.ts`)。
    const carried = await db
      .select({ id: s.dataset.id })
      .from(s.dataset)
      .where(eq(s.dataset.researchId, draft.researchId))
    expect(carried).toHaveLength(3)

    const pinned = await db
      .select({ datasetId: s.labelPin.datasetId })
      .from(s.labelPin)
      .where(eq(s.labelPin.kind, "dataset"))
    const pinnedIds = new Set(pinned.map((row) => row.datasetId))
    const unpinned = carried.map((row) => row.id).filter((id) => !pinnedIds.has(id))
    expect(unpinned).toHaveLength(1)

    const entries = await db
      .select()
      .from(s.draftDatasetEntry)
      .where(eq(s.draftDatasetEntry.draftId, result.reviewDraftId))
    expect(entries.map((row) => row.datasetId)).toEqual(unpinned)
    expect(entries[0]?.content.values).toHaveLength(1)
  })

  it("共有を有効にする", async () => {
    await seedFixture()

    const result = await seedDevReviewData(db)

    const [draft] = await db
      .select({ shareEnabled: s.researchDraft.shareEnabled, shareExpiresAt: s.researchDraft.shareExpiresAt })
      .from(s.researchDraft)
      .where(eq(s.researchDraft.id, result.reviewDraftId))
    expect(draft?.shareEnabled).toBe(true)
    expect(draft?.shareExpiresAt).toBeNull()
  })

  it("公開中の最新バージョンを更新する draft も持つ", async () => {
    await seedFixture()

    const result = await seedDevReviewData(db)

    expect(result.updatingDraftId).not.toBeNull()
    const [updating] = await db
      .select({ replacesVersionId: s.researchDraft.replacesVersionId })
      .from(s.researchDraft)
      .where(eq(s.researchDraft.id, result.updatingDraftId ?? ""))
    expect(updating?.replacesVersionId).not.toBeNull()
  })
})

describe("hum0005 のレビュー用 draft", () => {
  it("空の draft を持つ", async () => {
    await seedFixture()

    const result = await seedDevReviewData(db)

    const [draft] = await db
      .select({ content: s.researchDraft.content, shareEnabled: s.researchDraft.shareEnabled })
      .from(s.researchDraft)
      .where(eq(s.researchDraft.id, result.emptyDraftId))
    expect(draft?.content.datasetIds).toEqual([])
    expect(draft?.content.title).toEqual({ ja: { state: "value", value: "" }, en: { state: "value", value: "" } })
    expect(draft?.shareEnabled).toBe(false)
  })

  it("期限切れの共有リンクを持つ draft を持つ", async () => {
    await seedFixture()

    const result = await seedDevReviewData(db)

    const [draft] = await db
      .select({ shareEnabled: s.researchDraft.shareEnabled, shareExpiresAt: s.researchDraft.shareExpiresAt })
      .from(s.researchDraft)
      .where(eq(s.researchDraft.id, result.expiredShareDraftId))
    expect(draft?.shareEnabled).toBe(true)
    expect(draft?.shareExpiresAt).not.toBeNull()
    expect((draft?.shareExpiresAt ?? new Date()).getTime()).toBeLessThan(Date.now())
  })
})

describe("べき等性", () => {
  it("2 回流しても同じ draft を指し、行が増えない", async () => {
    await seedFixture()

    const first = await seedDevReviewData(db)
    const second = await seedDevReviewData(db)

    expect(second).toEqual(first)
    expect(await db.select().from(s.researchDraft)).toHaveLength(4)
    // 7 on the review draft (3 field + 2 draft + 2 memo) plus the marker memo
    // on each of the empty and expired-share drafts.
    expect(await db.select().from(s.comment)).toHaveLength(9)
    expect(await db.select().from(s.reviewAcknowledgement)).toHaveLength(2)
    // The review draft's own new dataset, plus the two the updating draft
    // copied in from the version it replaces.
    expect(await db.select().from(s.draftDatasetEntry)).toHaveLength(3)
    expect(await db.select().from(s.dataset)).toHaveLength(3)
    expect(await db.select().from(s.labelPin)).toHaveLength(4)
  })
})

describe("hum0127 のレビュー用 draft が書き換える公開済みの dataset", () => {
  /** hum0127 with one published dataset that has an experiment to rewrite. */
  async function seedWithExperiment(): Promise<{ hum0127: string, datasetId: string }> {
    await seedCatalog()
    const hum0127 = await seedResearch(db, "hum0127")
    const datasetId = await seedDataset(db, hum0127, "JGAD000001")
    await seedVersion(db, {
      researchId: hum0127,
      number: 1,
      datasets: [{
        datasetId,
        content: {
          releaseDate: null,
          fileSelection: [],
          values: [],
          experiments: [{ id: "e1", label: { state: "value", value: "WGS" }, values: [] }],
        },
      }],
    })
    await seedResearch(db, "hum0005")
    return { hum0127, datasetId }
  }

  it("公開バージョンと違う値を持ち、dataset の編集画面に差のマークが表示される", async () => {
    const { hum0127, datasetId } = await seedWithExperiment()

    const result = await seedDevReviewData(db)

    expect(result.changedDatasetId).toBe(datasetId)
    const entry = await readDatasetEntry(db, result.reviewDraftId, datasetId)
    const published = await readPublishedDataset(db, hum0127, datasetId, null)
    if (entry === null || published === null) throw new Error("the entry or the published dataset is missing")
    expect(changedDatasetFromPublished(published.content, entry.content)).toContain("experiments.e1.label")
  })

  it("2 回流しても書き換えは 1 回だけ (entry の revision が進まない)", async () => {
    const { datasetId } = await seedWithExperiment()

    const first = await seedDevReviewData(db)
    const before = await readDatasetEntry(db, first.reviewDraftId, datasetId)
    const second = await seedDevReviewData(db)
    const after = await readDatasetEntry(db, second.reviewDraftId, datasetId)

    expect(after?.revision).toBe(before?.revision)
    expect(after?.content).toEqual(before?.content)
  })

  it("書き換えられる実験を持つ公開済みの dataset が無ければ何も書かない", async () => {
    await seedFixture()

    const result = await seedDevReviewData(db)

    expect(result.changedDatasetId).toBeNull()
  })
})

describe("hum0127 の更新中の draft", () => {
  it("目的 (ja) の 2 文目だけを書き換え、他の文は公開バージョンのまま / 2 回流しても 1 回だけ", async () => {
    await seedCatalog()
    const hum0127 = await seedResearch(db, "hum0127")
    await seedVersion(db, {
      researchId: hum0127,
      number: 1,
      body: {
        summary: {
          aims: { ja: { state: "value", value: [[{ text: "一つ目の文。 二つ目の文。三つ目の文。" }]] }, en: { state: "value", value: [] } },
          methods: { ja: { state: "value", value: [] }, en: { state: "value", value: [] } },
          targets: { ja: { state: "value", value: [] }, en: { state: "value", value: [] } },
          url: { ja: { state: "value", value: [] }, en: { state: "value", value: [] } },
        },
      },
    })
    await seedResearch(db, "hum0005")

    const first = await seedDevReviewData(db)
    await seedDevReviewData(db)

    if (first.updatingDraftId === null) throw new Error("no updating draft")
    const [row] = await db.select({ content: s.researchDraft.content }).from(s.researchDraft).where(eq(s.researchDraft.id, first.updatingDraftId))
    expect(row?.content.summary.aims.ja).toEqual({ state: "value", value: [[{ text: "一つ目の文。 2026 年度からは二つ目の文。三つ目の文。" }]] })
  })
})
