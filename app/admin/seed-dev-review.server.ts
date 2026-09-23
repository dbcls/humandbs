/**
 * Fixture drafts that put the review screens into the states a curator meets
 * in practice: open questions, marks, fields nobody has settled or translated
 * yet, and a dataset nobody has pinned an accession to.
 *
 * **Idempotent by a marker, not by clearing anything first.** Each draft this
 * makes carries an administrators' memo whose body is fixed; finding that memo
 * under a research is how a rerun recognises a draft it already made and
 * leaves it alone, rather than growing a second one every time this is run.
 * Nothing here writes a row outside the functions `drafts.server.ts` and
 * `comments.server.ts` already expose — this module only decides what to feed
 * them.
 *
 * Everything is written through a hum label rather than a research id, because
 * `db:load-dev-data` truncates and reloads the research it targets: the ids
 * are only stable within one load.
 */

import { and, desc, eq, sql } from "drizzle-orm"

import { emptyResearchContent, filled } from "~/content/empty"
import type { ContentValue, DatasetContent, ResearchContent } from "~/content/types"
import type { Database, Executor } from "~/db/client.server"
import {
  comment,
  contentKey,
  dataset,
  labelPin,
  researchDraft,
  researchVersion,
  vocabularySet,
  vocabularyTerm,
} from "~/db/schema"
import { RESEARCH } from "~/review/anchors"
import {
  acknowledgeDraft,
  postAboutDraft,
  postComment,
  setCommentResolved,
} from "~/review/comments.server"

import {
  changeListing,
  createDatasetInDraft,
  createEmptyDraft,
  draftUpdating,
  saveDatasetEntry,
  saveDraftContent,
  setDraftSharing,
} from "./drafts.server"
import { readDraft } from "./queries.server"

const MARK = "[seed-dev-review]"
const REVIEW_DRAFT_MEMO = `${MARK} レビュー画面確認用の共有 draft`
const REVIEW_DRAFT_NOTE = "提供者からの回答待ち。次回定例で状況を確認する。"
const EMPTY_DRAFT_MEMO = `${MARK} 空の draft（レビュー画面確認用）`
const EXPIRED_SHARE_MEMO = `${MARK} 期限切れの共有リンクを持つ draft（レビュー画面確認用）`

/** Well in the past, and fixed rather than relative to now — it only has to stay expired. */
const PAST_SHARE_EXPIRY = new Date("2025-01-01T00:00:00Z")

const ADMIN_SUB = "seed-review-admin"
const ADMIN = { sub: ADMIN_SUB, name: "管理者" }
const PROVIDER = { sub: null, name: "データ提供者" }
const PROVIDER_A = { sub: null, name: "データ提供者 A" }
const PROVIDER_B = { sub: null, name: "データ提供者 B" }

export interface SeedReviewResult {
  /** hum0127: a shared draft carrying comments, marks and unsettled fields. */
  reviewDraftId: string
  /** hum0127: the draft updating its newest published version, if it has one. */
  updatingDraftId: string | null
  /** hum0005: a draft nobody has touched. */
  emptyDraftId: string
  /** hum0005: a draft whose share link has lapsed. */
  expiredShareDraftId: string
}

async function researchByHumLabel(db: Executor, label: string): Promise<string | null> {
  const [row] = await db
    .select({ researchId: labelPin.researchId })
    .from(labelPin)
    .where(and(eq(labelPin.kind, "hum"), eq(labelPin.isPrimary, true), eq(labelPin.label, label)))
    .limit(1)
  return row?.researchId ?? null
}

/** The draft under this research already carrying the given memo, if there is one. */
async function draftMarkedWith(db: Executor, researchId: string, memo: string): Promise<string | null> {
  const [row] = await db
    .select({ draftId: comment.draftId })
    .from(comment)
    .innerJoin(researchDraft, eq(researchDraft.id, comment.draftId))
    .where(and(
      eq(researchDraft.researchId, researchId),
      sql`${comment.anchor}->>'kind' = 'memo'`,
      eq(comment.body, memo),
    ))
    .limit(1)
  return row?.draftId ?? null
}

async function existingDatasetIds(db: Executor, researchId: string, count: number): Promise<string[]> {
  const rows = await db
    .select({ id: dataset.id })
    .from(dataset)
    .where(eq(dataset.researchId, researchId))
    .orderBy(dataset.id)
    .limit(count)
  return rows.map((row) => row.id)
}

