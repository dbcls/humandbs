/**
 * IT-VERSION-*: Research/Dataset version endpoints.
 *
 * Reference: `tests/integration-scenarios.md § IT-VERSION-*`.
 *
 * Mutating scenarios (IT-VERSION-06, 07 success, 09, 10, 11, 12, 13, 14) require
 * the isolation ES index and admin/owner tokens. They are stubbed with skip notes.
 *
 * Multi-version Research is required for IT-VERSION-02 / 05 to assert the public
 * range restriction. We probe one from the live index via `setup.ts`; absence is
 * treated as a skip.
 */
import { beforeAll, describe, expect } from "bun:test"

import type { SearchResponse, SingleReadOnlyResponse } from "@/api/types"

import {
  authHeaders,
  getApp,
  getFixtures,
  itWithEs,
  itWithNonAdminToken,
  setupIntegration,
  url,
} from "./setup"

beforeAll(setupIntegration)

interface ResearchSummary {
  humId: string
  versionIds?: string[]
  latestVersion?: string | null
  draftVersion?: string | null
}

interface VersionListItem {
  version: string
  versionReleaseDate?: string
}

const parseNum = (v: string): number => Number(v.replace(/^v/, ""))

describe("IT-VERSION-*: Research/Dataset version endpoints", () => {
  itWithEs("IT-VERSION-01: GET /research/{humId}/versions returns a non-decreasing version array", async () => {
    // IT-VERSION-01
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-VERSION-01: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}/versions`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<VersionListItem[]>
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.data.length).toBeGreaterThanOrEqual(1)
    for (let i = 1; i < json.data.length; i++) {
      expect(parseNum(json.data[i - 1].version)).toBeLessThanOrEqual(parseNum(json.data[i].version))
    }
  })

  itWithEs("IT-VERSION-03: GET /research/{humId}/versions/{version} returns the requested version", async () => {
    // IT-VERSION-03
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-VERSION-03: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const versions = list.data[0].latestVersion
    if (!versions) {
      console.log("  SKIP IT-VERSION-03: no latestVersion on representative Research")
      return
    }
    const res = await app.request(url(`/research/${humId}/versions/${versions}`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<VersionListItem>
    expect(json.data.version).toBe(versions)
    // singleReadOnlyResponse must not expose _seq_no / _primary_term on the version sub-resource.
    const meta = json.meta as Record<string, unknown>
    expect(meta._seq_no).toBeUndefined()
    expect(meta._primary_term).toBeUndefined()
  })

  itWithEs("IT-VERSION-04: GET /research/{humId}/versions/v999 returns 404", async () => {
    // IT-VERSION-04
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-VERSION-04: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}/versions/v999`))
    expect(res.status).toBe(404)
  })

  itWithEs("IT-VERSION-05: public is restricted to latestVersion for direct ?version=v<beyond>", async () => {
    // IT-VERSION-05
    const fx = getFixtures()
    if (!fx.multiVersionHumId) {
      console.log("  SKIP IT-VERSION-05: no multi-version Research probed")
      return
    }
    const app = getApp()
    // Determine latestVersion: read the public detail to get the resolved version.
    const detail = (await (
      await app.request(url(`/research/${fx.multiVersionHumId}`))
    ).json()) as SingleReadOnlyResponse<{ latestVersion?: string | null }>
    const latest = detail.data.latestVersion
    if (!latest) {
      console.log("  SKIP IT-VERSION-05: probed Research has no latestVersion (unexpected)")
      return
    }
    const beyond = `v${parseNum(latest) + 1}`
    const res = await app.request(url(`/research/${fx.multiVersionHumId}/versions/${beyond}`))
    expect(res.status).toBe(404)
  })

  itWithNonAdminToken("IT-VERSION-08: POST /research/{humId}/versions/new by non-owner returns 403", async (token) => {
    // IT-VERSION-08
    const app = getApp()
    const listRes = await app.request(url("/research?limit=1"))
    const list = (await listRes.json()) as SearchResponse<ResearchSummary>
    if (list.data.length === 0) {
      console.log("  SKIP IT-VERSION-08: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const res = await app.request(url(`/research/${humId}/versions/new`), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(403)
  })

  // IT-VERSION-02: public は draftVersion を versions list から除外 → 専用 multi-version fixture が要、隔離 index で
  // IT-VERSION-06, 07: 新 version 作成 (success / non-published 409) → mutating
  // IT-VERSION-09, 10: Dataset version bump / 上書き → mutating
  // IT-VERSION-11: Dataset 新規追加で draft list 自動更新 → mutating
  // IT-VERSION-12: approve 時に Dataset version 確定 → mutating
  // IT-VERSION-13: 単調増加 → mutating
  // IT-VERSION-14: 楽観的ロック 409 → mutating
})
