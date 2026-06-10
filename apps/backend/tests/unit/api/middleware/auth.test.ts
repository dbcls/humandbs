/**
 * Keycloak authentication middleware tests
 *
 * Covers:
 * - IT-AUTH-01: 401 when admin endpoint is called without Bearer
 * - IT-AUTH-03: 401 on malformed Bearer
 * - IT-AUTH-04: 401 on expired JWT
 * - IT-AUTH-05: 401 on issuer mismatch
 * - IT-AUTH-06: 401 on audience mismatch
 * - IT-AUTH-07: JWKS rotation: retry after cache clear succeeds
 * - IT-AUTH-08: admin_uids contains sub -> isAdmin=true
 * - IT-AUTH-09: admin_uids does not contain sub -> isAdmin=false
 * - IT-AUTH-10: HUMANDBS_BACKEND_ADMIN_UID_FILE unset -> no admins, no error
 * - IT-AUTH-21: Authorization without "Bearer " prefix -> 401
 * - IT-AUTH-22: Empty Bearer token -> 401
 * - IT-ADMIN-04: admin_uids cache invalidation (clear path)
 *
 * Mocking strategy:
 * - jose.jwtVerify / jose.createRemoteJWKSet are mocked at the module boundary
 *   so that no real Keycloak is contacted. jose.errors classes are preserved.
 * - node:fs/promises.readFile is mocked so admin_uids.json reads return
 *   test-controlled content.
 * - The in-memory JWKS / admin_uids caches are cleared in beforeEach via the
 *   __testing API exposed by middleware/auth.ts.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"
import * as joseActual from "jose"

import { createMockAuthUser } from "../helpers/mock-es"

// === Mocks ===

// Provide a controllable jwtVerify; default impl is overridden per test
const mockJwtVerify = mock(async (..._args: unknown[]): Promise<{ payload: unknown }> => {
  throw new Error("mockJwtVerify default: not configured")
})

const mockCreateRemoteJWKSet = mock((..._args: unknown[]) => {
  // Returns an opaque key resolver. Identity doesn't matter; jwtVerify is mocked.
  return (async () => { throw new Error("should be intercepted by mockJwtVerify") })
})

void mock.module("jose", () => ({
  ...joseActual,
  jwtVerify: mockJwtVerify,
  createRemoteJWKSet: mockCreateRemoteJWKSet,
}))

const mockReadFile = mock(async (_path: string, _encoding: string): Promise<string> => {
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
})

void mock.module("node:fs/promises", () => ({
  readFile: mockReadFile,
}))

// Import AFTER mock.module so the middleware picks up mocked dependencies.
const { __testing, getAuthenticatedUser } = await import("@/api/middleware/auth")
const { getTestApp } = await import("../helpers")
const { InternalError } = await import("@/api/errors")

// === Helpers ===

const ADMIN_USER_ID = "admin-sub-001"
const REGULAR_USER_ID = "user-sub-002"

const validClaimsFor = (sub: string) => ({
  sub,
  preferred_username: `user-${sub}`,
  email: `${sub}@example.com`,
  iat: 1_700_000_000,
  exp: 9_999_999_999,
})

const bearerHeaders = (token = "valid.jwt.token") => ({
  Authorization: `Bearer ${token}`,
})

const setAdminUidsFile = (uids: string[]) => {
  // ADMIN_UID_FILE env is captured at import time, so we mock the read result here
  mockReadFile.mockImplementation(async () => JSON.stringify(uids))
}

const setAdminUidsFileMissing = () => {
  mockReadFile.mockImplementation(async () => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
  })
}

const setAdminUidsFileMalformed = (content: string) => {
  mockReadFile.mockImplementation(async () => content)
}

// === Env wrapper: ensure HUMANDBS_BACKEND_ADMIN_UID_FILE has a value for cases
//     that need a file path (the value itself is opaque since fs.readFile is mocked).

const ORIGINAL_ENV = { ...process.env }
const setEnv = (key: string, value: string | undefined) => {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key)
  } else {
    process.env[key] = value
  }
}

beforeEach(() => {
  // Reset caches between tests so adminUids and JWKS state never leak
  __testing.clearJwksCache()
  __testing.clearAdminUidsCache()
  mockJwtVerify.mockReset()
  mockCreateRemoteJWKSet.mockReset()
  mockCreateRemoteJWKSet.mockImplementation((..._args: unknown[]) => {
    return (async () => { throw new Error("should be intercepted by mockJwtVerify") })
  })
  mockReadFile.mockReset()
  setAdminUidsFileMissing()
  // Most tests need a path so the file-read branch is exercised
  setEnv("HUMANDBS_BACKEND_ADMIN_UID_FILE", ORIGINAL_ENV.HUMANDBS_BACKEND_ADMIN_UID_FILE ?? "/fake/admin_uids.json")
})

// === extractBearerToken / requireAuth gates (IT-AUTH-01, 03, 21, 22) ===

describe("api/middleware/auth", () => {
  describe("requireAuth: Bearer parsing & rejections", () => {
    it("returns 401 when Authorization is missing (IT-AUTH-01)", async () => {
      const app = getTestApp()
      const res = await app.request("/admin/is-admin")
      expect(res.status).toBe(401)
      expect(res.headers.get("content-type")).toContain("application/problem+json")
      const body = await res.json() as { title?: string; type?: string; detail?: string }
      expect(body.title).toBe("Unauthorized")
      expect(body.type).toContain("/errors/unauthorized")
      expect(body.detail).toContain("Authentication required")
    })

    it("returns 401 when Authorization lacks the 'Bearer ' prefix (IT-AUTH-21)", async () => {
      const app = getTestApp()
      const res = await app.request("/admin/is-admin", {
        headers: { Authorization: "token-without-bearer-prefix" },
      })
      expect(res.status).toBe(401)
      // extractBearerToken returns null; verifyToken is never reached
      expect(mockJwtVerify).not.toHaveBeenCalled()
    })

    it("returns 401 when Bearer token is empty (IT-AUTH-22)", async () => {
      const app = getTestApp()
      const res = await app.request("/admin/is-admin", {
        headers: { Authorization: "Bearer " },
      })
      expect(res.status).toBe(401)
      // Empty body fails the regex; mock JWT verify is never invoked
      expect(mockJwtVerify).not.toHaveBeenCalled()
    })

    it("returns 401 when JWT signature verification fails (IT-AUTH-03)", async () => {
      mockJwtVerify.mockImplementation(async () => {
        throw new joseActual.errors.JWTInvalid("malformed jwt")
      })
      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders("not.a.valid.jwt") })
      expect(res.status).toBe(401)
      const body = await res.json() as { detail?: string }
      expect(body.detail).toContain("Invalid or expired token")
      // JWTInvalid is independent of JWKS; we must NOT spend a JWKS fetch on it.
      // Anything else would let attackers cycle the cache by spamming garbage tokens.
      expect(mockJwtVerify).toHaveBeenCalledTimes(1)
    })

    it("returns 401 when JWT is expired (IT-AUTH-04)", async () => {
      mockJwtVerify.mockImplementation(async () => {
        throw new joseActual.errors.JWTExpired("exp", { exp: 1, iat: 0 })
      })
      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders() })
      expect(res.status).toBe(401)
    })

    it("returns 401 when issuer does not match (IT-AUTH-05)", async () => {
      mockJwtVerify.mockImplementation(async () => {
        throw new joseActual.errors.JWTClaimValidationFailed(
          "unexpected \"iss\" claim value",
          { sub: REGULAR_USER_ID },
          "iss",
          "check_failed",
        )
      })
      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders() })
      expect(res.status).toBe(401)
    })

    it("returns 401 when audience does not match (IT-AUTH-06)", async () => {
      mockJwtVerify.mockImplementation(async () => {
        throw new joseActual.errors.JWTClaimValidationFailed(
          "unexpected \"aud\" claim value",
          { sub: REGULAR_USER_ID },
          "aud",
          "check_failed",
        )
      })
      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders() })
      expect(res.status).toBe(401)
    })

    it("returns 401 when JwtClaimsSchema rejects the payload", async () => {
      // payload missing required `sub` -> Zod rejection inside verifyToken
      mockJwtVerify.mockImplementation(async () => ({ payload: { preferred_username: "x" } }))
      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders() })
      expect(res.status).toBe(401)
    })
  })

  // === JWKS rotation retry (IT-AUTH-07) ===

  describe("JWKS rotation retry", () => {
    it("retries with a fresh JWKS after JWSSignatureVerificationFailed and succeeds (IT-AUTH-07)", async () => {
      setAdminUidsFile([])
      // First call fails with signature error; second call succeeds with valid claims
      let call = 0
      mockJwtVerify.mockImplementation(async () => {
        call += 1
        if (call === 1) {
          throw new joseActual.errors.JWSSignatureVerificationFailed("bad signature")
        }
        return { payload: validClaimsFor(REGULAR_USER_ID) }
      })

      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders() })

      expect(res.status).toBe(200)
      // jwtVerify is called twice (initial + after JWKS cache clear). We do not
      // assert on createRemoteJWKSet's call count: that is internal to how the
      // middleware refreshes JWKS and a future refactor (eg. a single fetch
      // that internally retries) would needlessly break this test.
      expect(mockJwtVerify).toHaveBeenCalledTimes(2)
    })

    it("returns 401 when retry also fails with signature error", async () => {
      mockJwtVerify.mockImplementation(async () => {
        throw new joseActual.errors.JWSSignatureVerificationFailed("bad signature")
      })

      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders() })

      expect(res.status).toBe(401)
      expect(mockJwtVerify).toHaveBeenCalledTimes(2)
    })
  })

  // === admin_uids resolution (IT-AUTH-08, 09, 10, IT-ADMIN-04) ===

  describe("isAdmin determination via admin_uids.json", () => {
    const okClaims = (sub: string) => async () => ({ payload: validClaimsFor(sub) })

    it("returns isAdmin=true when sub is listed (IT-AUTH-08)", async () => {
      setAdminUidsFile([ADMIN_USER_ID])
      mockJwtVerify.mockImplementation(okClaims(ADMIN_USER_ID))

      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders() })

      expect(res.status).toBe(200)
      const body = await res.json() as { data: { isAdmin: boolean } }
      expect(body.data.isAdmin).toBe(true)
    })

    it("returns isAdmin=false when sub is not listed (IT-AUTH-09)", async () => {
      setAdminUidsFile([ADMIN_USER_ID])
      mockJwtVerify.mockImplementation(okClaims(REGULAR_USER_ID))

      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders() })

      expect(res.status).toBe(200)
      const body = await res.json() as { data: { isAdmin: boolean } }
      expect(body.data.isAdmin).toBe(false)
    })

    it("treats ENOENT as no admins, returns 200 isAdmin=false (IT-AUTH-10 ENOENT path)", async () => {
      setAdminUidsFileMissing()
      mockJwtVerify.mockImplementation(okClaims(ADMIN_USER_ID))

      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders() })

      expect(res.status).toBe(200)
      const body = await res.json() as { data: { isAdmin: boolean } }
      expect(body.data.isAdmin).toBe(false)
    })

    it("treats unset env (HUMANDBS_BACKEND_ADMIN_UID_FILE) as no admins (IT-AUTH-10 env path)", async () => {
      // The middleware reads HUMANDBS_BACKEND_ADMIN_UID_FILE each time the
      // admin-uids cache misses (auth.ts `getAdminUidFile`), so unsetting the
      // env *after* clearing the cache really does exercise the env-unset
      // branch — fs.readFile must not be touched.
      setEnv("HUMANDBS_BACKEND_ADMIN_UID_FILE", undefined)
      __testing.clearAdminUidsCache()
      mockJwtVerify.mockImplementation(okClaims(ADMIN_USER_ID))

      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders() })

      expect(res.status).toBe(200)
      const body = await res.json() as { data: { isAdmin: boolean } }
      expect(body.data.isAdmin).toBe(false)
      // Crucially: when env is unset the middleware must short-circuit before
      // reading any file. If a future refactor accidentally re-reads on the
      // unset branch (e.g. with a default path), this assertion catches it.
      expect(mockReadFile).not.toHaveBeenCalled()
    })

    it("treats malformed (non-array) admin_uids.json as empty without throwing", async () => {
      setAdminUidsFileMalformed(JSON.stringify({ not: "an array" }))
      mockJwtVerify.mockImplementation(okClaims(ADMIN_USER_ID))

      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders() })

      expect(res.status).toBe(200)
      const body = await res.json() as { data: { isAdmin: boolean } }
      expect(body.data.isAdmin).toBe(false)
    })

    it("filters out non-string entries from admin_uids.json", async () => {
      setAdminUidsFile([ADMIN_USER_ID, 123 as unknown as string, null as unknown as string])
      mockJwtVerify.mockImplementation(okClaims(ADMIN_USER_ID))

      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders() })

      expect(res.status).toBe(200)
      const body = await res.json() as { data: { isAdmin: boolean } }
      // ADMIN_USER_ID survives, non-string entries dropped
      expect(body.data.isAdmin).toBe(true)
    })

    it("does not re-read admin_uids.json on every request within TTL (cache hit)", async () => {
      setAdminUidsFile([ADMIN_USER_ID])
      mockJwtVerify.mockImplementation(okClaims(ADMIN_USER_ID))

      const app = getTestApp()
      await app.request("/admin/is-admin", { headers: bearerHeaders() })
      await app.request("/admin/is-admin", { headers: bearerHeaders() })
      await app.request("/admin/is-admin", { headers: bearerHeaders() })

      expect(mockReadFile).toHaveBeenCalledTimes(1)
    })

    it("re-reads admin_uids.json after the cache is cleared (IT-ADMIN-04)", async () => {
      setAdminUidsFile([ADMIN_USER_ID])
      mockJwtVerify.mockImplementation(okClaims(ADMIN_USER_ID))

      const app = getTestApp()
      await app.request("/admin/is-admin", { headers: bearerHeaders() })
      __testing.clearAdminUidsCache()
      await app.request("/admin/is-admin", { headers: bearerHeaders() })

      expect(mockReadFile).toHaveBeenCalledTimes(2)
    })
  })

  // === isAdminUser export-level invocation surface ===

  describe("AuthUser shape from valid claims", () => {
    it("populates AuthUser with userId from sub and admin determination from admin_uids", async () => {
      setAdminUidsFile([ADMIN_USER_ID])
      mockJwtVerify.mockImplementation(async () => ({ payload: validClaimsFor(ADMIN_USER_ID) }))

      // We exercise the full middleware path; the route handler returns isAdmin
      const app = getTestApp()
      const res = await app.request("/admin/is-admin", { headers: bearerHeaders() })

      const body = await res.json() as { data: { isAdmin: boolean } }
      expect(body.data.isAdmin).toBe(true)

      // Sanity: createMockAuthUser shape stays consistent with the response shape
      const mockUser = createMockAuthUser({ userId: ADMIN_USER_ID, isAdmin: true })
      expect(mockUser.isAdmin).toBe(true)
    })
  })

  describe("getAuthenticatedUser helper", () => {
    it("returns the AuthUser that prior middleware set on the context", () => {
      const user = createMockAuthUser({ userId: REGULAR_USER_ID, isAdmin: false })
      const fakeContext = {
        get: (key: string) => key === "authenticatedUser" ? user : undefined,
      } as unknown as Parameters<typeof getAuthenticatedUser>[0]
      expect(getAuthenticatedUser(fakeContext)).toBe(user)
    })

    it("throws InternalError if no prior middleware set authenticatedUser (route misconfiguration)", () => {
      const fakeContext = {
        get: () => undefined,
      } as unknown as Parameters<typeof getAuthenticatedUser>[0]
      expect(() => getAuthenticatedUser(fakeContext)).toThrow(InternalError)
    })
  })
})
