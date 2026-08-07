/**
 * Signed-in sessions.
 *
 * The cookie carries one unguessable value and nothing else. Everything about
 * the session is a row, so signing out takes effect at once and no part of the
 * cookie can be read as a statement about what its holder may do.
 *
 * **The row stores a hash of the cookie value.** Reading this table is not the
 * same as being able to impersonate the people in it.
 *
 * Two limits apply: the session ends after `IDLE_DAYS` without use and after
 * `ABSOLUTE_DAYS` whatever happens. The cookie is given the absolute limit as
 * its lifetime and the idle limit is enforced here, so reading a page never has
 * to re-issue the cookie. `last_seen_at` is written at most once an hour, so
 * reading a page is not a write either.
 *
 * Every deadline is Postgres's `now()`. There is then one clock, and a session
 * cannot outlive its row because the two disagree.
 */

import { createHash, randomBytes } from "node:crypto"

import { parseCookie, stringifySetCookie } from "cookie"
import { and, eq, gt, lt, or, sql } from "drizzle-orm"

import { cookiesAreSecure, loadConfig } from "~/config.server"
import type { Executor } from "~/db/client.server"
import { session } from "~/db/schema"

export const SESSION_COOKIE = "humandbs_session"

const IDLE_DAYS = 7
const ABSOLUTE_DAYS = 30
const TOUCH_MINUTES = 60
const TOKEN_BYTES = 32

export interface SessionRecord {
  id: string
  sub: string
  name: string
}

/** 32 bytes from the CSPRNG. base64url so it needs no cookie escaping. */
export function newSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url")
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

const idleCutoff = sql`now() - make_interval(days => ${IDLE_DAYS})`

export async function createSession(
  db: Executor,
  fields: { sub: string, name: string, idToken: string },
): Promise<string> {
  // Signing in is rare, which makes it the one place where clearing out dead
  // rows is both bounded in size and certain to happen.
  await deleteDeadSessions(db)

  const token = newSessionToken()
  await db.insert(session).values({
    tokenHash: hashSessionToken(token),
    keycloakSub: fields.sub,
    displayName: fields.name,
    idToken: fields.idToken,
    expiresAt: sql`now() + make_interval(days => ${ABSOLUTE_DAYS})`,
  })
  return token
}

export async function readSession(db: Executor, token: string): Promise<SessionRecord | null> {
  const rows = await db
    .select({
      id: session.id,
      sub: session.keycloakSub,
      name: session.displayName,
      stale: sql<boolean>`${session.lastSeenAt} < now() - make_interval(mins => ${TOUCH_MINUTES})`,
    })
    .from(session)
    .where(and(
      eq(session.tokenHash, hashSessionToken(token)),
      gt(session.expiresAt, sql`now()`),
      gt(session.lastSeenAt, idleCutoff),
    ))

  const row = rows[0]
  if (row === undefined) return null

  if (row.stale) {
    await db.update(session).set({ lastSeenAt: sql`now()` }).where(eq(session.id, row.id))
  }
  return { id: row.id, sub: row.sub, name: row.name }
}

/** Deletes the session and hands back the ID token, which logout needs as a hint. */
export async function endSession(db: Executor, token: string): Promise<string | null> {
  const rows = await db
    .delete(session)
    .where(eq(session.tokenHash, hashSessionToken(token)))
    .returning({ idToken: session.idToken })
  return rows[0]?.idToken ?? null
}

async function deleteDeadSessions(db: Executor): Promise<void> {
  await db.delete(session).where(or(
    lt(session.expiresAt, sql`now()`),
    lt(session.lastSeenAt, idleCutoff),
  ))
}

export function sessionCookie(token: string): string {
  return stringifySetCookie({
    ...cookieAttributes(),
    value: token,
    maxAge: ABSOLUTE_DAYS * 24 * 60 * 60,
  })
}

export function clearedSessionCookie(): string {
  return stringifySetCookie({ ...cookieAttributes(), value: "", maxAge: 0 })
}

export function tokenFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie")
  if (header === null) return null
  const value = parseCookie(header)[SESSION_COOKIE]
  return value === undefined || value === "" ? null : value
}

function cookieAttributes() {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: cookiesAreSecure(loadConfig(process.env).auth),
  }
}
