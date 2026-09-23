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
  ResearchContent,
  VersionContent,
} from "~/content/types"

import { createdAt, primaryId, updatedAt } from "./common"

/**
 * The identity of a research. It carries no label of its own: the hum label is
 * pinned in the ledger, so a research can be created before a hum number has
 * been issued and can survive one being corrected.
 *
 * **Nothing else.** When it was made is what a row of it would say — every
 * change to a research is a change to a version or to a draft, and the listing
 * reads its "last touched" off those.
 */
export const research = pgTable("research", {
  id: primaryId(),
  createdAt: createdAt(),
})

/**
 * A published version: the whole research as it stood, with the description of
 * every dataset it lists written into `content`.
 *
 * **The row is never rewritten.** Publishing always inserts; replacing a
 * version is the old row being deleted in the same transaction as the new one
 * appears under its number. So no reader ever sees a version's content change
 * underneath them, and a version needs nothing outside itself to answer for its
 * own moment.
 *
 * **Being here is what "published" means.** There is no flag — withdrawing
 * moves the row back into `research_draft` and takes the number with it, which
 * makes the number free to be given again.
 */
export const researchVersion = pgTable("research_version", {
  id: primaryId(),
  researchId: uuid().notNull().references(() => research.id, { onDelete: "cascade" }),
  number: integer().notNull(),
  content: jsonb().$type<VersionContent>().notNull(),
  /** Defaults to today at publish time; the admin can change it. */
  releaseDate: date().notNull(),
  updatedAt: updatedAt(),
}, (t) => [
  unique("research_version_number_unique").on(t.researchId, t.number),
  index().on(t.researchId),
])

/**
 * The identity of a dataset. Belongs to exactly one research (composition) and
 * carries no description of its own — every description lives in the version
 * that lists it, or in the draft entry being edited.
 *
 * A dataset added by a draft shares that draft's fate until it is published,
 * which is what `originDraftId` records. Publishing clears it.
 */
export const dataset = pgTable("dataset", {
  id: primaryId(),
  researchId: uuid().notNull().references(() => research.id, { onDelete: "cascade" }),
  originDraftId: uuid().references((): AnyPgColumn => researchDraft.id, { onDelete: "cascade" }),
}, (t) => [
  index().on(t.researchId),
  index().on(t.originDraftId),
])

/**
 * An unpublished working copy. Several per research are allowed, which is why
 * edited datasets are recorded per draft rather than on a shared row.
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
  /**
   * The approval branches of the application system this draft has taken values
   * from, oldest first.
   *
   * **A record, not a constraint.** Nothing consults it to decide what may be
   * taken: a branch is approved before its data is registered, so the same one
   * is taken twice — once for the description and again once the accessions
   * exist. Several branches reach one draft as well, because approvals arrive
   * one at a time while a draft stays open.
   */
  takenBranches: text().array().notNull().default([]),
  /**
   * The published version this draft is the update of, when it is one.
   *
   * **An update is a state of the version, and the draft is only its vessel.**
   * The version stays out, untouched, while the draft is written; publishing
   * the draft puts it under that version's number, in its place. The research
   * screen never shows such a draft as a draft — the version's row says it is
   * being updated. One per version, and a version being updated cannot be
   * withdrawn, so the draft never outlives what it points at.
   */
  replacesVersionId: uuid().references(() => researchVersion.id, { onDelete: "cascade" }),
  revision: integer().notNull().default(1),
  shareToken: text().notNull().unique(),
  shareEnabled: boolean().notNull().default(false),
  shareExpiresAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index().on(t.researchId),
  unique("research_draft_replaces_version_unique").on(t.replacesVersionId),
])

/**
 * The description of one dataset, as this draft has it.
 *
 * **One row per dataset the draft lists**, rather than the whole set inside the
 * draft's content. Saving runs every time an editor touches a single dataset,
 * and a research can list over 200 of them — writing the set each time would
 * put a version-sized value through every keystroke's worth of work. It also
 * keeps one dataset's conflict from becoming every dataset's conflict.
 *
 * Experiments live inside `content`, so editing one is checked against this
 * row's revision.
 */
export const draftDatasetEntry = pgTable("draft_dataset_entry", {
  id: primaryId(),
  draftId: uuid().notNull().references(() => researchDraft.id, { onDelete: "cascade" }),
  datasetId: uuid().notNull().references(() => dataset.id, { onDelete: "cascade" }),
  content: jsonb().$type<DatasetContent>().notNull(),
  revision: integer().notNull().default(1),
}, (t) => [
  unique("draft_dataset_entry_unique").on(t.draftId, t.datasetId),
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
