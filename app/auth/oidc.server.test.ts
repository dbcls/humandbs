/**
 * `beginLogin` / `completeLogin` / `endSessionUrl` against a stubbed Keycloak.
 *
 * Keycloak is the mock-able boundary (docs/testing.md), so `openid-client`'s
 * two functions that reach the network — `discovery` and
 * `authorizationCodeGrant` — are replaced. Everything else (`buildAuthorizationUrl`,
 * `calculatePKCECodeChallenge`, `buildEndSessionUrl`, `Configuration`) runs for
 * real against a `Configuration` built from fake server metadata, so the URLs
 * this file asserts on are the ones the real code path produces.
 */

import { parseCookie } from "cookie"
import * as oidc from "openid-client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("openid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openid-client")>()
  return { ...actual, discovery: vi.fn(), authorizationCodeGrant: vi.fn() }
})

import { FLOW_COOKIE, beginLogin, clearedFlowCookie, completeLogin, endSessionUrl } from "./oidc.server"

const ENV = {
  HUMANDBS_DATABASE_URL: "postgres://humandbs_app:secret@db:5432/humandbs",
  HUMANDBS_OWNER_DATABASE_URL: "postgres://humandbs:secret@db:5432/humandbs",
  HUMANDBS_AUTH_ISSUER_URL: "https://idp.example/realms/humandbs-test",
  HUMANDBS_AUTH_CLIENT_ID: "humandbs-test",
  HUMANDBS_AUTH_REDIRECT_URI: "http://localhost:8080/auth/callback",
  HUMANDBS_S3_ENDPOINT: "http://s3:8333",
  HUMANDBS_S3_ACCESS_KEY: "humandbs-dev",
  HUMANDBS_S3_SECRET_KEY: "humandbs-dev-secret",
} as const

const SERVER_METADATA: oidc.ServerMetadata = {
  issuer: ENV.HUMANDBS_AUTH_ISSUER_URL,
  authorization_endpoint: `${ENV.HUMANDBS_AUTH_ISSUER_URL}/protocol/openid-connect/auth`,
  token_endpoint: `${ENV.HUMANDBS_AUTH_ISSUER_URL}/protocol/openid-connect/token`,
  end_session_endpoint: `${ENV.HUMANDBS_AUTH_ISSUER_URL}/protocol/openid-connect/logout`,
}

type GrantCall = [oidc.Configuration, URL, { pkceCodeVerifier: string, expectedState: string, expectedNonce: string }]

function fakeTokens(
  claims: { sub: string, preferred_username?: string, name?: string },
): oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers {
  return {
    claims: () => claims,
    id_token: "an-id-token",
  } as unknown as oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers
}

/** The `Cookie` header a browser would send back for a given `Set-Cookie`. */
function requestWithCookie(setCookie: string, url = "http://localhost:8080/"): Request {
  const pair = setCookie.split(";")[0] ?? ""
  return new Request(url, { headers: { cookie: pair } })
}

function flowField(setCookie: string, key: string): string {
  const header = requestWithCookie(setCookie).headers.get("cookie") ?? ""
  const raw = parseCookie(header)[FLOW_COOKIE] ?? ""
  return new URLSearchParams(raw).get(key) ?? ""
}

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value)
  vi.mocked(oidc.discovery).mockResolvedValue(new oidc.Configuration(SERVER_METADATA, ENV.HUMANDBS_AUTH_CLIENT_ID))
  vi.mocked(oidc.authorizationCodeGrant).mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("beginLogin: PKCE", () => {
  it("uses S256 as the code challenge method", async () => {
    const { authorizationUrl } = await beginLogin(null)

    expect(new URL(authorizationUrl).searchParams.get("code_challenge_method")).toBe("S256")
  })

  it("sends a code_challenge that is the S256 hash of the verifier held in the cookie", async () => {
    const { authorizationUrl, cookie } = await beginLogin(null)
    const verifier = flowField(cookie, "verifier")

    const expected = await oidc.calculatePKCECodeChallenge(verifier)
    expect(new URL(authorizationUrl).searchParams.get("code_challenge")).toBe(expected)
  })

  it("never puts the PKCE verifier itself in the authorization URL", async () => {
    const { authorizationUrl, cookie } = await beginLogin(null)
    const verifier = flowField(cookie, "verifier")

    expect(new URL(authorizationUrl).search).not.toContain(verifier)
  })
})

