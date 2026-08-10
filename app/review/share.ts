/**
 * Whether a share link opens.
 *
 * Sharing is two states — private, or open for comment — and an optional
 * expiry. The token itself is not one of the states: it stays on the draft, so
 * turning sharing off and on again gives back the same address and a link
 * already mailed out keeps working. Reissuing is the separate operation that
 * kills it, and the only one that does.
 */

export interface SharePolicy {
  enabled: boolean
  expiresAt: Date | null
}

export function isShareOpen(policy: SharePolicy, now: Date): boolean {
  if (!policy.enabled) return false
  return policy.expiresAt === null || policy.expiresAt.getTime() > now.getTime()
}

/** Enabled, but the date has gone by — a different thing to say than "private". */
export function isShareExpired(policy: SharePolicy, now: Date): boolean {
  return policy.enabled && !isShareOpen(policy, now)
}
