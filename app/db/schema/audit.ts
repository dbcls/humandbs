import { index, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core"

import { createdAt, primaryId } from "./common"

export const eventAction = pgEnum("event_action", [
  "publish-version",
  /** A publish in a version's place: the update of it, under its number, so the row under it went. */
  "replace-version",
  /** A dataset whose description this publish wrote differently. */
  "publish-dataset",
  /**
   * A version turned back into a draft. Recorded because it is the only trace
   * left: the row moves rather than gaining a flag, so nothing else can say
   * that the number was ever out.
   */
  "withdraw-version",
  "delete-research",
  "discard-draft",
  "pin-label",
  "unpin-label",
  "publish-file",
  "unpublish-file",
  "delete-file",
  "publish-site-content",
  "unpublish-site-content",
  "grant-admin",
  "revoke-admin",
  "pass-publish-gate",
])

export type EventAction = (typeof eventAction.enumValues)[number]

/** What an action is done to. Not a table name: the subject has no foreign key. */
export type EventSubjectType
  = | "research"
    | "research-version"
    | "dataset"
    | "draft"
    | "label"
    | "file"
    | "document"
    | "news"
    | "alert"
    | "admin"

/**
 * Append-only record of the operations that changed what is published.
 *
 * The subject is stored as a plain string with no foreign key: deleting a
 * research must not delete the record of how it got there, and files are
 * addressed by name because their published state lives in S3, not here.
 *
 * Append-only is enforced by granting the role that serves requests INSERT and
 * SELECT only (`app/db/grants.server.ts`). A trigger would not be enough —
 * anything that can UPDATE can also fix up the trigger's own bookkeeping.
 *
 * Signing in is not recorded. What is recorded is the operations that changed
 * something published, and the actor is written into each of those.
 */
export const event = pgTable("event", {
  id: primaryId(),
  occurredAt: createdAt(),
  actorSub: text().notNull(),
  actorName: text().notNull(),
  action: eventAction().notNull(),
  subjectType: text().$type<EventSubjectType>().notNull(),
  subjectId: text().notNull(),
  detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [
  index().on(t.subjectType, t.subjectId),
  index().on(t.occurredAt),
])