describe("beginLogin: the flow cookie", () => {
  it("is HttpOnly, SameSite=Lax and expires after 10 minutes", async () => {
    const { cookie } = await beginLogin(null)

    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Lax")
    expect(cookie).toContain("Max-Age=600")
  })

  it("carries no Secure attribute when the configured redirect URI is http", async () => {
    vi.stubEnv("HUMANDBS_AUTH_REDIRECT_URI", "http://localhost:8080/auth/callback")

    const { cookie } = await beginLogin(null)

    expect(cookie).not.toContain("Secure")
  })

  it("carries Secure when the configured redirect URI is https, with no separate flag to disagree", async () => {
    vi.stubEnv("HUMANDBS_AUTH_REDIRECT_URI", "https://humandbs.dbcls.jp/auth/callback")

    const { cookie } = await beginLogin(null)

    expect(cookie).toContain("Secure")
  })

  it("clearedFlowCookie expires immediately", () => {
    expect(clearedFlowCookie()).toContain("Max-Age=0")
  })
})

describe("beginLogin: state and the return address live in the cookie, not in state", () => {
  it("puts state in both the URL and the cookie, and they match", async () => {
    const { authorizationUrl, cookie } = await beginLogin("/research/hum0001")

    expect(new URL(authorizationUrl).searchParams.get("state")).toBe(flowField(cookie, "state"))
  })

  it("does not encode the return address into state or anywhere else in the URL", async () => {
    const { authorizationUrl } = await beginLogin("/research/hum0001")

    expect(new URL(authorizationUrl).search).not.toContain("research")
  })

  it("stores the return address in the cookie", async () => {
    const { cookie } = await beginLogin("/research/hum0001")

    expect(flowField(cookie, "redirect")).toBe("/research/hum0001")
  })

  it("normalizes an off-site return address before writing it to the cookie", async () => {
    const { cookie } = await beginLogin("https://evil.example/")

    expect(flowField(cookie, "redirect")).toBe("/")
  })
})

describe("beginLogin: redirect_uri comes from configuration", () => {
  it("puts the configured redirect URI in the authorization URL", async () => {
    const { authorizationUrl } = await beginLogin(null)

    expect(new URL(authorizationUrl).searchParams.get("redirect_uri")).toBe(ENV.HUMANDBS_AUTH_REDIRECT_URI)
  })
})

describe("completeLogin: no flow to complete", () => {
  it("reports no-flow when there is no flow cookie at all", async () => {
    const request = new Request("http://localhost:8080/auth/callback?code=abc&state=xyz")

    expect(await completeLogin(request)).toEqual({ ok: false, reason: "no-flow" })
  })

  it("reports no-flow when the cookie is present but missing state, nonce or verifier", async () => {
    const request = new Request("http://localhost:8080/auth/callback", {
      headers: { cookie: `${FLOW_COOKIE}=redirect=%2Fadmin` },
    })

    expect(await completeLogin(request)).toEqual({ ok: false, reason: "no-flow" })
  })
})

describe("completeLogin: redirect_uri comes from configuration, not request.url", () => {
  it("builds the token-exchange URL from the configured redirect URI and only the query string of request.url", async () => {
    const { cookie } = await beginLogin(null)
    vi.mocked(oidc.authorizationCodeGrant).mockResolvedValue(fakeTokens({ sub: "u1" }))

    // Behind the proxy the request lands on an internal host and path that
    // disagree with the registered redirect URI.
    const request = requestWithCookie(
      cookie,
      `http://internal-app:3000/some/other/path?code=abc&state=${flowField(cookie, "state")}`,
    )

    await completeLogin(request)

    const [, currentUrl] = vi.mocked(oidc.authorizationCodeGrant).mock.calls[0] as GrantCall
    expect(currentUrl.origin + currentUrl.pathname).toBe(ENV.HUMANDBS_AUTH_REDIRECT_URI)
    expect(currentUrl.search).toBe(`?code=abc&state=${flowField(cookie, "state")}`)
  })
})

