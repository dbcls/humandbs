/**
 * IT-RESEARCH-*: Research CRUD + version resolution + linked Dataset listing.
 *
 * Reference: `tests/integration-scenarios.md § IT-RESEARCH-*`.
 *
 * Mutating scenarios (humId allocation, update, delete, uids update, linked Dataset create,
 * default-body create) require the isolation ES index discussed in the plan; they are stubbed
 * with skip notes here.
 */
import { beforeAll, describe, expect } from "bun:test"

import type { EsResearch, SearchResponse, SingleReadOnlyResponse } from "@/api/types"

import {
  authHeaders,
  getApp,
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
  latestVersion?: string | null
  draftVersion?: string | null
}

describe("IT-RESEARCH-*: Research CRUD & versioning", () => {
  itWithEs("IT-RESEARCH-01: GET /research returns only publicly visible items with summary-shape field set", async () => {
    // IT-RESEARCH-01
    // ResearchSummary list shape (empirical staging):
    //   - status === "published"
    //   - uids / draftVersion / latestVersion are omitted (the list is a lean summary)
    //   - `versions` is a non-empty array of `{ version, releaseDate }`
    const app = getApp()
    const res = await app.request(url("/research?page=1&limit=10"))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SearchResponse<ResearchSummary & { versions?: { version: string }[] }>
    for (const item of json.data) {
      expect(item.status).toBe("published")
      expect(item.uids).toBeUndefined()
      expect(item.draftVersion).toBeUndefined()
      expect(item.latestVersion).toBeUndefined()
      const versions = item.versions ?? []
      expect(versions.length).toBeGreaterThanOrEqual(1)
    }
  })

  itWithEs("IT-RESEARCH-02: public status filter (parametrize)", async () => {
    // IT-RESEARCH-02
    const app = getApp()
    const cases: { status: string; expected: number }[] = [
      { status: "published", expected: 200 },
      { status: "draft", expected: 403 },
      { status: "review", expected: 403 },
      { status: "deleted", expected: 403 },
    ]
    for (const c of cases) {
      const res = await app.request(url(`/research?status=${c.status}`))
      expect(res.status).toBe(c.expected)
      if (c.expected === 403) {
        const json = (await res.json()) as { title?: string }
        expect(json.title).toBe("Forbidden")
      }
    }
  })

  itWithNonAdminToken("IT-RESEARCH-03: authenticated status=draft restricts to own resources", async (token) => {
    // IT-RESEARCH-03
    // Same as IT-AUTH-17. We keep both because the SSOT maps one IT to one test and integration-scenarios.md
    // catalogs both. Invariant: every returned Research has the user's sub in `uids`.
    const app = getApp()
    const res = await app.request(url("/research?status=draft&limit=20"), { headers: authHeaders(token) })
    expect(res.status).toBe(200)
    // No further assertion here: IT-AUTH-17 owns the uids membership check.
  })

  itWithNonAdminToken("IT-RESEARCH-06: POST /research/new by non-admin authenticated returns 403", async (token) => {
    // IT-RESEARCH-06
    const app = getApp()
    const res = await app.request(url("/research/new"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(403)
    const json = (await res.json()) as { title?: string }
    expect(json.title).toBe("Forbidden")
  })

  itWithEs("IT-RESEARCH-08: public GET /research/{humId} resolves to a v<N> version with draftVersion=null", async () => {
    // IT-RESEARCH-08
    // Note: the list summary omits `latestVersion`, so we cannot directly compare detail.version to it.
    // The invariant is: detail.version is a `v<digits>` string, and draftVersion is null for the public view.
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-08: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<EsResearch & { version?: string }>
    expect(json.data.version).toMatch(/^v\d+$/)
    expect(json.data.draftVersion).toBeNull()
  })

  itWithEs("IT-RESEARCH-10: public ?version=<beyond-latest> returns 404", async () => {
    // IT-RESEARCH-10
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-10: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}?version=v999`))
    expect(res.status).toBe(404)
  })

  itWithEs("IT-RESEARCH-11: GET /research/{humId} omits internal `versionIds`", async () => {
    // IT-RESEARCH-11
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-11: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}`))
    const json = (await res.json()) as SingleReadOnlyResponse<EsResearch & { versionIds?: unknown }>
    expect(json.data.versionIds).toBeUndefined()
  })

  itWithNonAdminToken("IT-RESEARCH-19: POST /research/{humId}/delete by non-admin returns 403", async (token) => {
    // IT-RESEARCH-19
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-19: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}/delete`), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(403)
  })

  itWithNonAdminToken("IT-RESEARCH-22: PUT /research/{humId}/uids by non-admin returns 403", async (token) => {
    // IT-RESEARCH-22
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-22: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}/uids`), {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ uids: [], _seq_no: 0, _primary_term: 1 }),
    })
    expect(res.status).toBe(403)
  })

  itWithEs("IT-RESEARCH-23: GET /research/{humId}/dataset returns Dataset array for public when parent is published", async () => {
    // IT-RESEARCH-23
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-23: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}/dataset`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SearchResponse<{ datasetId: string; humId: string }>
    for (const d of json.data) {
      expect(d.humId).toBe(humId)
    }
  })

  itWithEs("IT-RESEARCH-26: includeRawHtml=true exposes rawHtml field on text values", async () => {
    // IT-RESEARCH-26
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-RESEARCH-26: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const [withRaw, withoutRaw] = await Promise.all([
      app.request(url(`/research/${humId}?includeRawHtml=true`)),
      app.request(url(`/research/${humId}`)),
    ])
    expect(withRaw.status).toBe(200)
    expect(withoutRaw.status).toBe(200)
    const withRawJson = (await withRaw.json()) as SingleReadOnlyResponse<{ summary?: { aims?: { ja?: object } } }>
    const withoutRawJson = (await withoutRaw.json()) as SingleReadOnlyResponse<{ summary?: { aims?: { ja?: object } } }>
    const aimsJaWith = (withRawJson.data.summary?.aims?.ja ?? {}) as Record<string, unknown>
    const aimsJaWithout = (withoutRawJson.data.summary?.aims?.ja ?? {}) as Record<string, unknown>
    // includeRawHtml=true: the object must expose a `rawHtml` property (value may be string or null).
    // includeRawHtml absent: the property must be stripped from the response.
    expect("rawHtml" in aimsJaWith).toBe(true)
    expect("rawHtml" in aimsJaWithout).toBe(false)
  })

  itWithAdminToken("IT-RESEARCH-loadResearchAndAuthorize-non-draft-404-for-unknown: admin gets 404 on unknown humId", async (token) => {
    // (cross-link with IT-AUTH-15; keeps research.test.ts self-contained.)
    const app = getApp()
    const res = await app.request(url("/research/__not_a_humId__"), { headers: authHeaders(token) })
    expect(res.status).toBe(404)
  })

  // IT-RESEARCH-04, 05, 07, 12, 13, 14, 15, 16, 17, 18, 20, 21, 24, 25, 27 (mutating) は隔離 ES index 設定後。
  // IT-RESEARCH-09 (owner view of draftVersion) は owner fixture 必要、隔離 index 設定後。
})
