/**
 * JWT verification hybrid tests
 *
 * Real `jose.jwtVerify` (no mock) is exercised against an in-process RS256
 * keypair so we cover the attack matrix that the global mock in auth.test.ts
 * can't: `alg=none`, signature tampering, `kid` mismatch, `aud` array
 * handling, `nbf` / `exp` enforcement.
 *
 * Only `createRemoteJWKSet` is replaced with a static key resolver — that
 * avoids the network fetch to Keycloak; the actual signature/claim
 * verification still runs through real jose.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test"
import * as joseActual from "jose"

// ----- Real keypair (per-process) -----
//
// Generated once before any module under test imports jose so the cached
// `createRemoteJWKSet` resolver returns the matching public key.

const ISSUER = "https://idp.example.com/realms/test"
const AUDIENCE = "humandbs-dev"
const KID = "test-key-1"

const keypair = await joseActual.generateKeyPair("RS256", { extractable: true })
const wrongKeypair = await joseActual.generateKeyPair("RS256", { extractable: true })

// Resolver mimicking jose's JWTVerifyGetKey signature.
// Honour the JWS header `kid`: jose passes it in `protectedHeader.kid`.
const keyResolver = async (protectedHeader: { kid?: string }) => {
  if (protectedHeader.kid !== KID) {
    throw new joseActual.errors.JWKSNoMatchingKey()
  }
  return keypair.publicKey
}

const mockCreateRemoteJWKSet = mock(() => keyResolver)

void mock.module("jose", () => ({
  ...joseActual,
  // Real jwtVerify; only swap the key resolver factory.
  createRemoteJWKSet: mockCreateRemoteJWKSet,
}))

// admin_uids.json read is irrelevant for these tests — return empty so any
// authenticated sub becomes a non-admin.
void mock.module("node:fs/promises", () => ({
  readFile: mock(async () => "[]"),
}))

// Pin env BEFORE importing the middleware so module-load reads the right
// issuer/audience.
const savedEnv = {
  issuer: process.env.HUMANDBS_AUTH_ISSUER_URL,
  client: process.env.HUMANDBS_AUTH_CLIENT_ID,
}
process.env.HUMANDBS_AUTH_ISSUER_URL = ISSUER
process.env.HUMANDBS_AUTH_CLIENT_ID = AUDIENCE

const { __testing } = await import("@/api/middleware/auth")
const { getTestApp } = await import("../helpers")

afterAll(() => {
  if (savedEnv.issuer === undefined) delete process.env.HUMANDBS_AUTH_ISSUER_URL
  else process.env.HUMANDBS_AUTH_ISSUER_URL = savedEnv.issuer
  if (savedEnv.client === undefined) delete process.env.HUMANDBS_AUTH_CLIENT_ID
  else process.env.HUMANDBS_AUTH_CLIENT_ID = savedEnv.client
})

beforeEach(() => {
  __testing.clearJwksCache()
})

// ----- JWT helpers (real signing) -----

interface SignOptions {
  alg?: string
  kid?: string
  issuer?: string
  audience?: string | string[]
  sub?: string
  exp?: number
  nbf?: number
  iat?: number
  key?: CryptoKey
  extraClaims?: Record<string, unknown>
}

const nowSec = () => Math.floor(Date.now() / 1000)

const signJwt = async (opts: SignOptions = {}): Promise<string> => {
  const builder = new joseActual.SignJWT({
    sub: opts.sub ?? "user-1",
    preferred_username: "test-user",
    email: "test-user@example.com",
    iat: opts.iat ?? nowSec(),
    exp: opts.exp ?? nowSec() + 60,
    ...(opts.nbf !== undefined ? { nbf: opts.nbf } : {}),
    ...(opts.extraClaims ?? {}),
  })
    .setProtectedHeader({ alg: opts.alg ?? "RS256", kid: opts.kid ?? KID })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
  return builder.sign(opts.key ?? keypair.privateKey)
}

const bearerHeaders = (token: string) => ({ Authorization: `Bearer ${token}` })

beforeAll(() => {
  // Sanity: avoid silently using wrong issuer/audience.
  expect(process.env.HUMANDBS_AUTH_ISSUER_URL).toBe(ISSUER)
  expect(process.env.HUMANDBS_AUTH_CLIENT_ID).toBe(AUDIENCE)
})

// ----- Tests -----

describe("JWT hybrid verification", () => {
  it("accepts a valid RS256 token signed with the expected key", async () => {
    const token = await signJwt()
    const res = await getTestApp().request("/admin/is-admin", { headers: bearerHeaders(token) })
    expect(res.status).toBe(200)
  })

  it("rejects an alg=none token (jose disallows unsigned tokens)", async () => {
    // Hand-craft a token with `alg=none` and no signature.
    const headerB64 = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")
    const payload = {
      iss: ISSUER,
      aud: AUDIENCE,
      sub: "user-1",
      iat: nowSec(),
      exp: nowSec() + 60,
    }
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url")
    const token = `${headerB64}.${payloadB64}.`
    const res = await getTestApp().request("/admin/is-admin", { headers: bearerHeaders(token) })
    expect(res.status).toBe(401)
  })

  it("rejects a token signed with the wrong key (tampered signature)", async () => {
    const token = await signJwt({ key: wrongKeypair.privateKey })
    const res = await getTestApp().request("/admin/is-admin", { headers: bearerHeaders(token) })
    expect(res.status).toBe(401)
  })

  it("rejects a token whose kid does not match the JWKS", async () => {
    const token = await signJwt({ kid: "unknown-kid" })
    const res = await getTestApp().request("/admin/is-admin", { headers: bearerHeaders(token) })
    expect(res.status).toBe(401)
  })

  it("rejects an expired token", async () => {
    const token = await signJwt({ exp: nowSec() - 10 })
    const res = await getTestApp().request("/admin/is-admin", { headers: bearerHeaders(token) })
    expect(res.status).toBe(401)
  })

  it("rejects a token whose nbf is in the future", async () => {
    const token = await signJwt({ nbf: nowSec() + 600 })
    const res = await getTestApp().request("/admin/is-admin", { headers: bearerHeaders(token) })
    expect(res.status).toBe(401)
  })

  it("accepts an aud array that contains the expected audience", async () => {
    const token = await signJwt({ audience: [AUDIENCE, "other-client"] })
    const res = await getTestApp().request("/admin/is-admin", { headers: bearerHeaders(token) })
    expect(res.status).toBe(200)
  })

  it("rejects an aud array that omits the expected audience", async () => {
    const token = await signJwt({ audience: ["other-client", "another-client"] })
    const res = await getTestApp().request("/admin/is-admin", { headers: bearerHeaders(token) })
    expect(res.status).toBe(401)
  })

  it("rejects a token from a different issuer", async () => {
    const token = await signJwt({ issuer: "https://attacker.example.com/realms/master" })
    const res = await getTestApp().request("/admin/is-admin", { headers: bearerHeaders(token) })
    expect(res.status).toBe(401)
  })
})
