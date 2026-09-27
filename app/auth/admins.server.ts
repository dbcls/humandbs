/**
 * Who administers the portal.
 *
 * The state is stored in Postgres rather than in a Keycloak role, because the realm
 * belongs to another organisation and a change of staff would otherwise be a
 * request to them. It is read on every request that needs it; nothing about it
 * is cached in a cookie.
 *
 * Granting and revoking are recorded in the audit trail, in the same
 * transaction, so the log and the state agree. Both are also reachable from the
 * command line, which is what makes the first administrator possible at all.
 */

import { asc, eq, sql } from "drizzle-orm"

import type { Database, Executor } from "~/db/client.server"
import { adminUser } from "~/db/schema"

import type { EventActor } from "./events.server"
import { recordEvent } from "./events.server"

export interface AdminRecord {
  sub: string
  name: string
  since: Date
  /** When they last used the management screens; null until they sign in after being granted. */
  lastSeen: Date | null
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
    .select({
      sub: adminUser.keycloakSub,
      name: adminUser.displayName,
      since: adminUser.createdAt,
      lastSeen: adminUser.lastSeenAt,
    })
    .from(adminUser)
    .orderBy(asc(adminUser.createdAt))
}

/** False when the subject was already an administrator; nothing is recorded then. */
export async function grantAdmin(
  db: Database,
  actor: EventActor,
  subject: { sub: string, name: string },
): Promise<boolean> {
  return db.transaction((tx) => addAdmin(tx, actor, subject))
}

/**
 * The grant itself, inside a transaction the caller holds: the command line's,
 * or the one an invitation is spent in (`invitations.server.ts`).
 */
export async function addAdmin(
  tx: Executor,
  actor: EventActor,
  subject: { sub: string, name: string },
  detail: Record<string, unknown> = {},
): Promise<boolean> {
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
    detail: { displayName: subject.name, ...detail },
  })
  return true
}

/** False when the subject was not an administrator; nothing is recorded then. */
export async function revokeAdmin(db: Database, actor: EventActor, sub: string): Promise<boolean> {
  return db.transaction((tx) => removeAdmin(tx, actor, sub))
}

async function removeAdmin(tx: Executor, actor: EventActor, sub: string): Promise<boolean> {
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
}

/**
 * Taking an administrator away from the management screen.
 *
 * **Not yourself, and not the last one.** Taking yourself away ends what you
 * can do on the screen you pressed it on, and taking the last one away leaves
 * nobody who can grant anybody from the screen again. Both stay possible from
 * the command line (`revokeAdmin`), which answers to the database's credentials
 * rather than to a session.
 */
export async function revokeAdminOnScreen(
  db: Database,
  actor: EventActor,
  sub: string,
): Promise<"revoked" | "absent" | "self" | "last"> {
  if (sub === actor.sub) return "self"
  return db.transaction(async (tx) => {
    // Every row is locked, so two administrators taking each other away at the
    // same moment cannot both still see the other one there.
    const held = await tx.select({ sub: adminUser.keycloakSub }).from(adminUser).for("update")
    if (!held.some((row) => row.sub === sub)) return "absent"
    if (held.length <= 1) return "last"
    await removeAdmin(tx, actor, sub)
    return "revoked"
  })
}

/**
 * What a sign-in, or a session in use, tells the list of administrators: the
 * name Keycloak gave at sign-in, and that they are here now.
 *
 * The name is shown and written into the audit trail, never used to identify
 * anybody, so following a rename costs nothing and leaving it behind would put
 * an old name — or a bare `sub`, for somebody granted from the command line —
 * in front of whoever manages access. The time is how an account nobody uses
 * any more is found. Somebody who is not an administrator changes nothing.
 */
export async function recordAdminSeen(db: Executor, sub: string, name: string): Promise<void> {
  await db
    .update(adminUser)
    .set({ displayName: name, lastSeenAt: sql`now()` })
    .where(eq(adminUser.keycloakSub, sub))
}
