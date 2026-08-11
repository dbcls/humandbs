/**
 * Who may do what.
 *
 * There is one role — administrator — and it holds every capability. Naming the
 * capabilities anyway is what lets a call site say which operation it is
 * performing rather than that somebody is an administrator, so a later layer can
 * add a screen without touching the shape of authorisation. The names line up
 * with the operations the event log records.
 *
 * **Being signed in without being an administrator is a real state, and it holds
 * no capability at all.** Authorisation is derived from `admin_user` on every
 * request; none of it is written into the cookie.
 */

export const CAPABILITIES = [
  "view-unpublished",
  "edit-content",
  "publish",
  "withdraw",
  "manage-labels",
  "manage-files",
  "manage-catalog",
  "manage-site-content",
  "manage-admins",
  "delete-research",
] as const

export type Capability = (typeof CAPABILITIES)[number]

export interface Actor {
  /** The session this request arrived with. `draft_presence` will key on it. */
  sessionId: string
  /** The Keycloak `sub`, and the only thing a person is identified by. */
  sub: string
  /** `preferred_username`: shown on screen, and written into the audit trail. */
  name: string
  isAdmin: boolean
  capabilities: ReadonlySet<Capability>
}

export function capabilitiesFor(isAdmin: boolean): ReadonlySet<Capability> {
  return new Set(isAdmin ? CAPABILITIES : [])
}

export function can(actor: Actor | null, capability: Capability): boolean {
  return actor?.capabilities.has(capability) ?? false
}
