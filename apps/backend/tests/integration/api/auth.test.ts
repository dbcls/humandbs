/**
 * IT-AUTH-*: authentication / authorization across the request lifecycle.
 *
 * Reference: `tests/integration-scenarios.md § IT-AUTH-*`.
 *
 * Skipped here (covered elsewhere or unfeasible in shared ES):
 *   IT-AUTH-04 / 05 / 06 — expired / wrong-issuer / wrong-audience JWTs (covered by
 *     `tests/unit/api/middleware/auth.test.ts`; producing such tokens against
 *     staging Keycloak is not deterministic).
 *   IT-AUTH-07 — JWKS rotation (unit test only).
 *   IT-AUTH-10 — admin_uids.json absent: would require restarting the app with a
 *     different env; covered by unit test.
 *   IT-AUTH-11 — owner success path: covered by `research.test.ts § IT-RESEARCH-12`
 *     (owner PUT /research/{humId}/update returns 200). The SSOT lists both IT-AUTH-11
 *     and IT-RESEARCH-12 for 1:1 traceability; the integration implementation lives in
 *     the research suite where the owned humId is provisioned via the isolation index.
 *   IT-AUTH-14 — deleted Research 404 for all users: covered in
 *     `research.test.ts § IT-RESEARCH-18` (mutating).
 */
import { beforeAll, describe, expect } from "bun:test"

import type { SearchResponse, SingleReadOnlyResponse } from "@/api/types"

import {
  authHeaders,
  decodeJwtSub,
  getApp,
  getNonAdminToken,
  itWithAdminToken,
  itWithEs,
  itWithNonAdminToken,
  setupIntegration,
  url,
} from "./setup"

beforeAll(setupIntegration)

interface ResearchSummary {
  humId: string
  status?: string
  uids?: string[]
  draftVersion?: string | null
  latestVersion?: string | null
}

interface IsAdminBody {
  isAdmin: boolean
}

