import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

import type { CommentAnchor } from "~/content/types"

import { createdAt, primaryId } from "./common"
import { researchDraft } from "./research"

/**
 * A comment thread attached to one place in a draft.
 *
 * The anchor is a field or a value slot, never a text range. The first thing
 * reviewers are asked about is an unsettled value, which renders as an empty
 * slot with no text to select at all; and a range anchor would have to survive
 * markdown being re-rendered, which the reference implementations only manage
 * with a thousand lines of re-anchoring.
 *
 * Resolving is a manual act. Nothing marks a thread resolved because the value
 * beneath it changed — editing the commented place is exactly the operation
 * being reviewed, and closing it automatically removes the chance to check.
 */
export const commentThread = pgTable("comment_thread", {
  id: primaryId(),
  draftId: uuid().notNull().references(() => researchDraft.id, { onDelete: "cascade" }),
  anchor: jsonb().$type<CommentAnchor>().notNull(),
  resolved: boolean().notNull().default(false),
  resolvedAt: timestamp({ withTimezone: true }),
  resolvedBySub: text(),
  createdAt: createdAt(),
}, (t) => [
  index().on(t.draftId, t.resolved),
])

/**
 * One message. The author may be signed in with a DDBJ account or may have just
 * typed a name — data providers are among the intended readers of a share link,
 * and requiring an account would put the whole review out of reach.
 *
 * Threads and comments outlive the share link: they are read by admins in the
 * management screen, so the link's expiry has nothing to do with their
 * lifetime. They are deleted only when the draft is discarded.
 */
export const comment = pgTable("comment", {
  id: primaryId(),
  threadId: uuid().notNull().references(() => commentThread.id, { onDelete: "cascade" }),
  authorSub: text(),
  authorName: text().notNull(),
  body: text().notNull(),
  createdAt: createdAt(),
}, (t) => [
  index().on(t.threadId, t.createdAt),
])

/**
 * "I have looked at this." Not an approval — publishing is an admin operation —
 * and it only carries identity when the reader was signed in.
 */
export const reviewAcknowledgement = pgTable("review_acknowledgement", {
  id: primaryId(),
  draftId: uuid().notNull().references(() => researchDraft.id, { onDelete: "cascade" }),
  actorSub: text(),
  actorName: text().notNull(),
  createdAt: createdAt(),
}, (t) => [
  unique("review_acknowledgement_unique").on(t.draftId, t.actorSub),
  index().on(t.draftId),
])
