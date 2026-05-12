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

import type { SearchResponse, SingleReadOnlyResponse } from "@/api/types"

import {
  approveResearch,
  createDatasetForResearch,
  createDraftResearch,
  purgeResearch,
  rejectResearch,
  setOwnerUids,
  submitForReview,
  unpublishResearch,
} from "./mutating-helpers"
import {
  authHeaders,
  decodeJwtSub,
  getApp,
  itWithAdminToken,
  itWithIsolationIndex,
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

  itWithIsolationIndex("IT-WORKFLOW-01: submit by owner moves draft to review", async ({ admin, nonAdmin }) => {
    // IT-WORKFLOW-01
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const beforeApp = getApp()
      const beforeRes = await beforeApp.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      const beforeJson = (await beforeRes.json()) as SingleReadOnlyResponse<{ dateModified?: string; latestVersion?: string | null; draftVersion?: string | null }>
      const beforeMod = Date.parse(beforeJson.data.dateModified ?? "1970-01-01")
      const after = await submitForReview(nonAdmin, humId)
      expect(after.status).toBe("review")
      const afterMod = Date.parse(after.dateModified ?? "1970-01-01")
      expect(afterMod).toBeGreaterThanOrEqual(beforeMod)
      // submit must not move the version pointers.
      const detail = await beforeApp.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      const detailJson = (await detail.json()) as SingleReadOnlyResponse<{ latestVersion?: string | null; draftVersion?: string | null }>
      expect(detailJson.data.latestVersion).toBe(beforeJson.data.latestVersion ?? null)
      expect(detailJson.data.draftVersion).toBe(beforeJson.data.draftVersion ?? null)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-WORKFLOW-04: approve moves review to published and sets datePublished/datasets pinned", async ({ admin, nonAdmin }) => {
    // IT-WORKFLOW-04
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const ds = await createDatasetForResearch(nonAdmin, humId)
      await submitForReview(nonAdmin, humId)
      const approved = await approveResearch(admin, humId)
      expect(approved.status).toBe("published")
      const app = getApp()
      const detail = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      const detailJson = (await detail.json()) as SingleReadOnlyResponse<{
        latestVersion?: string | null
        draftVersion?: string | null
        datePublished?: string | null
      }>
      expect(detailJson.data.latestVersion).toBe("v1")
      expect(detailJson.data.draftVersion).toBeNull()
      const today = new Date().toISOString().split("T")[0]
      expect(detailJson.data.datePublished).toBe(today)
      // The dataset's v1 should remain visible in its version list.
      const dsVersions = await app.request(url(`/dataset/${ds.datasetId}/versions`))
      const dsVersionsJson = (await dsVersions.json()) as SingleReadOnlyResponse<{ version: string }[]>
      expect(dsVersionsJson.data.map((v) => v.version)).toContain("v1")
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-WORKFLOW-05: second approve preserves the original datePublished", async ({ admin, nonAdmin }) => {
    // IT-WORKFLOW-05
    // After approve→unpublish→submit→approve the datePublished must equal the value set by the first approve.
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      const app = getApp()
      const firstDetail = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      const firstJson = (await firstDetail.json()) as SingleReadOnlyResponse<{ datePublished?: string | null }>
      const firstDatePublished = firstJson.data.datePublished
      expect(firstDatePublished).toBeTruthy()
      // Cycle: unpublish (draft) → submit (review) → approve (published) again
      await unpublishResearch(admin, humId)
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      const secondDetail = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      const secondJson = (await secondDetail.json()) as SingleReadOnlyResponse<{ datePublished?: string | null }>
      expect(secondJson.data.datePublished).toBe(firstDatePublished)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-WORKFLOW-08: admin reject moves review to draft (versions unchanged)", async ({ admin, nonAdmin }) => {
    // IT-WORKFLOW-08
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      await submitForReview(nonAdmin, humId)
      const app = getApp()
      const before = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      const beforeJson = (await before.json()) as SingleReadOnlyResponse<{ latestVersion?: string | null; draftVersion?: string | null }>
      const rejected = await rejectResearch(admin, humId)
      expect(rejected.status).toBe("draft")
      const after = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      const afterJson = (await after.json()) as SingleReadOnlyResponse<{ latestVersion?: string | null; draftVersion?: string | null }>
      expect(afterJson.data.latestVersion).toBe(beforeJson.data.latestVersion ?? null)
      expect(afterJson.data.draftVersion).toBe(beforeJson.data.draftVersion ?? null)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-WORKFLOW-10: admin unpublish moves latestVersion to draftVersion", async ({ admin, nonAdmin }) => {
    // IT-WORKFLOW-10
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      const app = getApp()
      const published = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      const publishedJson = (await published.json()) as SingleReadOnlyResponse<{ datePublished?: string | null }>
      const datePublishedBefore = publishedJson.data.datePublished
      const unpublished = await unpublishResearch(admin, humId)
      expect(unpublished.status).toBe("draft")
      const after = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      const afterJson = (await after.json()) as SingleReadOnlyResponse<{
        latestVersion?: string | null
        draftVersion?: string | null
        datePublished?: string | null
      }>
      expect(afterJson.data.latestVersion).toBeNull()
      expect(afterJson.data.draftVersion).toBe("v1")
      // datePublished is preserved across unpublish so a future approve doesn't reset it.
      expect(afterJson.data.datePublished).toBe(datePublishedBefore ?? null)
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-WORKFLOW-12: concurrent submits → exactly one wins, the other 409", async ({ admin, nonAdmin }) => {
    // IT-WORKFLOW-12
    // The workflow handler does not accept _seq_no in the body — it always reads from the
    // middleware-preloaded research. Two concurrent submits both see the same fresh research
    // (status=draft, seq=X). One succeeds; the other gets either an ES optimistic-lock 409
    // (seq mismatch on write) or a state-guard 409 (status is now "review" by the time the
    // second read happens). Either way, the SSOT 不変条件 "2 度目のリクエストが 409" holds.
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const app = getApp()
      const [a, b] = await Promise.all([
        app.request(url(`/research/${humId}/submit`), {
          method: "POST",
          headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
          body: "{}",
        }),
        app.request(url(`/research/${humId}/submit`), {
          method: "POST",
          headers: { ...authHeaders(nonAdmin), "Content-Type": "application/json" },
          body: "{}",
        }),
      ])
      const statuses = [a.status, b.status].sort()
      expect(statuses).toEqual([200, 409])
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-WORKFLOW-13: unpublished Research is 404 for public but visible to admin as draft", async ({ admin, nonAdmin }) => {
    // IT-WORKFLOW-13
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      await submitForReview(nonAdmin, humId)
      await approveResearch(admin, humId)
      await unpublishResearch(admin, humId)
      const app = getApp()
      const pub = await app.request(url(`/research/${humId}`))
      expect(pub.status).toBe(404)
      const adminGet = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      expect(adminGet.status).toBe(200)
      const adminJson = (await adminGet.json()) as SingleReadOnlyResponse<{ status?: string }>
      expect(adminJson.data.status).toBe("draft")
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-WORKFLOW-14: workflow actions on a deleted Research all return 404", async ({ admin }) => {
    // IT-WORKFLOW-14
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      const app = getApp()
      const del = await app.request(url(`/research/${humId}/delete`), {
        method: "POST",
        headers: authHeaders(admin),
      })
      expect(del.status).toBe(204)
      // After delete, every workflow action must 404 (loadResearchAndAuthorize stops it).
      for (const action of ["submit", "approve", "reject", "unpublish"] as const) {
        const res = await app.request(url(`/research/${humId}/${action}`), {
          method: "POST",
          headers: { ...authHeaders(admin), "Content-Type": "application/json" },
          body: "{}",
        })
        expect(res.status).toBe(404)
      }
      humId = "" // already deleted; nothing to clean up.
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-WORKFLOW-15: dateModified is non-decreasing across submit/approve/unpublish/submit", async ({ admin, nonAdmin }) => {
    // IT-WORKFLOW-15
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const stamps: number[] = []
      const recordFrom = (handle: { dateModified?: string }): void => {
        if (handle.dateModified) stamps.push(Date.parse(handle.dateModified))
      }
      recordFrom(await submitForReview(nonAdmin, humId))
      recordFrom(await approveResearch(admin, humId))
      recordFrom(await unpublishResearch(admin, humId))
      recordFrom(await submitForReview(nonAdmin, humId))
      expect(stamps).toHaveLength(4)
      for (let i = 1; i < stamps.length; i++) {
        expect(stamps[i]).toBeGreaterThanOrEqual(stamps[i - 1])
      }
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })

  itWithIsolationIndex("IT-WORKFLOW-16: submit→reject→submit cycle leaves Research in review with unchanged versions", async ({ admin, nonAdmin }) => {
    // IT-WORKFLOW-16
    const sub = decodeJwtSub(nonAdmin)
    expect(sub).toBeTruthy()
    let humId = ""
    try {
      const created = await createDraftResearch(admin)
      humId = created.humId
      await setOwnerUids(admin, humId, [sub!])
      const stamps: number[] = []
      const r1 = await submitForReview(nonAdmin, humId)
      stamps.push(Date.parse(r1.dateModified ?? "1970-01-01"))
      const r2 = await rejectResearch(admin, humId)
      stamps.push(Date.parse(r2.dateModified ?? "1970-01-01"))
      const r3 = await submitForReview(nonAdmin, humId)
      stamps.push(Date.parse(r3.dateModified ?? "1970-01-01"))
      const app = getApp()
      const detail = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
      const detailJson = (await detail.json()) as SingleReadOnlyResponse<{
        status?: string
        latestVersion?: string | null
        draftVersion?: string | null
      }>
      expect(detailJson.data.status).toBe("review")
      expect(detailJson.data.latestVersion).toBeNull()
      expect(detailJson.data.draftVersion).toBe("v1")
      for (let i = 1; i < stamps.length; i++) {
        expect(stamps[i]).toBeGreaterThanOrEqual(stamps[i - 1])
      }
    } finally {
      if (humId) await purgeResearch(admin, humId)
    }
  })
})
