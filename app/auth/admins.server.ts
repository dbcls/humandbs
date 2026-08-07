/**
 * Who administers the portal.
 *
 * The state lives in Postgres rather than in a Keycloak role, because the realm
 * belongs to another organisation and a change of staff would otherwise be a
 * request to them. It is read on every request that needs it; nothing about it
 * is cached in a cookie.
 *
 * Granting and revoking are recorded in the audit trail, in the same
 * transaction, so the log and the state agree. Both are also reachable from the
 * command line, which is what makes the first administrator possible at all.
 */

import { asc, eq } from "drizzle-orm"

import type { Database, Executor } from "~/db/client.server"
import { adminUser } from "~/db/schema"

import type { EventActor } from "./events.server"
import { recordEvent } from "./events.server"

export interface AdminRecord {
  sub: string
  name: string
  since: Date
}

export async function isAdmin(db: Executor, sub: string): Promise<boolean> {
  const rows = await db
    .select({ sub: adminUser.keycloakSub })
    .from(adminUser)
    .where(eq(adminUser.keycloakSub, sub))
  return rows.length > 0
}

export async function listAdmins(db: Executor): Promise<AdminRecord[]> {
  return db
    .select({ sub: adminUser.keycloakSub, name: adminUser.displayName, since: adminUser.createdAt })
    .from(adminUser)
    .orderBy(asc(adminUser.createdAt))
}

/** False when the subject was already an administrator; nothing is recorded then. */
export async function grantAdmin(
  db: Database,
  actor: EventActor,
  subject: { sub: string, name: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(adminUser)
      .values({ keycloakSub: subject.sub, displayName: subject.name })
      .onConflictDoNothing({ target: adminUser.keycloakSub })
      .returning({ sub: adminUser.keycloakSub })

    if (inserted.length === 0) return false

    await recordEvent(tx, {
      actor,
      action: "grant-admin",
      subjectType: "admin",
      subjectId: subject.sub,
      detail: { displayName: subject.name },
    })
    return true
  })
}

/** False when the subject was not an administrator; nothing is recorded then. */
export async function revokeAdmin(db: Database, actor: EventActor, sub: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(adminUser)
      .where(eq(adminUser.keycloakSub, sub))
      .returning({ name: adminUser.displayName })

    const row = removed[0]
    if (row === undefined) return false

    await recordEvent(tx, {
      actor,
      action: "revoke-admin",
      subjectType: "admin",
      subjectId: sub,
      detail: { displayName: row.name },
    })
    return true
  })
}

/**
 * Keeps the stored display name in step with Keycloak. The name is shown and
 * written into the audit trail, never used to identify anybody, so following a
 * rename costs nothing and leaving it behind would put an old name in front of
 * whoever manages access.
 */
export async function refreshAdminName(db: Executor, sub: string, name: string): Promise<void> {
  await db
    .update(adminUser)
    .set({ displayName: name, updatedAt: new Date() })
    .where(eq(adminUser.keycloakSub, sub))
}
