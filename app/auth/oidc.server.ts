/**
 * Signing in against the DDBJ Keycloak.
 *
 * The client is public and uses PKCE. A confidential client is what the IETF
 * recommends for this shape of application, but nothing long-lived is kept here
 * for a secret to protect: the code is exchanged on the server, the claims are
 * read out of the ID token, and the tokens are then dropped. Only the ID token
 * survives, in the session row, because ending the session at Keycloak needs it
 * as `id_token_hint`.
 *
 * `state`, the PKCE verifier, the nonce and where to return to travel in a short
 * cookie rather than inside `state`, so `state` stays an opaque value and the
 * return address cannot be rewritten by whoever holds the callback URL.
 *
 * The address the token exchange claims to have been called at is built from the
 * configured redirect URI, not from `request.url`: behind the proxy the request
 * arrives at an internal address, and the exchange has to present the same
 * `redirect_uri` the authorization request did.
 */

import { parseCookie, stringifySetCookie } from "cookie"
import * as oidc from "openid-client"

import { cookiesAreSecure, loadConfig } from "~/config.server"

import { safeRedirectPath } from "./redirect"

const FLOW_COOKIE = "humandbs_login"
const FLOW_MINUTES = 10
const SCOPE = "openid profile"

export interface LoginStart {
  authorizationUrl: string
  cookie: string
}

export interface LoginResult {
  sub: string
  name: string
  idToken: string
  redirectTo: string
}

/**
 * The two ways completing a login can fail are kept apart because they call for
 * opposite answers. `no-flow` means there is nothing to complete — a tab left
 * open, a callback address opened by hand — and starting again fixes it.
 * `rejected` means the exchange itself was refused, and starting again would
 * arrive here a second time, so it has to stop.
 */
export type LoginOutcome
  = | { ok: true, login: LoginResult }
    | { ok: false, reason: "no-flow" | "rejected" }

let discovered: Promise<oidc.Configuration> | undefined

function configuration(): Promise<oidc.Configuration> {
  const { auth } = loadConfig(process.env)
  discovered ??= oidc.discovery(new URL(auth.issuerUrl), auth.clientId)
  return discovered
}

export async function beginLogin(redirectTo: string | null): Promise<LoginStart> {
  const { auth } = loadConfig(process.env)
  const config = await configuration()

  const state = oidc.randomState()
  const nonce = oidc.randomNonce()
  const verifier = oidc.randomPKCECodeVerifier()

  const authorizationUrl = oidc.buildAuthorizationUrl(config, {
    redirect_uri: auth.redirectUri,
    scope: SCOPE,
    state,
    nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
  })

  const flow = new URLSearchParams({
    state,
    nonce,
    verifier,
    redirect: safeRedirectPath(redirectTo),
  })

  return { authorizationUrl: authorizationUrl.href, cookie: flowCookie(flow.toString()) }
}

export async function completeLogin(request: Request): Promise<LoginOutcome> {
  const flow = readFlow(request)
  if (flow === null) return { ok: false, reason: "no-flow" }

  const { auth } = loadConfig(process.env)
  const currentUrl = new URL(auth.redirectUri)
  currentUrl.search = new URL(request.url).search

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers
  try {
    tokens = await oidc.authorizationCodeGrant(await configuration(), currentUrl, {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      // Requiring the nonce also requires an ID token to be part of the response.
      expectedNonce: flow.nonce,
    })
  } catch {
    return { ok: false, reason: "rejected" }
  }

  const claims = tokens.claims()
  if (claims === undefined || tokens.id_token === undefined) {
    return { ok: false, reason: "rejected" }
  }

  return {
    ok: true,
    login: {
      sub: claims.sub,
      name: displayName(claims),
      idToken: tokens.id_token,
      redirectTo: flow.redirectTo,
    },
  }
}

/**
 * Where to send the browser to end the session at Keycloak as well. Null when
 * the realm does not advertise the endpoint, in which case clearing the session
 * here is all that signing out can do.
 */
export async function endSessionUrl(idToken: string): Promise<string | null> {
  const { auth } = loadConfig(process.env)
  const config = await configuration()
  if (config.serverMetadata().end_session_endpoint === undefined) return null

  return oidc.buildEndSessionUrl(config, {
    id_token_hint: idToken,
    post_logout_redirect_uri: `${new URL(auth.redirectUri).origin}/`,
  }).href
}

export function clearedFlowCookie(): string {
  return flowCookie("", 0)
}

/**
 * `preferred_username` is what the interface shows and what the audit trail
 * records as the actor's name. It is never an identity — that is `sub` — so
 * falling back to the subject when the claim is absent loses nothing.
 */
function displayName(claims: { sub: string, preferred_username?: unknown, name?: unknown }): string {
  if (typeof claims.preferred_username === "string" && claims.preferred_username !== "") {
    return claims.preferred_username
  }
  if (typeof claims.name === "string" && claims.name !== "") return claims.name
  return claims.sub
}

interface LoginFlow {
  state: string
  nonce: string
  verifier: string
  redirectTo: string
}

function readFlow(request: Request): LoginFlow | null {
  const header = request.headers.get("cookie")
  if (header === null) return null

  const raw = parseCookie(header)[FLOW_COOKIE]
  if (raw === undefined || raw === "") return null

  const params = new URLSearchParams(raw)
  const state = params.get("state")
  const nonce = params.get("nonce")
  const verifier = params.get("verifier")
  if (state === null || nonce === null || verifier === null) return null

  return { state, nonce, verifier, redirectTo: safeRedirectPath(params.get("redirect")) }
}

function flowCookie(value: string, maxAge = FLOW_MINUTES * 60): string {
  return stringifySetCookie({
    name: FLOW_COOKIE,
    value,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: cookiesAreSecure(loadConfig(process.env).auth),
    maxAge,
  })
}
