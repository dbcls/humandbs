import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import type { AcknowledgementKind, CommentAnchor } from "~/content/types"

import { createdAt, primaryId } from "./common"
import { researchDraft } from "./research"

/**
 * One thing somebody said about one place in a draft.
 *
 * The anchor is a field, a value slot, the draft as a whole or the
 * administrators' memo — never a text range. The first thing reviewers are
 * asked about is an unsettled value, which renders as an empty slot with no
 * text to select at all; and a range anchor would have to survive markdown
 * being re-rendered, which the reference implementations only manage with a
 * thousand lines of re-anchoring.
 *
 * **There are no threads.** The comments at one place are shown in the order they
 * were written, and each is resolved on its own. Resolving is a manual act:
 * nothing marks a comment resolved because the value beneath it changed —
 * editing the commented place is exactly the operation being reviewed, and
 * closing it automatically removes the chance to check.
 *
 * The author may be signed in with a DDBJ account or may have just typed a
 * name — data providers are among the intended readers of a share link, and
 * requiring an account would put the whole review out of reach.
 *
 * Comments outlive the share link: they are read by admins in the management
 * screen, so the link's expiry has nothing to do with their lifetime. They
 * are deleted whenever the draft row goes away — discarding it, publishing it
 * (which consumes the draft the same way), or deleting the dataset the draft
 * belongs to all remove the draft and cascade the comments with it.
 */
export const comment = pgTable("comment", {
  id: primaryId(),
  draftId: uuid().notNull().references(() => researchDraft.id, { onDelete: "cascade" }),
  anchor: jsonb().$type<CommentAnchor>().notNull(),
  authorSub: text(),
  authorName: text().notNull(),
  body: text().notNull(),
  resolved: boolean().notNull().default(false),
  resolvedAt: timestamp({ withTimezone: true }),
  resolvedBySub: text(),
  createdAt: createdAt(),
}, (t) => [
  index().on(t.draftId, t.resolved),
  index().on(t.draftId, t.createdAt),
])

/**
 * What a reader of the share link said about the draft as a whole: that they
 * have finished commenting, or that there is nothing to fix. Not an approval —
 * publishing is an admin operation — and it only has identity when the
 * reader was signed in. **Every press is a row**, signed in or not: a reader
 * presses again on each round of the review, and how many times they have is
 * part of what the review screen reads.
 */
export const reviewAcknowledgement = pgTable("review_acknowledgement", {
  id: primaryId(),
  draftId: uuid().notNull().references(() => researchDraft.id, { onDelete: "cascade" }),
  kind: text().$type<AcknowledgementKind>().notNull(),
  actorSub: text(),
  actorName: text().notNull(),
  createdAt: createdAt(),
}, (t) => [
  index().on(t.draftId),
])