describe("completeLogin: state is checked against the cookie, not trusted from the URL", () => {
  it("passes the cookie's state as expectedState even when the URL carries a different one", async () => {
    const { cookie } = await beginLogin(null)
    vi.mocked(oidc.authorizationCodeGrant).mockResolvedValue(fakeTokens({ sub: "u1" }))

    const request = requestWithCookie(
      cookie,
      "http://localhost:8080/auth/callback?code=abc&state=something-else-entirely",
    )

    await completeLogin(request)

    const [, , checks] = vi.mocked(oidc.authorizationCodeGrant).mock.calls[0] as GrantCall
    expect(checks.expectedState).toBe(flowField(cookie, "state"))
    expect(checks.expectedState).not.toBe("something-else-entirely")
  })
})

describe("completeLogin: outcomes", () => {
  it("returns the sub, display name, id token and the return address from the cookie on success", async () => {
    const { cookie } = await beginLogin("/admin/drafts")
    vi.mocked(oidc.authorizationCodeGrant).mockResolvedValue(
      fakeTokens({ sub: "abc-def", preferred_username: "curator" }),
    )
    const request = requestWithCookie(
      cookie,
      `http://localhost:8080/auth/callback?code=abc&state=${flowField(cookie, "state")}`,
    )

    expect(await completeLogin(request)).toEqual({
      ok: true,
      login: { sub: "abc-def", name: "curator", idToken: "an-id-token", redirectTo: "/admin/drafts" },
    })
  })

  it("reports rejected when the token exchange itself is refused", async () => {
    const { cookie } = await beginLogin(null)
    vi.mocked(oidc.authorizationCodeGrant).mockRejectedValue(new Error("invalid_grant"))
    const request = requestWithCookie(
      cookie,
      `http://localhost:8080/auth/callback?code=abc&state=${flowField(cookie, "state")}`,
    )

    expect(await completeLogin(request)).toEqual({ ok: false, reason: "rejected" })
  })

  it("reports rejected when the response has no claims or no ID token", async () => {
    const { cookie } = await beginLogin(null)
    vi.mocked(oidc.authorizationCodeGrant).mockResolvedValue(
      { claims: () => undefined, id_token: undefined } as unknown as ReturnType<typeof fakeTokens>,
    )
    const request = requestWithCookie(
      cookie,
      `http://localhost:8080/auth/callback?code=abc&state=${flowField(cookie, "state")}`,
    )

    expect(await completeLogin(request)).toEqual({ ok: false, reason: "rejected" })
  })
})

describe("endSessionUrl", () => {
  it("carries the id token as id_token_hint and points back at this site's origin", async () => {
    const url = await endSessionUrl("the-id-token")

    expect(url).not.toBeNull()
    const parsed = new URL(url ?? "")
    expect(parsed.origin + parsed.pathname).toBe(
      `${ENV.HUMANDBS_AUTH_ISSUER_URL}/protocol/openid-connect/logout`,
    )
    expect(parsed.searchParams.get("id_token_hint")).toBe("the-id-token")
    expect(parsed.searchParams.get("post_logout_redirect_uri"))
      .toBe(`${new URL(ENV.HUMANDBS_AUTH_REDIRECT_URI).origin}/`)
  })

  it("is null when the realm does not advertise an end_session_endpoint", async () => {
    // Isolated from the module-level discovery cache the other cases share:
    // `configuration()` memoizes its result for the lifetime of the module, so
    // this case gets its own fresh module instance rather than a second
    // resolved value racing the first.
    vi.resetModules()
    const freshOidc = await import("openid-client")
    vi.mocked(freshOidc.discovery).mockResolvedValue(
      new freshOidc.Configuration({ issuer: ENV.HUMANDBS_AUTH_ISSUER_URL }, ENV.HUMANDBS_AUTH_CLIENT_ID),
    )
    const fresh = await import("./oidc.server")

    expect(await fresh.endSessionUrl("the-id-token")).toBeNull()
  })
})
