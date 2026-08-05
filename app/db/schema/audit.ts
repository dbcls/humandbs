import { index, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core"

import { createdAt, primaryId, updatedAt } from "./common"

/**
 * Who may administer the portal. This is deliberately not a Keycloak role: the
 * realm belongs to another organisation, so granting a role would be a request
 * to them, and a change of staff could not be handled the same day.
 *
 * The key is the Keycloak `sub`. `preferred_username` can change, and keying on
 * it would sever both the grant and the audit trail on a rename.
 */
export const adminUser = pgTable("admin_user", {
  id: primaryId(),
  keycloakSub: text().notNull().unique(),
  displayName: text().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const eventAction = pgEnum("event_action", [
  "publish-version",
  "publish-fix",
  "withdraw-version",
  "republish-version",
  "delete-research",
  "discard-draft",
  "pin-label",
  "unpin-label",
  "publish-file",
  "unpublish-file",
  "grant-admin",
  "revoke-admin",
  "pass-publish-gate",
])

/**
 * Append-only record of the operations that changed what is published.
 *
 * The subject is stored as a plain string with no foreign key: deleting a
 * research must not delete the record of how it got there, and files are
 * addressed by name because their published state lives in S3, not here.
 *
 * Append-only is enforced by granting the writing role INSERT and SELECT only.
 * A trigger would not be enough — anything that can UPDATE can also fix up the
 * trigger's own bookkeeping.
 */
export const event = pgTable("event", {
  id: primaryId(),
  occurredAt: createdAt(),
  actorSub: text().notNull(),
  actorName: text().notNull(),
  action: eventAction().notNull(),
  subjectType: text().notNull(),
  subjectId: text().notNull(),
  detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [
  index().on(t.subjectType, t.subjectId),
  index().on(t.occurredAt),
])
