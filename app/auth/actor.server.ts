/**
 * Who is asking, and what they may do.
 *
 * Derived per request: the cookie names a session, the session names a `sub`,
 * and whether that `sub` administers the portal is read from Postgres every
 * time. Nothing about authorisation is carried in the cookie, so removing
 * somebody's access takes effect on their next request.
 *
 * A request with no cookie asks the database nothing, which is every request to
 * a public page.
 */

import { redirect } from "react-router"

import { getDb } from "~/db/client.server"

import { isAdmin } from "./admins.server"
import { type Actor, type Capability, can, capabilitiesFor } from "./capabilities"
import { readSession, tokenFromRequest } from "./session.server"

export async function readActor(request: Request): Promise<Actor | null> {
  const token = tokenFromRequest(request)
  if (token === null) return null

  const db = getDb()
  const record = await readSession(db, token)
  if (record === null) return null

  const admin = await isAdmin(db, record.sub)
  return {
    sessionId: record.id,
    sub: record.sub,
    name: record.name,
    isAdmin: admin,
    capabilities: capabilitiesFor(admin),
  }
}

/** Sends an unauthenticated request to sign in and come back to where it was. */
export async function requireActor(request: Request): Promise<Actor> {
  const actor = await readActor(request)
  if (actor !== null) return actor

  const url = new URL(request.url)
  const query = new URLSearchParams({ redirect: `${url.pathname}${url.search}` })
  throw redirect(`/auth/login?${query.toString()}`)
}

/**
 * The guard every write and every unpublished read goes through. Signed in but
 * without the capability is 403 rather than a redirect: signing in again would
 * not change the answer.
 */
export async function requireCapability(
  request: Request,
  capability: Capability,
): Promise<Actor> {
  const actor = await requireActor(request)
  if (!can(actor, capability)) {
    throw new Response(null, { status: 403, statusText: "Forbidden" })
  }
  return actor
}
