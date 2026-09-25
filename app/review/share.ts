/**
 * Whether a share link opens.
 *
 * Sharing is two states — private, or open for comment — and an optional
 * expiry. The token itself is not one of the states: it stays on the draft, so
 * turning sharing off and on again gives back the same address and a link
 * already mailed out keeps working. Reissuing is the separate operation that
 * kills it, and the only one that does.
 */

import { dayFromInput, dayInJst } from "~/dates"

export interface SharePolicy {
  enabled: boolean
  expiresAt: Date | null
}

export function isShareOpen(policy: SharePolicy, now: Date): boolean {
  if (!policy.enabled) return false
  return policy.expiresAt === null || policy.expiresAt.getTime() > now.getTime()
}

/** Enabled, but the date has gone by — a different thing to report than "private". */
export function isShareExpired(policy: SharePolicy, now: Date): boolean {
  return policy.enabled && !isShareOpen(policy, now)
}

/**
 * The instant a link given this day as its expiry stops opening: the end of
 * the day in JST, the clock every day on screen is cut by. Null for anything
 * that is not a day.
 */
export function shareExpiryOf(typed: string): Date | null {
  const day = dayFromInput(typed)
  return day === null ? null : new Date(`${day}T23:59:59.999+09:00`)
}

/** The day an expiry is shown as, which is the day it was typed as. */
export function shareExpiryDay(expiresAt: Date): string {
  return dayInJst(expiresAt.toISOString())
}
