/**
 * IT-WORKFLOW-*: Research state transitions (submit / approve / reject / unpublish).
 *
 * Reference: `tests/integration-scenarios.md § IT-WORKFLOW-*`.
 *
 * Mutating success-path scenarios (IT-WORKFLOW-01 submit, 04/05 approve, 08 reject,
 * 10 unpublish, 12 optimistic-lock, 15 dateModified monotonicity, 16 cycle) require
 * the isolation ES index. They are stubbed with skip notes here.
 *
 * What we cover without mutating state: 4xx guards (403 forbidden / 409 wrong status).
 * Hitting a transition endpoint with the wrong status returns 409 without changing the
 * underlying resource, so it is safe to run against shared ES.
 */
import { beforeAll, describe, expect } from "bun:test"

import type { SearchResponse } from "@/api/types"

import {
  authHeaders,
  getApp,
  itWithAdminToken,
  itWithNonAdminToken,
  setupIntegration,
  url,
} from "./setup"

beforeAll(setupIntegration)

interface ResearchSummary {
  humId: string
  status?: string
}

const pickPublishedHumId = async (): Promise<string | null> => {
  const app = getApp()
  const res = await app.request(url("/research?limit=1"))
  if (res.status !== 200) return null
  const json = (await res.json()) as SearchResponse<ResearchSummary>
  return json.data[0]?.humId ?? null
}

const pickDraftHumId = async (token: string): Promise<string | null> => {
  const app = getApp()
  const res = await app.request(url("/research?status=draft&limit=5"), { headers: authHeaders(token) })
  if (res.status !== 200) return null
  const json = (await res.json()) as SearchResponse<ResearchSummary>
  return json.data[0]?.humId ?? null
}

describe("IT-WORKFLOW-*: Research state transitions (4xx guards)", () => {
  itWithNonAdminToken("IT-WORKFLOW-02: submit by non-owner returns 403", async (token) => {
    // IT-WORKFLOW-02
    const humId = await pickPublishedHumId()
    if (!humId) {
      console.log("  SKIP IT-WORKFLOW-02: no Research in ES")
      return
    }
    const app = getApp()
    const res = await app.request(url(`/research/${humId}/submit`), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(403)
  })

  itWithAdminToken("IT-WORKFLOW-03: admin submit on published Research returns 409 (expected 'draft')", async (token) => {
    // IT-WORKFLOW-03
    const humId = await pickPublishedHumId()
    if (!humId) {
      console.log("  SKIP IT-WORKFLOW-03: no published Research")
      return
    }
    const app = getApp()
    const res = await app.request(url(`/research/${humId}/submit`), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(409)
    const json = (await res.json()) as { title?: string; detail?: string }
    expect(json.title).toBe("Conflict")
    expect(json.detail ?? "").toMatch(/draft/i)
  })

  itWithNonAdminToken("IT-WORKFLOW-06: approve by non-admin returns 403", async (token) => {
    // IT-WORKFLOW-06
    const humId = await pickPublishedHumId()
    if (!humId) {
      console.log("  SKIP IT-WORKFLOW-06: no Research in ES")
      return
    }
    const app = getApp()
    const res = await app.request(url(`/research/${humId}/approve`), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(403)
  })

  itWithAdminToken("IT-WORKFLOW-07: admin approve on non-review Research returns 409 (expected 'review')", async (token) => {
    // IT-WORKFLOW-07
    const app = getApp()
    const draftHumId = await pickDraftHumId(token)
    if (!draftHumId) {
      console.log("  SKIP IT-WORKFLOW-07: no draft Research visible to admin")
      return
    }
    const res = await app.request(url(`/research/${draftHumId}/approve`), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(409)
    const json = (await res.json()) as { title?: string; detail?: string }
    expect(json.title).toBe("Conflict")
    expect(json.detail ?? "").toMatch(/review/i)
  })

  itWithAdminToken("IT-WORKFLOW-09: admin reject on non-review Research returns 409", async (token) => {
    // IT-WORKFLOW-09
    const app = getApp()
    const draftHumId = await pickDraftHumId(token)
    if (!draftHumId) {
      console.log("  SKIP IT-WORKFLOW-09: no draft Research visible to admin")
      return
    }
    const res = await app.request(url(`/research/${draftHumId}/reject`), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(409)
  })

  itWithAdminToken("IT-WORKFLOW-11: admin unpublish on non-published Research returns 409", async (token) => {
    // IT-WORKFLOW-11
    const app = getApp()
    const draftHumId = await pickDraftHumId(token)
    if (!draftHumId) {
      console.log("  SKIP IT-WORKFLOW-11: no draft Research visible to admin")
      return
    }
    const res = await app.request(url(`/research/${draftHumId}/unpublish`), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(409)
  })

  // IT-WORKFLOW-01: submit success → mutating, isolation index 待ち
  // IT-WORKFLOW-04: approve success + datePublished 初回設定 → mutating
  // IT-WORKFLOW-05: approve は datePublished を保持 → mutating
  // IT-WORKFLOW-08: reject success → mutating
  // IT-WORKFLOW-10: unpublish success → mutating
  // IT-WORKFLOW-12: 楽観的ロック 409 → mutating
  // IT-WORKFLOW-13: unpublish 後 public 非表示 → mutating
  // IT-WORKFLOW-14: deleted Research 全 action 404 → deleted fixture 必要
  // IT-WORKFLOW-15: dateModified 単調増加 → mutating
  // IT-WORKFLOW-16: submit→reject→submit cycle → mutating
})
