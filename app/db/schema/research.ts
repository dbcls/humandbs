import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import type {
  DatasetContent,
  DraftSnapshot,
  ResearchContent,
} from "~/content/types"

import { event } from "./audit"
import { createdAt, primaryId, updatedAt } from "./common"

/**
 * The identity of a research. It carries no label of its own: the hum label is
 * pinned in the ledger, so a research can be created before a hum number has
 * been issued and can survive one being corrected.
 */
export const research = pgTable("research", {
  id: primaryId(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/**
 * An immutable capture of research content. A published version points at one;
 * a fix publishes a new snapshot under the same version number.
 *
 * Rows appear here only on publish. That, together with dataset_content, is what
 * keeps unpublished text out of every read path that does not go through a
 * draft table.
 */
export const contentSnapshot = pgTable("content_snapshot", {
  id: primaryId(),
  researchId: uuid().notNull().references(() => research.id, { onDelete: "cascade" }),
  content: jsonb().$type<ResearchContent>().notNull(),
  createdAt: createdAt(),
}, (t) => [
  index().on(t.researchId),
])

/**
 * A published version. The number is assigned at publish time, so drafts that
 * were never published leave no gaps, and several drafts can be open at once
 * without colliding over a number.
 *
 * Withdrawing sets `published` to false and leaves everything else alone;
 * republishing sets it back. Visibility is decided by reading this flag, never
 * by comparing against a highest version number — the numbering has no
 * guarantee of being contiguous.
 */
export const researchVersion = pgTable("research_version", {
  id: primaryId(),
  researchId: uuid().notNull().references(() => research.id, { onDelete: "cascade" }),
  number: integer().notNull(),
  snapshotId: uuid().notNull().references(() => contentSnapshot.id),
  /** Defaults to today at publish time; the admin can change it. */
  releaseDate: date().notNull(),
  published: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  unique("research_version_number_unique").on(t.researchId, t.number),
  index().on(t.researchId, t.published),
])

/**
 * The identity of a dataset. Belongs to exactly one research (composition), has
 * no versions and no history: the archived data does not change, only its
 * description does, so the current description is right for every version that
 * points at it.
 *
 * A dataset added by a draft shares that draft's fate until it is published,
 * which is what `originDraftId` records. Publishing clears it.
 */
export const dataset = pgTable("dataset", {
  id: primaryId(),
  researchId: uuid().notNull().references(() => research.id, { onDelete: "cascade" }),
  originDraftId: uuid().references((): AnyPgColumn => researchDraft.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index().on(t.researchId),
  index().on(t.originDraftId),
])

/**
 * The published description of a dataset. **The presence of the row is what
 * "this dataset is published" means** — there is no status column, and a dataset
 * no version points at any more (an orphan) keeps its row so it can be restored
 * from the admin screen.
 */
export const datasetContent = pgTable("dataset_content", {
  datasetId: uuid().primaryKey().references(() => dataset.id, { onDelete: "cascade" }),
  content: jsonb().$type<DatasetContent>().notNull(),
  updatedAt: updatedAt(),
})

/**
 * The published description a publish operation wrote over.
 *
 * A dataset has no versions, so an overwritten description is recoverable from
 * nowhere: the undo stack shares the draft's fate and is gone the moment the
 * draft is published. This is part of the trail rather than a history — it
 * carries no number, no published version points at it, and no screen shows it.
 *
 * Whole values rather than diffs, because one is 8 KB on average and restoring
 * from diffs would mean replaying them in order. Unbounded, because what bounds
 * it is how often a dataset is part of a publish: the highest number of
 * published versions any dataset is referenced by is 37.
 */
export const replacedDatasetContent = pgTable("replaced_dataset_content", {
  id: primaryId(),
  datasetId: uuid().notNull().references(() => dataset.id, { onDelete: "cascade" }),
  content: jsonb().$type<DatasetContent>().notNull(),
  /** The publish that replaced it, which is where the actor and the time are. */
  eventId: uuid().notNull().references(() => event.id),
  createdAt: createdAt(),
}, (t) => [
  index().on(t.datasetId, t.createdAt),
])

/**
 * An unpublished working copy. Several per research are allowed, which is why
 * changed datasets are recorded per draft rather than on a shared row.
 *
 * The share token lives here rather than in a table of links: one link per
 * draft, held by whoever it was sent to. Turning sharing off and on again gives
 * back the same link, so a link already mailed out keeps working; reissuing the
 * token is the separate operation that kills it.
 */
export const researchDraft = pgTable("research_draft", {
  id: primaryId(),
  researchId: uuid().notNull().references(() => research.id, { onDelete: "cascade" }),
  content: jsonb().$type<ResearchContent>().notNull(),
  /** Free text for admins only. It never reaches the preview. */
  note: text().notNull().default(""),
  /**
   * The snapshot this draft was derived from. It points at a snapshot rather
   * than a version because a fix replaces a snapshot without changing the
   * version number, and a draft derived before the fix must still be detected
   * as stale.
   */
  parentSnapshotId: uuid().references(() => contentSnapshot.id, { onDelete: "set null" }),
  revision: integer().notNull().default(1),
  shareToken: text().notNull().unique(),
  shareEnabled: boolean().notNull().default(false),
  shareExpiresAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index().on(t.researchId),
])

/**
 * A dataset touched by a draft (copy-on-write): only edited datasets get a row.
 *
 * `baseContent` is the published content as it stood when editing began, which
 * makes the conflict diff three-way — "what they changed" and "what I changed"
 * stay separable. It is null for a dataset the draft itself introduced.
 *
 * Experiments live inside `content`, so editing one is checked against this
 * row's revision.
 */
export const draftDatasetEntry = pgTable("draft_dataset_entry", {
  id: primaryId(),
  draftId: uuid().notNull().references(() => researchDraft.id, { onDelete: "cascade" }),
  datasetId: uuid().notNull().references(() => dataset.id, { onDelete: "cascade" }),
  content: jsonb().$type<DatasetContent>().notNull(),
  baseContent: jsonb().$type<DatasetContent>(),
  revision: integer().notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  unique("draft_dataset_entry_unique").on(t.draftId, t.datasetId),
])

/**
 * The undo stack of a draft. Snapshots are rows, not one JSONB value, so a save
 * appends instead of rewriting the whole stack.
 *
 * Depth is capped at 10 (the eleventh push drops the oldest) and there is no
 * time limit: drafts stay open for a median of 46 days and sometimes years, and
 * a bounded depth means a stalled draft does not accumulate.
 */
export const draftUndo = pgTable("draft_undo", {
  id: primaryId(),
  draftId: uuid().notNull().references(() => researchDraft.id, { onDelete: "cascade" }),
  snapshot: jsonb().$type<DraftSnapshot>().notNull(),
  createdAt: createdAt(),
}, (t) => [
  index().on(t.draftId, t.createdAt),
])

/**
 * Who currently has an editing screen open. Display only — nobody is made
 * read-only, and correctness comes from the revision check on save.
 *
 * `holderSub` and `holdExpiresAt` stay null. They are here so that turning this
 * into a lease, if the measured rate of conflicting saves ever justifies it,
 * does not need a schema change.
 */
export const draftPresence = pgTable("draft_presence", {
  draftId: uuid().notNull().references(() => researchDraft.id, { onDelete: "cascade" }),
  sessionId: text().notNull(),
  actorSub: text(),
  displayName: text().notNull(),
  lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  holderSub: text(),
  holdExpiresAt: timestamp({ withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.draftId, t.sessionId] }),
])
