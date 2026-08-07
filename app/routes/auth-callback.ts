import { redirect } from "react-router"

import { refreshAdminName } from "~/auth/admins.server"
import { beginLogin, clearedFlowCookie, completeLogin } from "~/auth/oidc.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { getDb } from "~/db/client.server"

import type { Route } from "./+types/auth-callback"

/**
 * Where Keycloak returns to. The code is exchanged here, the claims are read out
 * of the ID token, and a session row is written; the tokens themselves are not
 * kept, because nothing in this application would have anywhere to send them.
 *
 * A callback with no flow cookie is a stale tab, and starting the login again
 * fixes it. A callback whose exchange was refused is not, and it stops with a
 * 400 — starting again would arrive back here with the same answer.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const outcome = await completeLogin(request)

  if (!outcome.ok) {
    if (outcome.reason === "no-flow") {
      const { authorizationUrl, cookie } = await beginLogin(null)
      return redirect(authorizationUrl, { headers: { "Set-Cookie": cookie } })
    }
    return new Response("Sign-in could not be completed.", {
      status: 400,
      headers: { "Set-Cookie": clearedFlowCookie() },
    })
  }

  const { login } = outcome
  const db = getDb()
  const token = await createSession(db, login)
  // Nothing depends on the stored name, so a rename shows up here rather than in
  // a separate step.
  await refreshAdminName(db, login.sub, login.name)

  const headers = new Headers()
  headers.append("Set-Cookie", clearedFlowCookie())
  headers.append("Set-Cookie", sessionCookie(token))
  return redirect(login.redirectTo, { headers })
}