/** The dataset-scope `access-criteria` key and its `unrestricted-access` term, by code. */
async function accessCriteriaSlot(db: Executor): Promise<{ keyId: string, value: ContentValue }> {
  const [key] = await db
    .select({ id: contentKey.id })
    .from(contentKey)
    .where(eq(contentKey.code, "access-criteria"))
    .limit(1)
  if (key === undefined) {
    throw new Error("the 'access-criteria' catalog key is missing — run db:load-dev-data first")
  }
  const [term] = await db
    .select({ id: vocabularyTerm.id })
    .from(vocabularyTerm)
    .innerJoin(vocabularySet, eq(vocabularySet.id, vocabularyTerm.setId))
    .where(and(eq(vocabularySet.code, "access-criteria"), eq(vocabularyTerm.code, "unrestricted-access")))
    .limit(1)
  if (term === undefined) {
    throw new Error("the 'unrestricted-access' vocabulary term is missing — run db:load-dev-data first")
  }
  return { keyId: key.id, value: { kind: "vocabulary", termIds: filled([term.id]) } }
}

/**
 * The body a curator is partway through: two unsettled fields (one unsettled
 * in Japanese alone, one in both languages), one settled as not applicable,
 * and one translated in Japanese only.
 */
function reviewDraftContent(): ResearchContent {
  const base = emptyResearchContent()
  return {
    ...base,
    title: {
      ja: filled("マルチオミクス統合によるヒト疾患関連遺伝子の探索"),
      en: filled("Multi-omics integration for human disease gene discovery"),
    },
    summary: {
      ...base.summary,
      targets: {
        ja: { state: "unknown" },
        en: filled([[{ text: "Participants recruited from cooperating hospitals." }]]),
      },
      aims: {
        ja: { state: "unknown" },
        en: { state: "unknown" },
      },
      url: {
        ja: { state: "not-applicable" },
        en: filled([]),
      },
    },
    releaseNote: {
      ja: filled([[{ text: "公開に向けて内容を精査しています。" }]]),
      en: filled([]),
    },
  }
}

/**
 * hum0127's shared review draft: field comments (two open, one resolved, one
 * of them on a dataset's value slot), two comments on the draft as a whole,
 * two memos, both kinds of mark from different people, and three datasets —
 * two of the research's own and one this draft made, still unpinned.
 */
async function ensureReviewDraft(db: Database, researchId: string): Promise<string> {
  const already = await draftMarkedWith(db, researchId, REVIEW_DRAFT_MEMO)
  if (already !== null) return already

  const draftId = await createEmptyDraft(db, researchId)
  const opened = await readDraft(db, draftId)
  if (opened === null) throw new Error("the draft just created is gone")

  const draftContent = reviewDraftContent()
  const saved = await saveDraftContent(db, { draftId, revision: opened.revision }, { content: draftContent })
  if (saved.status !== "saved") throw new Error(`saving the review draft's content: ${saved.status}`)
  let revision = saved.revision
  let content = draftContent

  const [datasetA, datasetB] = await existingDatasetIds(db, researchId, 2)
  if (datasetA === undefined || datasetB === undefined) {
    throw new Error("hum0127 needs at least two existing datasets — run db:load-dev-data first")
  }
  for (const datasetId of [datasetA, datasetB]) {
    const listed = await changeListing(db, { draftId, revision }, researchId, { kind: "list", datasetId })
    if (listed.status !== "changed") throw new Error(`listing an existing dataset: ${listed.status}`)
    revision += 1
    content = { ...content, datasetIds: [...content.datasetIds, datasetId] }
  }

  const created = await createDatasetInDraft(db, { draftId, revision }, researchId)
  if (created.status !== "created") throw new Error(`creating the new dataset: ${created.status}`)
  content = { ...content, datasetIds: [...content.datasetIds, created.datasetId] }

  const slot = await accessCriteriaSlot(db)
  const newDatasetContent: DatasetContent = {
    releaseDate: null,
    fileSelection: [],
    values: [slot],
    experiments: [],
  }
  const entrySaved = await saveDatasetEntry(
    db,
    { draftId, datasetId: created.datasetId, revision: null },
    newDatasetContent,
  )
  if (entrySaved.status !== "saved") throw new Error(`writing the new dataset's content: ${entrySaved.status}`)

  const about = { draftId, content, datasetIds: content.datasetIds }

  const titleComment = await postComment(db, {
    about,
    subject: RESEARCH,
    path: "title",
    author: PROVIDER,
    body: "英語表記が正式名称と異なるようです。ご確認ください。",
  })
  if (titleComment.status !== "posted") throw new Error(`posting the title comment: ${titleComment.status}`)

  const targetsComment = await postComment(db, {
    about,
    subject: RESEARCH,
    path: "summary.targets",
    author: PROVIDER,
    body: "対象者の記載についてご確認をお願いします。",
  })
  if (targetsComment.status !== "posted") throw new Error(`posting the targets comment: ${targetsComment.status}`)
  const resolved = await setCommentResolved(db, {
    draftId,
    commentId: targetsComment.commentId,
    resolved: true,
    actorSub: ADMIN_SUB,
  })
  if (resolved.status !== "posted") throw new Error(`resolving the targets comment: ${resolved.status}`)

  const valueComment = await postComment(db, {
    about,
    subject: { kind: "dataset", datasetId: created.datasetId },
    path: `values.${slot.keyId}`,
    author: PROVIDER,
    body: "このデータセットのアクセス区分をご確認ください。",
  })
  if (valueComment.status !== "posted") throw new Error(`posting the dataset comment: ${valueComment.status}`)

  const providerComment = await postAboutDraft(db, {
    draftId,
    kind: "draft",
    author: PROVIDER,
    body: "全体を確認しました。いくつか質問があります。",
  })
  if (providerComment.status !== "posted") {
    throw new Error(`posting the provider's draft comment: ${providerComment.status}`)
  }
  const adminComment = await postAboutDraft(db, {
    draftId,
    kind: "draft",
    author: ADMIN,
    body: "ご指摘ありがとうございます。担当部署に確認します。",
  })
  if (adminComment.status !== "posted") {
    throw new Error(`posting the admin's draft comment: ${adminComment.status}`)
  }

  const marker = await postAboutDraft(db, { draftId, kind: "memo", author: ADMIN, body: REVIEW_DRAFT_MEMO })
  if (marker.status !== "posted") throw new Error(`posting the marker memo: ${marker.status}`)
  const note = await postAboutDraft(db, { draftId, kind: "memo", author: ADMIN, body: REVIEW_DRAFT_NOTE })
  if (note.status !== "posted") throw new Error(`posting the second memo: ${note.status}`)

  await acknowledgeDraft(db, { draftId, kind: "commented", actor: PROVIDER_A })
  await acknowledgeDraft(db, { draftId, kind: "approved", actor: PROVIDER_B })

  const shared = await setDraftSharing(db, draftId, { enabled: true, expiresAt: null })
  if (shared.status !== "set") throw new Error(`sharing the review draft: ${shared.status}`)

  return draftId
}

