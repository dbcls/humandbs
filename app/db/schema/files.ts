import { sql } from "drizzle-orm"
import { check, index, integer, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core"

import { createdAt, primaryId, updatedAt } from "./common"
import { research } from "./research"

export const filePublishAction = pgEnum("file_publish_action", ["publish", "unpublish"])

export const filePublishJobState = pgEnum("file_publish_job_state", [
  "pending",
  "running",
  "failed",
])

/**
 * Work queued against the file store. Besides the labels (`fileLabel`), **this
 * is the only thing Postgres knows about files** — whether a file is public is
 * which bucket it sits in, and S3 is the authority for that.
 *
 * Switching buckets is a copy of the actual bytes (seconds per gigabyte, and
 * the largest file is 146 GiB), so it cannot run inside the publish operation.
 * The copy and the delete are two steps and not atomic: if the process dies
 * between them the file is briefly in both buckets, which is not a published
 * state but an unfinished one, and a retry resolves it.
 *
 * Losing this table loses no correctness. Every file stays either public or
 * private, never something in between. **Nothing here repairs a file ever
 * found in both buckets with no job to explain it** — the public copy is the
 * one a reader's request resolves to regardless, and the stray private copy
 * sits until a job is next queued for that name, whose reconcile step clears
 * every copy that is not the job's own destination.
 *
 * **One row per file.** A row is not a request to perform an action but the
 * bucket the file is meant to be in, so a second opinion overwrites the first
 * rather than queueing behind it. Without the constraint the intermediate
 * opinions would each be done as a copy of the actual bytes.
 *
 * Completed jobs are deleted rather than kept: the durable record of who
 * changed a file's visibility is the event log.
 */
export const filePublishJob = pgTable("file_publish_job", {
  id: primaryId(),
  action: filePublishAction().notNull(),
  researchId: uuid().notNull().references(() => research.id, { onDelete: "cascade" }),
  fileName: text().notNull(),
  state: filePublishJobState().notNull().default("pending"),
  attempts: integer().notNull().default(0),
  lastError: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  unique("file_publish_job_file_unique").on(t.researchId, t.fileName),
  index().on(t.state, t.createdAt),
])

/**
 * The words a reader is shown beside a file of a research's prefix, in each
 * language: what the file holds, where its name does not say it.
 *
 * **Keyed by the research identity and the name**, the pair the prefix itself
 * is addressed by on the private side. Switching the file between buckets and
 * re-pinning the hum label leave both alone, so the label stays; renaming the
 * file moves the row and deleting it deletes the row, both in the same
 * operation that changes the store.
 *
 * **Here rather than in the store's metadata.** A listing does not return
 * metadata, so every row of a page would be one more request to the store, and
 * changing metadata rewrites the object — a copy of the actual bytes for a
 * change of a few words.
 *
 * A row with neither language is not kept: clearing both is deleting the label.
 */
export const fileLabel = pgTable("file_label", {
  id: primaryId(),
  researchId: uuid().notNull().references(() => research.id, { onDelete: "cascade" }),
  fileName: text().notNull(),
  labelJa: text().notNull().default(""),
  labelEn: text().notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  unique("file_label_file_unique").on(t.researchId, t.fileName),
  check("file_label_has_text", sql`${t.labelJa} <> '' OR ${t.labelEn} <> ''`),
])
