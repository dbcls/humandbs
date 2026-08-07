import { redirect } from "react-router"

import { endSessionUrl } from "~/auth/oidc.server"
import { clearedSessionCookie, endSession, tokenFromRequest } from "~/auth/session.server"
import { getDb } from "~/db/client.server"

import type { Route } from "./+types/auth-logout"

/**
 * Signing out. POST only, so that a link somebody else planted cannot end a
 * session, and the cookie's `SameSite=Lax` keeps a cross-site form from doing it
 * either.
 *
 * The row goes first: from that moment the cookie names nothing, whatever
 * happens with Keycloak afterwards. The stored ID token is what lets the
 * session at Keycloak be ended too, and without it clearing the cookie is all
 * signing out can do.
 */
export async function action({ request }: Route.ActionArgs) {
  const token = tokenFromRequest(request)
  const idToken = token === null ? null : await endSession(getDb(), token)
  const target = idToken === null ? "/" : await endSessionUrl(idToken) ?? "/"

  return redirect(target, { headers: { "Set-Cookie": clearedSessionCookie() } })
}
