import { index, integer, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core"

import { createdAt, primaryId, updatedAt } from "./common"
import { research } from "./research"

export const filePublishAction = pgEnum("file_publish_action", ["publish", "unpublish"])

export const filePublishJobState = pgEnum("file_publish_job_state", [
  "pending",
  "running",
  "failed",
])

/**
 * Work queued against the file store. **This is the only thing Postgres knows
 * about files** — whether a file is public is which bucket it sits in, and S3
 * is the authority for that.
 *
 * Switching buckets is a copy of the actual bytes (seconds per gigabyte, and
 * the largest file is 146 GiB), so it cannot run inside the publish operation.
 * The copy and the delete are two steps and not atomic: if the process dies
 * between them the file is briefly in both buckets, which is not a published
 * state but an unfinished one, and a retry resolves it.
 *
 * Losing this table loses no correctness. Every file stays either public or
 * private, never something in between. If a file is ever found in both buckets
 * with no job to explain it, the public copy is kept and the private one
 * deleted — a withdrawal that is late is better than an exposure that was not
 * intended.
 *
 * **One row per file.** A row is not a request to perform an action but the
 * bucket the file is meant to be in, so a second opinion overwrites the first
 * rather than queueing behind it. Without the constraint the intermediate
 * opinions would each be carried out as a copy of the actual bytes.
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
