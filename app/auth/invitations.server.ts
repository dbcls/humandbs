/**
 * Inviting an administrator by a link rather than by their `sub`.
 *
 * An administrator makes a link and hands it over; whoever signs in and opens
 * it becomes an administrator, with the `sub` and the name Keycloak gives. Nobody
 * copies a `sub` from one screen to another.
 *
 * **Spent by opening it while signed in.** A link preview in a chat reads the
 * address without a session, so it is sent to sign in and spends nothing.
 * Somebody who is already an administrator does not spend it either: it is
 * still there for the person it was made for.
 *
 * **One use, seven days, stored as a hash.** The value is shown once, when it
 * is made, and cannot be read back — the same reasoning as the session's.
 */

import { and, desc, eq, gt, isNull, sql } from "drizzle-orm"

import type { Database, Executor } from "~/db/client.server"
import { adminInvitation, adminUser } from "~/db/schema"

import { addAdmin } from "./admins.server"
import type { EventActor } from "./events.server"
import { hashSessionToken, newSessionToken } from "./session.server"

export const INVITATION_DAYS = 7

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The value to put into the link. It is not kept, only its hash. */
export async function createInvitation(db: Executor, actor: EventActor): Promise<string> {
  const token = newSessionToken()
  await db.insert(adminInvitation).values({
    tokenHash: hashSessionToken(token),
    createdBySub: actor.sub,
    createdByName: actor.name,
    expiresAt: sql`now() + make_interval(days => ${INVITATION_DAYS})`,
  })
  return token
}

export interface OpenInvitation {
  id: string
  createdByName: string
  createdAt: Date
  expiresAt: Date
}

/** The invitations that can still be used, newest first. */
export async function openInvitations(db: Executor): Promise<OpenInvitation[]> {
  return db
    .select({
      id: adminInvitation.id,
      createdByName: adminInvitation.createdByName,
      createdAt: adminInvitation.createdAt,
      expiresAt: adminInvitation.expiresAt,
    })
    .from(adminInvitation)
    .where(and(isNull(adminInvitation.usedAt), gt(adminInvitation.expiresAt, sql`now()`)))
    .orderBy(desc(adminInvitation.createdAt))
}

/** False when there is no unused invitation by that id. */
export async function cancelInvitation(db: Executor, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false
  const removed = await db
    .delete(adminInvitation)
    .where(and(eq(adminInvitation.id, id), isNull(adminInvitation.usedAt)))
    .returning({ id: adminInvitation.id })
  return removed.length > 0
}

export type InvitationOutcome = "granted" | "already" | "expired" | "used" | "unknown"

/**
 * Spending an invitation on the person signed in. The row is locked, so a link
 * opened twice at once makes one administrator and reports the other as used.
 */
export async function acceptInvitation(
  db: Database,
  token: string,
  person: { sub: string, name: string },
): Promise<InvitationOutcome> {
  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select({
        id: adminInvitation.id,
        createdBySub: adminInvitation.createdBySub,
        createdByName: adminInvitation.createdByName,
        used: sql<boolean>`${adminInvitation.usedAt} IS NOT NULL`,
        usedBySub: adminInvitation.usedBySub,
        expired: sql<boolean>`${adminInvitation.expiresAt} <= now()`,
      })
      .from(adminInvitation)
      .where(eq(adminInvitation.tokenHash, hashSessionToken(token)))
      .for("update")
    if (invitation === undefined) return "unknown"
    // The page opened again by the person it made an administrator (a reload)
    // is the same answer as the first time.
    if (invitation.used) return invitation.usedBySub === person.sub ? "granted" : "used"
    if (invitation.expired) return "expired"

    const [held] = await tx.select({ sub: adminUser.keycloakSub }).from(adminUser).where(eq(adminUser.keycloakSub, person.sub))
    if (held !== undefined) return "already"

    await addAdmin(
      tx,
      { sub: invitation.createdBySub, name: invitation.createdByName },
      person,
      { invitation: invitation.id },
    )
    await tx
      .update(adminInvitation)
      .set({ usedAt: sql`now()`, usedBySub: person.sub })
      .where(eq(adminInvitation.id, invitation.id))
    // They are here now, which is what the list's last-seen shows.
    await tx.update(adminUser).set({ lastSeenAt: sql`now()` }).where(eq(adminUser.keycloakSub, person.sub))
    return "granted"
  })
}
