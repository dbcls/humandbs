import { redirect } from "react-router"

import { beginLogin } from "~/auth/oidc.server"

import type { Route } from "./+types/auth-login"

/**
 * The start of signing in. It has no screen: the only thing it does is hand the
 * browser to Keycloak, carrying a short cookie that holds `state`, the PKCE
 * verifier, the nonce and where to come back to.
 *
 * The address here has no language prefix, because it is the one Keycloak has
 * registered as a redirect URI and it is not a page anybody reads.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const asked = new URL(request.url).searchParams.get("redirect")
  const { authorizationUrl, cookie } = await beginLogin(asked)
  return redirect(authorizationUrl, { headers: { "Set-Cookie": cookie } })
}
