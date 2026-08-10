/**
 * Writing to the audit trail.
 *
 * Every operation that changes what is published goes through here, inside the
 * transaction that made the change, so a recorded event and the state it
 * describes cannot come apart. Signing in is not one of them.
 *
 * The log cannot be corrected: the role the application connects as holds INSERT
 * and SELECT on it and nothing else (`app/db/grants.server.ts`).
 */

import type { Executor } from "~/db/client.server"
import type { EventAction, EventSubjectType } from "~/db/schema"
import { event } from "~/db/schema"

export interface EventActor {
  sub: string
  name: string
}

/**
 * The actor for events that no signed-in person caused: creating the first
 * administrator, and any later change made from the command line. It is a
 * reserved value rather than a `sub`, so reading the log never mistakes it for
 * somebody's account.
 */
export const BOOTSTRAP_ACTOR: EventActor = { sub: "bootstrap", name: "bootstrap" }

export interface EventEntry {
  actor: EventActor
  action: EventAction
  subjectType: EventSubjectType
  subjectId: string
  detail?: Record<string, unknown>
}

/**
 * The identity of the row is returned because one thing points at an event: the
 * description a publish wrote over is kept beside the publish that did it.
 */
export async function recordEvent(executor: Executor, entry: EventEntry): Promise<string> {
  const rows = await executor.insert(event).values({
    actorSub: entry.actor.sub,
    actorName: entry.actor.name,
    action: entry.action,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    detail: entry.detail ?? {},
  }).returning({ id: event.id })

  const row = rows[0]
  if (row === undefined) throw new Error("the event insert returned no row")
  return row.id
}