describe("IT-AUTH-*: authentication & authorization", () => {
  // === Bearer token shape ===

  itWithEs("IT-AUTH-01: admin-required endpoint without bearer returns 401", async () => {
    // IT-AUTH-01
    const app = getApp()
    const res = await app.request(url("/research/new"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(401)
    const json = (await res.json()) as { title?: string }
    expect(json.title).toBe("Unauthorized")
  })

  itWithEs("IT-AUTH-02: optionalAuth endpoint without bearer returns 200 with public scope", async () => {
    // IT-AUTH-02
    // Public-scope invariants on the ResearchSummary list:
    //   - status === "published" (the only public-visible status)
    //   - uids / draftVersion / latestVersion are omitted from the list response shape
    //     (verified empirically against staging; the API trims them for lean payloads)
    //   - the `versions` array is non-empty (= the underlying Research has at least one published version)
    const app = getApp()
    const res = await app.request(url("/research?limit=20"))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SearchResponse<ResearchSummary & { versions?: { version: string }[] }>
    for (const item of json.data) {
      expect(item.status).toBe("published")
      expect(item.uids).toBeUndefined()
      expect(item.draftVersion).toBeUndefined()
      expect(item.latestVersion).toBeUndefined()
      const versions = (item as { versions?: { version: string }[] }).versions ?? []
      expect(versions.length).toBeGreaterThanOrEqual(1)
    }
  })

  itWithEs("IT-AUTH-03: malformed bearer (non-JWT string) returns 401", async () => {
    // IT-AUTH-03
    const app = getApp()
    const res = await app.request(url("/admin/is-admin"), {
      headers: { Authorization: "Bearer not.a.valid.jwt" },
    })
    expect(res.status).toBe(401)
    const json = (await res.json()) as { title?: string; detail?: string }
    expect(json.title).toBe("Unauthorized")
  })

  itWithEs("IT-AUTH-21: Authorization without 'Bearer' prefix returns 401", async () => {
    // IT-AUTH-21
    const app = getApp()
    const res = await app.request(url("/admin/is-admin"), {
      headers: { Authorization: "token-without-bearer-prefix" },
    })
    expect(res.status).toBe(401)
  })

  itWithEs("IT-AUTH-22: Authorization 'Bearer ' with empty token returns 401 (never 500)", async () => {
    // IT-AUTH-22
    const app = getApp()
    const res = await app.request(url("/admin/is-admin"), {
      headers: { Authorization: "Bearer " },
    })
    expect(res.status).toBe(401)
  })

  // === admin_uids judgement ===

  itWithAdminToken("IT-AUTH-08: admin sub from admin_uids.json yields isAdmin=true", async (token) => {
    // IT-AUTH-08
    const app = getApp()
    const res = await app.request(url("/admin/is-admin"), { headers: authHeaders(token) })
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<IsAdminBody>
    expect(json.data.isAdmin).toBe(true)
  })

  itWithNonAdminToken("IT-AUTH-09: non-admin sub yields isAdmin=false", async (token) => {
    // IT-AUTH-09
    const app = getApp()
    const res = await app.request(url("/admin/is-admin"), { headers: authHeaders(token) })
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<IsAdminBody>
    expect(json.data.isAdmin).toBe(false)
  })

  // === requireOwnership / requireAdmin / loadResearchAndAuthorize ===

  itWithNonAdminToken("IT-AUTH-12: requireOwnership rejects non-owner non-admin with 403", async (token) => {
    // IT-AUTH-12
    // Public Research necessarily has empty `uids`, so a non-admin authenticated user can never own one.
    // → Updating a published Research via owner-required PUT must be a 403 (the underlying status check
    // would be 409, but the authorization guard fires first per the route's middleware order).
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-AUTH-12: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}/update`), {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(403)
    const json = (await res.json()) as { title?: string }
    expect(json.title).toBe("Forbidden")
  })

  itWithNonAdminToken("IT-AUTH-13: requireAdmin rejects non-admin with 403", async (token) => {
    // IT-AUTH-13
    const app = getApp()
    const res = await app.request(url("/research/hum0001/approve"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(403)
  })

  itWithAdminToken("IT-AUTH-15: loadResearchAndAuthorize 404s on unknown humId (even for admin)", async (token) => {
    // IT-AUTH-15
    const app = getApp()
    const res = await app.request(url("/research/__not_a_humId__/update"), {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(404)
    const json = (await res.json()) as { title?: string }
    expect(json.title).toBe("Not Found")
  })

  // === status filter permission ===

  itWithEs("IT-AUTH-16: GET /research?status=draft is 403 for public", async () => {
    // IT-AUTH-16
    const app = getApp()
    const res = await app.request(url("/research?status=draft"))
    expect(res.status).toBe(403)
    const json = (await res.json()) as { title?: string }
    expect(json.title).toBe("Forbidden")

    const ok = await app.request(url("/research?status=published"))
    expect(ok.status).toBe(200)
  })

  itWithNonAdminToken("IT-AUTH-17: GET /research?status=draft restricts authenticated users to own resources", async (token) => {
    // IT-AUTH-17
    // Public users get 403 (IT-AUTH-16). Authenticated users get 200, but the result must be restricted
    // to Research whose `uids` includes the calling user's sub. We accept an empty result (the staging
    // user may not own anything) but verify the membership invariant on every returned item.
    const self = decodeJwtSub(token)
    if (!self) {
      console.log("  SKIP IT-AUTH-17: could not decode sub from non-admin token")
      return
    }
    const app = getApp()
    const res = await app.request(url("/research?status=draft&limit=20"), { headers: authHeaders(token) })
    expect(res.status).toBe(200)
    const json = (await res.json()) as SearchResponse<ResearchSummary>
    for (const item of json.data) {
      expect(item.uids ?? []).toContain(self)
    }
  })

  // === Value-based field control ===

  itWithEs("IT-AUTH-18: public detail responds with status='published', uids=[], draftVersion=null", async () => {
    // IT-AUTH-18
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-AUTH-18: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<ResearchSummary> & {
      meta: { _seq_no?: number; _primary_term?: number }
    }
    expect(json.data.status).toBe("published")
    expect(json.data.uids).toEqual([])
    expect(json.data.draftVersion).toBeNull()
    expect(typeof json.meta._seq_no).toBe("number")
    expect(typeof json.meta._primary_term).toBe("number")
  })

  itWithAdminToken("IT-AUTH-19: admin detail of a draft Research returns the real status / uids / draftVersion", async (token) => {
    // IT-AUTH-19
    // Pull a draft Research that admin can see. If staging has none, skip.
    const app = getApp()
    const draftRes = await app.request(url("/research?status=draft&limit=20"), { headers: authHeaders(token) })
    expect(draftRes.status).toBe(200)
    const drafts = (await draftRes.json()) as SearchResponse<ResearchSummary>
    if (drafts.data.length === 0) {
      console.log("  SKIP IT-AUTH-19: no draft Research visible to admin")
      return
    }
    const draftHumId = drafts.data[0].humId
    const detail = await app.request(url(`/research/${draftHumId}`), { headers: authHeaders(token) })
    expect(detail.status).toBe(200)
    const json = (await detail.json()) as SingleReadOnlyResponse<ResearchSummary>
    expect(json.data.status).toBe("draft")
    expect(Array.isArray(json.data.uids)).toBe(true)
    // draftVersion may be null only on a freshly-created Research; on most drafts it is "v<N>".
    if (json.data.draftVersion !== null) {
      expect(typeof json.data.draftVersion).toBe("string")
    }
  })

  itWithNonAdminToken("IT-AUTH-20: authenticated list response includes the `status` field per item", async (token) => {
    // IT-AUTH-20
    // The list response shape changes when authenticated: each summary item carries `status` (no value
    // masking) so the UI can render badges. Public responses keep the field but with the value-based
    // masking; this test asserts the field is present and that values fall in the documented enum.
    const app = getApp()
    const res = await app.request(url("/research?limit=10"), { headers: authHeaders(token) })
    expect(res.status).toBe(200)
    const json = (await res.json()) as SearchResponse<ResearchSummary>
    const STATUSES = new Set(["draft", "review", "published"])
    for (const item of json.data) {
      expect(typeof item.status).toBe("string")
      expect(STATUSES.has(item.status ?? "")).toBe(true)
    }
  })

  itWithEs("IT-AUTH-non-admin-token-unavailable-noop: scaffold for skip messaging", async () => {
    // Smoke check that the optional-token plumbing does not crash when token env is missing.
    const token = getNonAdminToken()
    if (token) {
      const sub = decodeJwtSub(token)
      expect(typeof sub === "string" || sub === null).toBe(true)
    }
  })
})