/** hum0127's draft updating its newest published version, made the same way the editor makes one. */
async function ensureUpdatingDraft(db: Database, researchId: string): Promise<string | null> {
  const [latest] = await db
    .select({ id: researchVersion.id })
    .from(researchVersion)
    .where(eq(researchVersion.researchId, researchId))
    .orderBy(desc(researchVersion.number))
    .limit(1)
  if (latest === undefined) return null
  const outcome = await draftUpdating(db, researchId, latest.id)
  return outcome.status === "opened" ? outcome.draftId : null
}

/** An empty draft marked with `memo`, made only when no draft already carries that mark. */
async function ensureMarkedDraft(
  db: Database,
  researchId: string,
  memo: string,
  afterCreate?: (draftId: string) => Promise<void>,
): Promise<string> {
  const already = await draftMarkedWith(db, researchId, memo)
  if (already !== null) return already

  const draftId = await createEmptyDraft(db, researchId)
  const posted = await postAboutDraft(db, { draftId, kind: "memo", author: ADMIN, body: memo })
  if (posted.status !== "posted") throw new Error(`posting the marker memo: ${posted.status}`)
  if (afterCreate !== undefined) await afterCreate(draftId)
  return draftId
}

export async function seedDevReviewData(db: Database): Promise<SeedReviewResult> {
  const hum0127 = await researchByHumLabel(db, "hum0127")
  if (hum0127 === null) throw new Error("hum0127 is not in the development data — run db:load-dev-data first")
  const hum0005 = await researchByHumLabel(db, "hum0005")
  if (hum0005 === null) throw new Error("hum0005 is not in the development data — run db:load-dev-data first")

  const reviewDraftId = await ensureReviewDraft(db, hum0127)
  const updatingDraftId = await ensureUpdatingDraft(db, hum0127)
  const emptyDraftId = await ensureMarkedDraft(db, hum0005, EMPTY_DRAFT_MEMO)
  const expiredShareDraftId = await ensureMarkedDraft(db, hum0005, EXPIRED_SHARE_MEMO, async (draftId) => {
    const shared = await setDraftSharing(db, draftId, { enabled: true, expiresAt: PAST_SHARE_EXPIRY })
    if (shared.status !== "set") throw new Error(`sharing the expired draft: ${shared.status}`)
  })

  return { reviewDraftId, updatingDraftId, emptyDraftId, expiredShareDraftId }
}
